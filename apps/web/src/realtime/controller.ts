import type {
  AckEnvelope,
  AckSuccess,
  ChatMessage,
  ClientToServerEvents,
  ContractError,
  CreateRoomRequest,
  CustomThemeInput,
  DrawingBatchRequest,
  DrawingBatchResult,
  EmptySuccess,
  GuessFeedback,
  JoinRoomRequest,
  KickPlayerRequest,
  LeaveRoomRequest,
  PlayerProfile,
  PlayerRoomSnapshot,
  ReplayState,
  RoomMutationResult,
  RoomSettings,
  SelectWordRequest,
  ServerToClientEvents,
  SessionCredentials,
  SessionEstablished,
  StartMatchRequest,
  UpdateProfileRequest,
  UpdateSettingsRequest,
} from "@gtd/contracts";

import {
  createRoomStore,
  roomStore,
  selectLastDrawingSequence,
  type EventApplyResult,
  type RealtimeClientIssue,
  type RoomStoreApi,
  type StoredRoomSession,
} from "../state/room-store";
import type {
  RoomCredentialHooks,
  RoomCredentialPersistence,
} from "../state/session-persistence";
import {
  createGameSocket,
  createMutationMeta,
  type GameSocket,
} from "./client";

type ClientEventName = keyof ClientToServerEvents;
type RequestFor<Event extends ClientEventName> =
  Parameters<ClientToServerEvents[Event]>[0];
type AckFor<Event extends ClientEventName> =
  Parameters<ClientToServerEvents[Event]>[1] extends (
    response: infer Response,
  ) => void
    ? Response
    : never;
type DataFor<Event extends ClientEventName> =
  AckFor<Event> extends AckEnvelope<infer Data> ? Data : never;

type CreateRoomInput = Omit<CreateRoomRequest, "mutation">;
type JoinRoomInput = Omit<JoinRoomRequest, "mutation">;
type UpdateSettingsInput = Omit<UpdateSettingsRequest, "mutation">;
type DrawingBatchInput = Omit<DrawingBatchRequest, "mutation">;

type DrawingSource = "live" | "replay" | "snapshot";

export interface RoomRealtimeControllerOptions {
  socket?: GameSocket;
  store?: RoomStoreApi;
  persistence?: RoomCredentialPersistence;
  credentialHooks?: RoomCredentialHooks;
  ackTimeoutMs?: number;
  onSnapshot?: (
    snapshot: PlayerRoomSnapshot,
    source: "session" | "snapshot" | "resync" | "turn" | "match",
  ) => void;
  onDrawingEnvelopes?: (
    envelopes: ReplayState["operations"],
    source: DrawingSource,
  ) => void;
  onDrawingReset?: (
    turnId: string,
    throughSequence: number,
  ) => void;
}

type RequestErrorCode =
  | "ACK_TIMEOUT"
  | "CONTROLLER_STOPPED"
  | "MISSING_CREDENTIALS"
  | string;

export class RealtimeRequestError extends Error {
  readonly code: RequestErrorCode;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, unknown>> | null;

  constructor(
    code: RequestErrorCode,
    message: string,
    retryable: boolean,
    details: Readonly<Record<string, unknown>> | null = null,
  ) {
    super(message);
    this.name = "RealtimeRequestError";
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }

  static fromContract(error: ContractError): RealtimeRequestError {
    return new RealtimeRequestError(
      error.code,
      error.message,
      error.retryable,
      error.details ?? null,
    );
  }

  toIssue(): RealtimeClientIssue {
    return {
      code: this.code,
      message: this.message,
      retryable: this.retryable,
      details: this.details,
    };
  }
}

interface PendingAck {
  timer: ReturnType<typeof setTimeout>;
  reject: (error: RealtimeRequestError) => void;
  settled: boolean;
}

const TERMINAL_RESUME_ERRORS = new Set([
  "ROOM_NOT_FOUND",
  "ROOM_EXPIRED",
  "KICKED",
  "UNAUTHORIZED",
]);

export class RoomRealtimeController {
  readonly socket: GameSocket;
  readonly store: RoomStoreApi;

  private readonly persistence: RoomCredentialPersistence | undefined;
  private readonly credentialHooks: RoomCredentialHooks | undefined;
  private readonly ackTimeoutMs: number;
  private readonly onSnapshot:
    | RoomRealtimeControllerOptions["onSnapshot"]
    | undefined;
  private readonly onDrawingEnvelopes:
    | RoomRealtimeControllerOptions["onDrawingEnvelopes"]
    | undefined;
  private readonly onDrawingReset:
    | RoomRealtimeControllerOptions["onDrawingReset"]
    | undefined;
  private readonly pendingAcks = new Set<PendingAck>();

  private started = false;
  private stopped = false;
  private resyncPromise: Promise<PlayerRoomSnapshot> | null = null;
  private replayPromise: Promise<ReplayState> | null = null;
  private resumePromise: Promise<SessionEstablished> | null = null;

  constructor(options: RoomRealtimeControllerOptions = {}) {
    this.socket = options.socket ?? createGameSocket();
    this.store = options.store ?? roomStore;
    this.persistence = options.persistence;
    this.credentialHooks = options.credentialHooks;
    this.ackTimeoutMs = options.ackTimeoutMs ?? 8_000;
    this.onSnapshot = options.onSnapshot;
    this.onDrawingEnvelopes = options.onDrawingEnvelopes;
    this.onDrawingReset = options.onDrawingReset;
  }

  start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.stopped = false;
    this.bindSocket();
    this.store.getState().setConnection("connecting");
    if (this.socket.connected) {
      this.handleConnect();
    } else {
      this.socket.connect();
    }
  }

  stop(disconnect = true): void {
    if (!this.started && this.stopped) {
      return;
    }
    this.started = false;
    this.stopped = true;
    this.unbindSocket();
    const error = new RealtimeRequestError(
      "CONTROLLER_STOPPED",
      "The realtime controller was stopped.",
      false,
    );
    for (const pending of this.pendingAcks) {
      if (!pending.settled) {
        pending.settled = true;
        clearTimeout(pending.timer);
        this.store.getState().endRequest();
        pending.reject(error);
      }
    }
    this.pendingAcks.clear();
    this.resyncPromise = null;
    this.replayPromise = null;
    this.resumePromise = null;
    if (disconnect && this.socket.connected) {
      this.socket.disconnect();
    }
    this.store.getState().setConnection("idle");
  }

  async createRoom(input: CreateRoomInput): Promise<SessionEstablished> {
    this.ensureStarted();
    this.store.getState().setSessionStatus("creating");
    try {
      const ack = await this.emitAck("room:create", {
        ...input,
        mutation: createMutationMeta(),
      });
      await this.acceptEstablishedSession(ack.data, "session");
      return ack.data;
    } catch (error) {
      if (!this.store.getState().room) {
        this.store.getState().setSessionStatus("none");
      }
      throw error;
    }
  }

  async joinRoom(input: JoinRoomInput): Promise<SessionEstablished> {
    this.ensureStarted();
    this.store.getState().setSessionStatus("joining");
    try {
      const ack = await this.emitAck("room:join", {
        ...input,
        mutation: createMutationMeta(),
      });
      await this.acceptEstablishedSession(ack.data, "session");
      return ack.data;
    } catch (error) {
      if (!this.store.getState().room) {
        this.store.getState().setSessionStatus("none");
      }
      throw error;
    }
  }

  async resumeRoom(
    roomCode: string,
    credentials?: SessionCredentials,
  ): Promise<SessionEstablished> {
    this.ensureStarted();
    let resolvedCredentials = credentials ?? null;
    if (!resolvedCredentials && this.persistence) {
      try {
        resolvedCredentials = await this.persistence.load(roomCode);
      } catch (error) {
        this.credentialHooks?.onPersistenceError?.(
          error,
          "load",
        );
      }
    }
    if (!resolvedCredentials) {
      const error = new RealtimeRequestError(
        "MISSING_CREDENTIALS",
        "No reconnect credentials are available for this room.",
        false,
      );
      this.store.getState().setError(error.toIssue());
      throw error;
    }

    this.store.getState().setSession({
      roomCode,
      credentials: resolvedCredentials,
    });
    return this.resumeCurrentSession();
  }

  async leaveRoom(): Promise<void> {
    this.ensureStarted();
    const session = this.store.getState().session;
    this.store.getState().setSessionStatus("leaving");
    try {
      await this.emitAck("room:leave", {
        mutation: createMutationMeta(this.currentRevision()),
      });
      if (session) {
        await this.clearPersistedSession(session);
      }
      this.store.getState().clearRoom();
    } catch (error) {
      this.store
        .getState()
        .setSessionStatus(
          this.store.getState().room ? "in-room" : "none",
        );
      throw error;
    }
  }

  async updateProfile(
    profile: PlayerProfile,
  ): Promise<RoomMutationResult> {
    const request: UpdateProfileRequest = {
      mutation: createMutationMeta(this.currentRevision()),
      profile,
    };
    const ack = await this.emitAck("room:profile:update", request);
    this.applyMutationSnapshot(ack.data);
    return ack.data;
  }

  async updateSettings(
    settings: RoomSettings,
    customTheme?: CustomThemeInput,
  ): Promise<RoomMutationResult> {
    const request: UpdateSettingsInput = customTheme
      ? { settings, customTheme }
      : { settings };
    const ack = await this.emitAck("room:settings:update", {
      ...request,
      mutation: createMutationMeta(this.currentRevision()),
    });
    this.applyMutationSnapshot(ack.data);
    return ack.data;
  }

  async kickPlayer(playerId: string): Promise<RoomMutationResult> {
    const request: KickPlayerRequest = {
      mutation: createMutationMeta(this.currentRevision()),
      playerId,
    };
    const ack = await this.emitAck("room:kick", request);
    this.applyMutationSnapshot(ack.data);
    return ack.data;
  }

  async startMatch(): Promise<RoomMutationResult> {
    const request: StartMatchRequest = {
      mutation: createMutationMeta(this.currentRevision()),
    };
    const ack = await this.emitAck("match:start", request);
    this.applyMutationSnapshot(ack.data);
    return ack.data;
  }

  async selectWord(
    turnId: string,
    choiceIndex: number,
  ): Promise<RoomMutationResult> {
    const request: SelectWordRequest = {
      mutation: createMutationMeta(this.currentRevision()),
      turnId,
      choiceIndex,
    };
    const ack = await this.emitAck("round:select-word", request);
    this.applyMutationSnapshot(ack.data);
    return ack.data;
  }

  async sendDrawingBatch(
    input: DrawingBatchInput,
  ): Promise<DrawingBatchResult> {
    const ack = await this.emitAck("drawing:batch", {
      ...input,
      // A room revision is an observation cursor, not a safe precondition for
      // high-frequency events that legitimately overlap. Turn/chunk identity
      // and idempotency provide drawing order.
      mutation: createMutationMeta(),
    });
    const result = this.store
      .getState()
      .acknowledgeRevision(ack.data.revision);
    this.handleApplyResult(result);
    return ack.data;
  }

  async sendChat(text: string): Promise<ChatMessage> {
    const ack = await this.emitAck("chat:send", {
      mutation: createMutationMeta(),
      text,
    });
    const result = this.store.getState().applyChatMessage({
      revision: ack.data.roomRevision,
      message: ack.data,
    });
    this.handleApplyResult(result);
    return ack.data;
  }

  async submitGuess(
    turnId: string,
    text: string,
  ): Promise<GuessFeedback> {
    const mutation = createMutationMeta();
    const ack = await this.emitAck("guess:submit", {
      mutation,
      turnId,
      text,
    });
    const revision =
      ack.meta.revision ?? this.store.getState().room?.revision ?? 0;
    const result = this.store.getState().applyGuessFeedback({
      revision,
      feedbackId: ack.meta.idempotencyId ?? mutation.idempotencyId,
      feedback: ack.data,
    });
    this.handleApplyResult(result);
    return ack.data;
  }

  requestSnapshot(): Promise<PlayerRoomSnapshot> {
    if (this.resyncPromise) {
      return this.resyncPromise;
    }
    const state = this.store.getState();
    const lastRoomRevision = state.room?.revision;
    const lastDrawingSequence = selectLastDrawingSequence(state);
    state.beginResync();
    const request =
      lastRoomRevision === undefined
        ? {}
        : { lastRoomRevision, lastDrawingSequence };

    this.resyncPromise = this.emitAck("snapshot:request", request)
      .then((ack) => {
        const result = this.store.getState().applySnapshot(ack.data);
        if (result === "applied") {
          this.notifySnapshot(ack.data, "resync");
        }
        return ack.data;
      })
      .catch((error: unknown) => {
        const current = this.store.getState();
        const revision = current.room?.revision ?? 0;
        current.markDesynced(
          current.revisionGap?.expected ?? revision + 1,
          current.revisionGap?.received ?? revision + 1,
        );
        throw error;
      })
      .finally(() => {
        this.resyncPromise = null;
      });
    return this.resyncPromise;
  }

  requestDrawingReplay(
    turnId: string,
    afterSequence = selectLastDrawingSequence(this.store.getState()),
  ): Promise<ReplayState> {
    if (this.replayPromise) {
      return this.replayPromise;
    }
    this.store.getState().beginDrawingReplay(afterSequence);
    this.replayPromise = this.emitAck("drawing:replay", {
      turnId,
      afterSequence,
    })
      .then((ack) => {
        const before = selectLastDrawingSequence(this.store.getState());
        const result = this.store.getState().applyReplay(ack.data);
        if (result === "applied") {
          this.onDrawingEnvelopes?.(
            ack.data.operations.filter(
              (operation) => operation.serverSequence > before,
            ),
            "replay",
          );
        } else if (result === "drawing-gap") {
          void this.requestSnapshot().catch(() => undefined);
        }
        return ack.data;
      })
      .catch((error: unknown) => {
        this.store.getState().markDrawingGap(afterSequence);
        throw error;
      })
      .finally(() => {
        this.replayPromise = null;
      });
    return this.replayPromise;
  }

  private currentRevision(): number | undefined {
    return this.store.getState().room?.revision;
  }

  private ensureStarted(): void {
    if (this.stopped) {
      throw new RealtimeRequestError(
        "CONTROLLER_STOPPED",
        "The realtime controller has been stopped.",
        false,
      );
    }
    if (!this.started) {
      this.start();
    }
  }

  private async acceptEstablishedSession(
    established: SessionEstablished,
    source: "session" | "resync",
  ): Promise<void> {
    const applied = this.store
      .getState()
      .establishSession(established);
    if (applied !== "applied") {
      const error = new RealtimeRequestError(
        "SESSION_MISMATCH",
        "The server returned a session for a different player.",
        false,
      );
      this.store.getState().setError(error.toIssue());
      throw error;
    }
    this.store.getState().setConnection(
      "connected",
      established.recovered ? "Session recovered." : null,
    );
    const session = this.store.getState().session;
    if (session) {
      await this.persistEstablishedSession(session);
    }
    this.notifySnapshot(established.snapshot, source);
  }

  private resumeCurrentSession(): Promise<SessionEstablished> {
    if (this.resumePromise) {
      return this.resumePromise;
    }
    const session = this.store.getState().session;
    if (!session) {
      return Promise.reject(
        new RealtimeRequestError(
          "MISSING_CREDENTIALS",
          "No reconnect credentials are available.",
          false,
        ),
      );
    }
    this.store.getState().setSessionStatus("resuming");
    this.store
      .getState()
      .setConnection("recovering", "Restoring your room…");
    const room = this.store.getState().room;
    const request = {
      code: session.roomCode,
      credentials: session.credentials,
      ...(room
        ? {
            lastRoomRevision: room.revision,
            lastDrawingSequence: selectLastDrawingSequence(
              this.store.getState(),
            ),
          }
        : {}),
    };

    this.resumePromise = this.emitAck("session:resume", request)
      .then(async (ack) => {
        await this.acceptEstablishedSession(ack.data, "session");
        return ack.data;
      })
      .catch(async (error: unknown) => {
        if (
          error instanceof RealtimeRequestError &&
          TERMINAL_RESUME_ERRORS.has(error.code)
        ) {
          await this.clearPersistedSession(session);
          this.store
            .getState()
            .clearRoom(error.code === "KICKED" ? "kicked" : "none");
          this.store.getState().setConnection("connected");
          this.store.getState().setError(error.toIssue());
        } else {
          this.store
            .getState()
            .setSessionStatus(
              this.store.getState().room ? "in-room" : "resuming",
            );
          this.store.getState().setConnection(
            "offline",
            "Unable to restore the room yet.",
          );
        }
        throw error;
      })
      .finally(() => {
        this.resumePromise = null;
      });
    return this.resumePromise;
  }

  private applyMutationSnapshot(result: RoomMutationResult): void {
    if (!result.snapshot) {
      return;
    }
    const applied = this.store.getState().applySnapshot(result.snapshot);
    if (applied === "applied") {
      this.notifySnapshot(result.snapshot, "snapshot");
    }
  }

  private notifySnapshot(
    snapshot: PlayerRoomSnapshot,
    source: "session" | "snapshot" | "resync" | "turn" | "match",
  ): void {
    const stored = this.store.getState().room;
    if (!stored || stored.revision !== snapshot.revision) {
      return;
    }
    this.onSnapshot?.(stored, source);
    if (stored.drawing?.operations.length) {
      this.onDrawingEnvelopes?.(
        stored.drawing.operations,
        "snapshot",
      );
    }
  }

  private handleApplyResult(result: EventApplyResult): void {
    if (result === "gap") {
      void this.requestSnapshot().catch(() => undefined);
    }
  }

  private async persistEstablishedSession(
    session: StoredRoomSession,
  ): Promise<void> {
    if (this.persistence) {
      try {
        await this.persistence.save(session);
      } catch (error) {
        this.credentialHooks?.onPersistenceError?.(
          error,
          "save",
        );
      }
    }
    if (this.credentialHooks?.onEstablished) {
      try {
        await this.credentialHooks.onEstablished(session);
      } catch (error) {
        this.credentialHooks.onPersistenceError?.(error, "save");
      }
    }
  }

  private async clearPersistedSession(
    session: StoredRoomSession,
  ): Promise<void> {
    if (this.persistence) {
      try {
        await this.persistence.clear(session.roomCode);
      } catch (error) {
        this.credentialHooks?.onPersistenceError?.(
          error,
          "clear",
        );
      }
    }
    if (this.credentialHooks?.onCleared) {
      try {
        await this.credentialHooks.onCleared(session);
      } catch (error) {
        this.credentialHooks.onPersistenceError?.(error, "clear");
      }
    }
  }

  private emitAck<Event extends ClientEventName>(
    event: Event,
    request: RequestFor<Event>,
  ): Promise<AckSuccess<DataFor<Event>>> {
    this.ensureStarted();
    this.store.getState().beginRequest();
    return new Promise<AckSuccess<DataFor<Event>>>((resolve, reject) => {
      const pending: PendingAck = {
        settled: false,
        reject,
        timer: setTimeout(() => {
          if (pending.settled) {
            return;
          }
          pending.settled = true;
          this.pendingAcks.delete(pending);
          this.store.getState().endRequest();
          const error = new RealtimeRequestError(
            "ACK_TIMEOUT",
            `The server did not acknowledge ${event} in time.`,
            true,
          );
          this.store.getState().setError(error.toIssue());
          reject(error);
        }, this.ackTimeoutMs),
      };
      this.pendingAcks.add(pending);

      const acknowledge = (response: AckFor<Event>) => {
        if (pending.settled || this.stopped) {
          return;
        }
        pending.settled = true;
        clearTimeout(pending.timer);
        this.pendingAcks.delete(pending);
        this.store.getState().endRequest();
        const envelope = response as AckEnvelope<DataFor<Event>>;
        this.store.getState().syncServerTime(envelope.meta.serverTime);
        if (!envelope.ok) {
          const error = RealtimeRequestError.fromContract(
            envelope.error,
          );
          this.store.getState().setError(error.toIssue());
          reject(error);
          return;
        }
        resolve(envelope);
      };

      const emit = this.socket.emit as unknown as (
        eventName: Event,
        payload: RequestFor<Event>,
        ack: (response: AckFor<Event>) => void,
      ) => GameSocket;
      try {
        emit.call(this.socket, event, request, acknowledge);
      } catch (cause) {
        if (!pending.settled) {
          pending.settled = true;
          clearTimeout(pending.timer);
          this.pendingAcks.delete(pending);
          this.store.getState().endRequest();
        }
        const error = new RealtimeRequestError(
          "CLIENT_EMIT_ERROR",
          cause instanceof Error
            ? cause.message
            : `Unable to send ${event}.`,
          true,
        );
        this.store.getState().setError(error.toIssue());
        reject(error);
      }
    });
  }

  private readonly handleConnect = () => {
    if (!this.started) {
      return;
    }
    const state = this.store.getState();
    const shouldResume =
      state.session !== null &&
      (state.sessionStatus === "in-room" ||
        state.sessionStatus === "resuming");
    state.setConnection("connected");
    if (shouldResume) {
      void this.resumeCurrentSession().catch(() => undefined);
    }
  };

  private readonly handleDisconnect = (reason: string) => {
    if (!this.started) {
      return;
    }
    const intentional = reason === "io client disconnect";
    this.store
      .getState()
      .setConnection(
        intentional ? "idle" : "recovering",
        intentional ? null : "Connection lost. Reconnecting…",
      );
  };

  private readonly handleConnectError = (error: Error) => {
    if (!this.started) {
      return;
    }
    this.store
      .getState()
      .setConnection("offline", error.message || "Server unavailable.");
    this.store.getState().setError({
      code: "SERVER_UNAVAILABLE",
      message: error.message || "Unable to reach the game server.",
      retryable: true,
      details: null,
    });
  };

  private readonly handleConnectionState: ServerToClientEvents["connection:state"] =
    (event) => {
      this.store.getState().applyConnectionEvent(event);
    };

  private readonly handleSnapshot: ServerToClientEvents["room:snapshot"] =
    (snapshot) => {
      const result = this.store.getState().applySnapshot(snapshot);
      if (result === "applied") {
        this.notifySnapshot(snapshot, "snapshot");
      }
    };

  private readonly handleRoomError: ServerToClientEvents["room:error"] =
    (error) => {
      this.store.getState().setError(error);
    };

  private readonly handlePlayerJoined: ServerToClientEvents["room:player-joined"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyPlayerJoined(event),
      );
    };

  private readonly handlePlayerUpdated: ServerToClientEvents["room:player-updated"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyPlayerUpdated(event),
      );
    };

  private readonly handlePlayerLeft: ServerToClientEvents["room:player-left"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyPlayerLeft(event),
      );
    };

  private readonly handleHostTransferred: ServerToClientEvents["room:host-transferred"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyHostTransferred(event),
      );
    };

  private readonly handleSettingsUpdated: ServerToClientEvents["room:settings-updated"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applySettingsUpdated(event),
      );
    };

  private readonly handleKicked: ServerToClientEvents["room:kicked"] =
    (event) => {
      const session = this.store.getState().session;
      const result = this.store.getState().applyKicked(event);
      if (result === "applied" && session) {
        void this.clearPersistedSession(session);
      }
    };

  private readonly handleRoundEvent: ServerToClientEvents["round:started"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyRoundEvent(event),
      );
    };

  private readonly handlePrivateRound: ServerToClientEvents["round:private"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyPrivateRound(event),
      );
    };

  private readonly handleTurnEnded: ServerToClientEvents["round:ended"] =
    (event) => {
      const result = this.store.getState().applyTurnEnded(event);
      if (result === "applied") {
        const room = this.store.getState().room;
        if (room) {
          this.notifySnapshot(room, "turn");
        }
      } else {
        this.handleApplyResult(result);
      }
    };

  private readonly handleMatchFinished: ServerToClientEvents["match:finished"] =
    (event) => {
      const result = this.store.getState().applyMatchFinished(event);
      if (result === "applied") {
        this.notifySnapshot(event.snapshot, "match");
      } else {
        this.handleApplyResult(result);
      }
    };

  private readonly handleDrawingBatch: ServerToClientEvents["drawing:batch"] =
    (event) => {
      const before = selectLastDrawingSequence(this.store.getState());
      const result = this.store.getState().applyDrawingBatch(event);
      if (result === "applied") {
        this.onDrawingEnvelopes?.(
          event.envelopes.filter(
            (envelope) => envelope.serverSequence > before,
          ),
          "live",
        );
      } else if (result === "drawing-gap") {
        const turnId = this.store.getState().room?.round?.turnId;
        if (turnId) {
          void this.requestDrawingReplay(turnId, before).catch(
            () => undefined,
          );
        }
      } else {
        this.handleApplyResult(result);
      }
    };

  private readonly handleDrawingReset: ServerToClientEvents["drawing:reset"] =
    (event) => {
      const result = this.store.getState().applyDrawingReset(event);
      if (result === "applied") {
        this.onDrawingReset?.(event.turnId, event.throughSequence);
      } else {
        this.handleApplyResult(result);
      }
    };

  private readonly handleReplay: ServerToClientEvents["drawing:replay"] =
    (event) => {
      const before = selectLastDrawingSequence(this.store.getState());
      const result = this.store.getState().applyReplay(event);
      if (result === "applied") {
        this.onDrawingEnvelopes?.(
          event.operations.filter(
            (operation) => operation.serverSequence > before,
          ),
          "replay",
        );
      } else if (result === "drawing-gap") {
        void this.requestSnapshot().catch(() => undefined);
      }
    };

  private readonly handleChatMessage: ServerToClientEvents["chat:message"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyChatMessage(event),
      );
    };

  private readonly handleGuessFeedback: ServerToClientEvents["guess:feedback"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyGuessFeedback(event),
      );
    };

  private readonly handleCorrectGuess: ServerToClientEvents["guess:correct"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyCorrectGuess(event),
      );
    };

  private readonly handleScoreUpdated: ServerToClientEvents["score:updated"] =
    (event) => {
      this.handleApplyResult(
        this.store.getState().applyScoreUpdated(event),
      );
    };

  private readonly handleSnapshotRequired: ServerToClientEvents["snapshot:required"] =
    (event) => {
      const roomRevision = this.store.getState().room?.revision ?? 0;
      if (event.currentRevision <= roomRevision) {
        return;
      }
      this.store
        .getState()
        .markDesynced(roomRevision + 1, event.currentRevision);
      void this.requestSnapshot().catch(() => undefined);
    };

  private readonly handleServerShutdown: ServerToClientEvents["server:shutdown"] =
    (event) => {
      this.store.getState().setConnection("outage", event.message);
      this.store.getState().setError({
        code: "SERVER_UNAVAILABLE",
        message: event.message,
        retryable: true,
        details: null,
      });
    };

  private bindSocket(): void {
    this.socket.on("connect", this.handleConnect);
    this.socket.on("disconnect", this.handleDisconnect);
    this.socket.on("connect_error", this.handleConnectError);
    this.socket.on("connection:state", this.handleConnectionState);
    this.socket.on("room:snapshot", this.handleSnapshot);
    this.socket.on("room:error", this.handleRoomError);
    this.socket.on("room:player-joined", this.handlePlayerJoined);
    this.socket.on("room:player-updated", this.handlePlayerUpdated);
    this.socket.on("room:player-left", this.handlePlayerLeft);
    this.socket.on(
      "room:host-transferred",
      this.handleHostTransferred,
    );
    this.socket.on(
      "room:settings-updated",
      this.handleSettingsUpdated,
    );
    this.socket.on("room:kicked", this.handleKicked);
    this.socket.on(
      "round:selection-started",
      this.handleRoundEvent,
    );
    this.socket.on("round:private", this.handlePrivateRound);
    this.socket.on("round:started", this.handleRoundEvent);
    this.socket.on("round:paused", this.handleRoundEvent);
    this.socket.on("round:resumed", this.handleRoundEvent);
    this.socket.on("round:ended", this.handleTurnEnded);
    this.socket.on("match:finished", this.handleMatchFinished);
    this.socket.on("drawing:batch", this.handleDrawingBatch);
    this.socket.on("drawing:reset", this.handleDrawingReset);
    this.socket.on("drawing:replay", this.handleReplay);
    this.socket.on("chat:message", this.handleChatMessage);
    this.socket.on("guess:feedback", this.handleGuessFeedback);
    this.socket.on("guess:correct", this.handleCorrectGuess);
    this.socket.on("score:updated", this.handleScoreUpdated);
    this.socket.on(
      "snapshot:required",
      this.handleSnapshotRequired,
    );
    this.socket.on("server:shutdown", this.handleServerShutdown);
  }

  private unbindSocket(): void {
    this.socket.off("connect", this.handleConnect);
    this.socket.off("disconnect", this.handleDisconnect);
    this.socket.off("connect_error", this.handleConnectError);
    this.socket.off("connection:state", this.handleConnectionState);
    this.socket.off("room:snapshot", this.handleSnapshot);
    this.socket.off("room:error", this.handleRoomError);
    this.socket.off("room:player-joined", this.handlePlayerJoined);
    this.socket.off("room:player-updated", this.handlePlayerUpdated);
    this.socket.off("room:player-left", this.handlePlayerLeft);
    this.socket.off(
      "room:host-transferred",
      this.handleHostTransferred,
    );
    this.socket.off(
      "room:settings-updated",
      this.handleSettingsUpdated,
    );
    this.socket.off("room:kicked", this.handleKicked);
    this.socket.off(
      "round:selection-started",
      this.handleRoundEvent,
    );
    this.socket.off("round:private", this.handlePrivateRound);
    this.socket.off("round:started", this.handleRoundEvent);
    this.socket.off("round:paused", this.handleRoundEvent);
    this.socket.off("round:resumed", this.handleRoundEvent);
    this.socket.off("round:ended", this.handleTurnEnded);
    this.socket.off("match:finished", this.handleMatchFinished);
    this.socket.off("drawing:batch", this.handleDrawingBatch);
    this.socket.off("drawing:reset", this.handleDrawingReset);
    this.socket.off("drawing:replay", this.handleReplay);
    this.socket.off("chat:message", this.handleChatMessage);
    this.socket.off("guess:feedback", this.handleGuessFeedback);
    this.socket.off("guess:correct", this.handleCorrectGuess);
    this.socket.off("score:updated", this.handleScoreUpdated);
    this.socket.off(
      "snapshot:required",
      this.handleSnapshotRequired,
    );
    this.socket.off("server:shutdown", this.handleServerShutdown);
  }
}

export function createRoomRealtimeController(
  options: RoomRealtimeControllerOptions = {},
): RoomRealtimeController {
  return new RoomRealtimeController(options);
}

export function createIsolatedRealtimeController(
  options: Omit<RoomRealtimeControllerOptions, "store"> = {},
): RoomRealtimeController {
  return new RoomRealtimeController({
    ...options,
    store: createRoomStore(),
  });
}

export type {
  CreateRoomInput,
  DrawingBatchInput,
  JoinRoomInput,
  UpdateSettingsInput,
};
