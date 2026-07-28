import { createHmac, randomBytes } from "node:crypto";
import { nanoid } from "nanoid";
import type {
  AvatarConfig,
  ChatMessage,
  CorrectGuessEvent,
  DrawingEnvelope,
  DrawingOp,
  GuessFeedback,
  PlayerPublic,
  PlayerRoomSnapshot,
  ReplayState,
  RoomSettings,
  RoomSnapshot,
  RoundPrivate,
  RoundPublic,
  ScoreChange,
  TurnResult,
} from "@gtd/contracts";
import { VALIDATION_LIMITS } from "@gtd/contracts";
import { GameError } from "./errors.js";
import type {
  AuthoritativeRoom,
  CorrectGuessRecord,
  CreateRoomCommand,
  CustomThemeInput,
  DrawingBatchCommand,
  EngineTransport,
  JoinRoomCommand,
  ServerPlayer,
  ServerRound,
  SessionState,
} from "./domain.js";
import { NOOP_TRANSPORT } from "./domain.js";
import type { GamePersistence, PersistedSession } from "./persistence.js";

const TURN_RESULTS_MS = 6_000;
const ANONYMOUS_SESSION_TTL_MS = 10 * 60 * 1_000;
const MAX_RECENT_COMMANDS_PER_SESSION = 64;
const MAX_CHAT_MESSAGES = 100;
const MAX_DRAWING_OPERATIONS = VALIDATION_LIMITS.drawingLogOperations;

export interface EngineTheme {
  id: string;
  name: string;
  words: readonly string[];
}

export interface CustomThemeValidation {
  valid: boolean;
  normalizedWords: string[];
  errors: readonly string[];
}

export interface EngineRules {
  generateRoomCode(): string;
  normalizeRoomCode(input: string): string;
  normalizeText(input: string): string;
  classifyGuess(guess: string, answer: string): {
    kind: "incorrect" | "close" | "correct";
  };
  calculateGuesserScore(
    remainingTimeSeconds: number,
    turnTimeSeconds: number,
    placement: number,
  ): number;
  calculateDrawerScore(correctGuessers: number): number;
  getTheme(id: string): EngineTheme | null;
  validateCustomTheme(theme: CustomThemeInput): CustomThemeValidation;
}

export interface EngineConfig {
  sessionSecret: string;
  roomLifetimeMs: number;
  emptyRoomTtlMs: number;
  disconnectedSeatMs: number;
  drawerPauseMs: number;
}

export interface EngineOptions {
  persistence: GamePersistence;
  rules: EngineRules;
  config: EngineConfig;
  transport?: EngineTransport;
  now?: () => number;
  id?: () => string;
  random?: () => number;
}

export interface ConnectedSession {
  sessionId: string;
  reconnectToken: string;
  playerId: string | null;
  roomCode: string | null;
  recovered: boolean;
  snapshot: PlayerRoomSnapshot | null;
}

export interface EngineMutationResult<T = Record<string, never>> {
  revision: number;
  data: T;
}

type TurnEndReason = TurnResult["reason"];

export class GameEngine {
  readonly #persistence: GamePersistence;
  readonly #rules: EngineRules;
  readonly #config: EngineConfig;
  readonly #transport: EngineTransport;
  readonly #now: () => number;
  readonly #id: () => string;
  readonly #random: () => number;
  readonly #rooms = new Map<string, AuthoritativeRoom>();
  readonly #sessions = new Map<string, SessionState>();
  readonly #socketSessions = new Map<string, string>();
  readonly #timers = new Map<string, ReturnType<typeof setTimeout>>();
  readonly #roomPersistenceChains = new Map<string, Promise<void>>();
  readonly #expiredRooms = new WeakSet<AuthoritativeRoom>();
  readonly #reservedRoomCodes = new Set<string>();
  #started = false;

  constructor(options: EngineOptions) {
    this.#persistence = options.persistence;
    this.#rules = options.rules;
    this.#config = options.config;
    this.#transport = options.transport ?? NOOP_TRANSPORT;
    this.#now = options.now ?? Date.now;
    this.#id = options.id ?? nanoid;
    this.#random = options.random ?? Math.random;
  }

  get persistenceKind(): GamePersistence["kind"] {
    return this.#persistence.kind;
  }

  async start(): Promise<void> {
    if (this.#started) {
      return;
    }
    this.#started = true;
    const roomCodes = await this.#persistence.listRoomCodes();
    for (const code of roomCodes) {
      const room = await this.#persistence.getRoom<AuthoritativeRoom>(code);
      if (!room) {
        continue;
      }
      if (room.expiresAt <= this.#now()) {
        await this.#persistence.deleteRoom(code);
        continue;
      }
      this.#prepareRehydratedRoom(room);
      this.#rooms.set(code, room);
      await this.#restoreRoomTimers(room);
    }
  }

  async stop(): Promise<void> {
    for (const timer of this.#timers.values()) {
      clearTimeout(timer);
    }
    this.#timers.clear();
    await Promise.all([...this.#rooms.values()].map((room) => this.#saveRoom(room)));
    this.#started = false;
  }

  async isReady(): Promise<boolean> {
    return this.#started && (await this.#persistence.isReady());
  }

  async connect(
    socketId: string,
    presentedReconnectToken?: string,
  ): Promise<ConnectedSession> {
    const now = this.#now();

    if (presentedReconnectToken) {
      const tokenHash = this.#hashToken(presentedReconnectToken);
      const persisted = await this.#persistence.getSession(tokenHash);
      if (persisted && persisted.expiresAt > now) {
        const existing = this.#sessions.get(persisted.sessionId);
        if (existing?.socketId && existing.socketId !== socketId) {
          this.#socketSessions.delete(existing.socketId);
          this.#emitSocket(existing.socketId, "connection:state", {
            state: "offline",
            message: "This guest session reconnected in another tab.",
          });
        }

        const session: SessionState = {
          sessionId: persisted.sessionId,
          reconnectToken: presentedReconnectToken,
          reconnectTokenHash: tokenHash,
          roomCode: persisted.roomCode,
          playerId: persisted.playerId,
          socketId,
          createdAt: persisted.createdAt,
          expiresAt: persisted.expiresAt,
          recentCommands: persisted.recentCommands ?? [],
        };
        this.#sessions.set(session.sessionId, session);
        this.#socketSessions.set(socketId, session.sessionId);

        const room = session.roomCode ? await this.#loadRoom(session.roomCode) : null;
        const player =
          room && session.playerId
            ? room.players.find(
                (candidate) =>
                  candidate.id === session.playerId &&
                  candidate.sessionId === session.sessionId,
              )
            : null;

        if (room?.kickedSessionIds.includes(session.sessionId)) {
          session.roomCode = null;
          session.playerId = null;
          await this.#saveSession(session);
          throw new GameError("KICKED", "The host removed you from this room.");
        }

        if (
          room &&
          player &&
          player.disconnectedAt !== null &&
          player.disconnectedAt + this.#config.disconnectedSeatMs <= now
        ) {
          await this.#expireDisconnectedSeat(room.code, player.id);
          throw new GameError(
            "ROOM_EXPIRED",
            "Your reserved seat has expired.",
          );
        }

        if (room && player) {
          player.socketId = socketId;
          player.disconnectedAt = null;
          player.connectedAt = now;
          await this.#transport.join(socketId, room.code);
          this.#cancelTimer(this.#seatTimerKey(room.code, player.id));
          this.#cancelTimer(this.#emptyTimerKey(room.code));
          if (!room.hostPlayerId) {
            room.hostPlayerId = player.id;
            player.isHost = true;
          }
          const resumedRound = await this.#resumeDrawerIfNeeded(room, player);
          this.#incrementRevision(room);
          await this.#saveRoom(room);
          if (resumedRound) {
            this.#emitRoom(room.code, "round:resumed", {
              revision: room.revision,
              round: this.#publicRound(room),
            });
          }
          this.#publishSnapshots(room);
          return {
            sessionId: session.sessionId,
            reconnectToken: presentedReconnectToken,
            playerId: player.id,
            roomCode: room.code,
            recovered: true,
            snapshot: this.snapshotFor(room, player.id),
          };
        }

        const unavailableRoomCode = session.roomCode;
        session.roomCode = null;
        session.playerId = null;
        await this.#saveSession(session);
        if (unavailableRoomCode) {
          throw new GameError(
            "ROOM_EXPIRED",
            room
              ? "Your reserved seat has expired."
              : "That room no longer exists.",
          );
        }
        return {
          sessionId: session.sessionId,
          reconnectToken: presentedReconnectToken,
          playerId: null,
          roomCode: null,
          recovered: false,
          snapshot: null,
        };
      }
    }

    const reconnectToken = randomBytes(32).toString("base64url");
    const session: SessionState = {
      sessionId: this.#id(),
      reconnectToken,
      reconnectTokenHash: this.#hashToken(reconnectToken),
      roomCode: null,
      playerId: null,
      socketId,
      createdAt: now,
      expiresAt:
        now +
        Math.min(this.#config.roomLifetimeMs, ANONYMOUS_SESSION_TTL_MS),
      recentCommands: [],
    };
    this.#sessions.set(session.sessionId, session);
    this.#socketSessions.set(socketId, session.sessionId);
    await this.#saveSession(session);

    return {
      sessionId: session.sessionId,
      reconnectToken,
      playerId: null,
      roomCode: null,
      recovered: false,
      snapshot: null,
    };
  }

  async resumeSession(
    socketId: string,
    roomCode: string,
    playerId: string,
    reconnectToken: string,
  ): Promise<ConnectedSession> {
    const normalizedRoomCode = this.#rules.normalizeRoomCode(roomCode);
    const reconnectTokenHash = this.#hashToken(reconnectToken);
    const persistedSession =
      await this.#persistence.getSession(reconnectTokenHash);
    if (
      !persistedSession ||
      persistedSession.expiresAt <= this.#now() ||
      persistedSession.playerId !== playerId ||
      persistedSession.roomCode !== normalizedRoomCode
    ) {
      throw new GameError(
        "UNAUTHORIZED",
        "Those reconnect credentials are no longer valid.",
      );
    }

    const currentSessionId = this.#socketSessions.get(socketId);
    if (currentSessionId && currentSessionId !== persistedSession.sessionId) {
      const currentSession = this.#sessions.get(currentSessionId);
      if (currentSession) {
        await this.#persistence.deleteSession(currentSession.reconnectTokenHash);
      }
      this.#sessions.delete(currentSessionId);
      this.#socketSessions.delete(socketId);
    }
    const connected = await this.connect(socketId, reconnectToken);
    if (
      !connected.recovered ||
      connected.playerId !== playerId ||
      connected.roomCode !== normalizedRoomCode
    ) {
      throw new GameError("UNAUTHORIZED", "Those reconnect credentials are no longer valid.");
    }
    return connected;
  }

  async disconnect(socketId: string): Promise<void> {
    const session = this.#sessionForSocket(socketId, false);
    if (!session) {
      return;
    }
    this.#socketSessions.delete(socketId);
    session.socketId = null;

    if (!session.roomCode || !session.playerId) {
      await this.#saveSession(session);
      return;
    }

    const room = await this.#loadRoom(session.roomCode);
    const player = room?.players.find((candidate) => candidate.id === session.playerId);
    if (!room || !player || player.socketId !== socketId) {
      await this.#saveSession(session);
      return;
    }

    const now = this.#now();
    player.socketId = null;
    player.disconnectedAt = now;
    this.#incrementRevision(room);

    const disconnectedActiveDrawer =
      room.round?.drawerId === player.id &&
      (room.phase === "selecting" || room.phase === "drawing");
    const shouldSkipTurnImmediately =
      disconnectedActiveDrawer && room.round?.drawerPauseUsed === true;
    if (disconnectedActiveDrawer && !room.round!.drawerPauseUsed) {
      const activeDeadline =
        room.phase === "selecting" ? room.round!.choiceDeadlineAt : room.round!.deadlineAt;
      room.round!.pausedRemainingMs = Math.max(0, activeDeadline - now);
      room.round!.pausedUntil = now + this.#config.drawerPauseMs;
      room.round!.drawerPauseUsed = true;
      this.#cancelTimer(this.#phaseTimerKey(room.code));
      const pausedTurnId = room.round!.turnId;
      this.#schedule(
        this.#drawerPauseTimerKey(room.code),
        room.round!.pausedUntil,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (current?.round?.turnId === pausedTurnId && current.round.pausedUntil !== null) {
            await this.#endTurn(current, "drawer-disconnected");
          }
        },
      );
    }

    this.#schedule(
      this.#seatTimerKey(room.code, player.id),
      now + this.#config.disconnectedSeatMs,
      async () => this.#expireDisconnectedSeat(room.code, player.id),
    );
    this.#emitRoom(room.code, "room:player-left", {
      revision: room.revision,
      playerId: player.id,
      reason: "disconnected",
      reconnectDeadline: now + this.#config.disconnectedSeatMs,
    });
    if (room.round?.pausedUntil !== null && room.round?.drawerId === player.id) {
      this.#emitRoom(room.code, "round:paused", {
        revision: room.revision,
        round: this.#publicRound(room),
      });
    }
    if (shouldSkipTurnImmediately) {
      await this.#endTurn(room, "drawer-disconnected");
      await this.#saveSession(session);
      return;
    }
    await this.#saveSession(session);
    await this.#saveRoom(room);
    this.#publishSnapshots(room);
  }

  async createRoom(
    socketId: string,
    command: CreateRoomCommand,
  ): Promise<
    EngineMutationResult<{
      snapshot: PlayerRoomSnapshot;
      credentials: { playerId: string; reconnectToken: string };
    }>
  > {
    const session = this.#requireSession(socketId);
    if (session.roomCode) {
      const existingRoom = await this.#loadRoom(session.roomCode);
      if (existingRoom) {
        const marker = this.#cachedCommand<{ kind: "session-established" }>(
          existingRoom,
          session.sessionId,
          command.idempotencyId,
          "room:create",
        );
        const existingPlayer = existingRoom.players.find(
          (candidate) => candidate.sessionId === session.sessionId,
        );
        const completedCreate = existingRoom.recentCommands[
          session.sessionId
        ]?.some((entry) => entry.event === "room:create");
        if ((marker || completedCreate) && existingPlayer) {
          return this.#sessionEstablishedResult(existingRoom, existingPlayer, session);
        }
      }
      throw new GameError("FORBIDDEN", "Leave your current room before creating another.");
    }

    const { settings, customTheme } = this.#canonicalizeSettings(
      command.settings,
      command.customTheme,
    );
    const code = await this.#availableRoomCode();
    const now = this.#now();
    const playerId = this.#id();
    const player: ServerPlayer = {
      id: playerId,
      sessionId: session.sessionId,
      name: command.name.trim(),
      avatar: structuredClone(command.avatar),
      score: 0,
      isHost: true,
      joinedAt: now,
      joinOrder: 0,
      connectedAt: now,
      disconnectedAt: null,
      socketId,
    };
    const room: AuthoritativeRoom = {
      code,
      revision: 1,
      createdAt: now,
      expiresAt: now + this.#config.roomLifetimeMs,
      lastActiveAt: now,
      phase: "lobby",
      settings,
      customTheme,
      hostPlayerId: player.id,
      players: [player],
      kickedSessionIds: [],
      turnOrder: [],
      pendingTurnPlayerIds: [],
      turnIndex: 0,
      currentCycle: 0,
      round: null,
      chat: [],
      recentCommands: {},
    };
    this.#rooms.set(code, room);
    this.#reservedRoomCodes.delete(code);
    session.roomCode = code;
    session.playerId = player.id;
    session.expiresAt = room.expiresAt;
    await this.#transport.join(socketId, code);
    this.#scheduleAbsoluteExpiration(room);

    const result = {
      revision: room.revision,
      data: {
        snapshot: this.snapshotFor(room, player.id),
        credentials: { playerId, reconnectToken: session.reconnectToken },
      },
    };
    this.#recordCommand(room, session.sessionId, command.idempotencyId, "room:create", {
      kind: "session-established",
    });
    await Promise.all([this.#saveSession(session), this.#saveRoom(room)]);
    this.#publishSnapshots(room);
    return result;
  }

  async joinRoom(
    socketId: string,
    command: JoinRoomCommand,
  ): Promise<
    EngineMutationResult<{
      snapshot: PlayerRoomSnapshot;
      credentials: { playerId: string; reconnectToken: string };
    }>
  > {
    const session = this.#requireSession(socketId);
    const code = this.#rules.normalizeRoomCode(command.roomCode);
    const room = await this.#loadRoom(code);
    if (!room) {
      throw new GameError("ROOM_NOT_FOUND", "That room does not exist or has expired.");
    }
    const marker = this.#cachedCommand<{ kind: "session-established" }>(
      room,
      session.sessionId,
      command.idempotencyId,
      "room:join",
    );
    const markerPlayer = room.players.find(
      (candidate) => candidate.sessionId === session.sessionId,
    );
    if (marker && markerPlayer) {
      return this.#sessionEstablishedResult(room, markerPlayer, session);
    }
    this.#assertExpectedRevision(room, command.expectedRevision);
    if (room.kickedSessionIds.includes(session.sessionId)) {
      throw new GameError("KICKED", "You were removed from this room.");
    }
    if (session.roomCode && session.roomCode !== room.code) {
      throw new GameError("FORBIDDEN", "Leave your current room before joining another.");
    }

    const existingPlayer = room.players.find(
      (candidate) => candidate.sessionId === session.sessionId,
    );
    if (existingPlayer) {
      existingPlayer.socketId = socketId;
      existingPlayer.disconnectedAt = null;
      existingPlayer.connectedAt = this.#now();
      session.roomCode = room.code;
      session.playerId = existingPlayer.id;
      if (!room.hostPlayerId) {
        room.hostPlayerId = existingPlayer.id;
        existingPlayer.isHost = true;
      }
      await this.#transport.join(socketId, room.code);
      this.#incrementRevision(room);
      const result = {
        revision: room.revision,
        data: {
          snapshot: this.snapshotFor(room, existingPlayer.id),
          credentials: {
            playerId: existingPlayer.id,
            reconnectToken: session.reconnectToken,
          },
        },
      };
      this.#recordCommand(room, session.sessionId, command.idempotencyId, "room:join", {
        kind: "session-established",
      });
      await Promise.all([this.#saveSession(session), this.#saveRoom(room)]);
      this.#publishSnapshots(room);
      return result;
    }

    if (room.players.length >= room.settings.maxPlayers) {
      throw new GameError("ROOM_FULL", "That room is full.");
    }
    const normalizedName = this.#rules.normalizeText(command.name);
    if (
      room.players.some(
        (candidate) => this.#rules.normalizeText(candidate.name) === normalizedName,
      )
    ) {
      throw new GameError("DUPLICATE_NAME", "Choose a different name for this room.");
    }

    const now = this.#now();
    const player: ServerPlayer = {
      id: this.#id(),
      sessionId: session.sessionId,
      name: command.name.trim(),
      avatar: structuredClone(command.avatar),
      score: 0,
      isHost: room.hostPlayerId === "",
      joinedAt: now,
      joinOrder:
        room.players.reduce((maximum, candidate) => Math.max(maximum, candidate.joinOrder), -1) +
        1,
      connectedAt: now,
      disconnectedAt: null,
      socketId,
    };
    if (player.isHost) {
      room.hostPlayerId = player.id;
    }
    room.players.push(player);
    if (room.phase !== "lobby" && room.phase !== "final-results") {
      room.pendingTurnPlayerIds.push(player.id);
    }
    session.roomCode = room.code;
    session.playerId = player.id;
    session.expiresAt = room.expiresAt;
    this.#cancelTimer(this.#emptyTimerKey(room.code));
    await this.#transport.join(socketId, room.code);
    this.#incrementRevision(room);
    const result = {
      revision: room.revision,
      data: {
        snapshot: this.snapshotFor(room, player.id),
        credentials: { playerId: player.id, reconnectToken: session.reconnectToken },
      },
    };
    this.#recordCommand(room, session.sessionId, command.idempotencyId, "room:join", {
      kind: "session-established",
    });
    await Promise.all([this.#saveSession(session), this.#saveRoom(room)]);
    this.#emitRoom(room.code, "room:player-joined", {
      revision: room.revision,
      player: this.#publicPlayer(room, player),
    });
    this.#publishSnapshots(room);
    return result;
  }

  async leaveRoom(
    socketId: string,
    idempotencyId: string,
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const activeSession = this.#requireSession(socketId);
    const sessionCached = this.#cachedSessionCommand<EngineMutationResult>(
      activeSession,
      idempotencyId,
      "room:leave",
    );
    if (sessionCached) {
      return sessionCached;
    }
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "room:leave",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);

    const wasDrawer =
      room.round?.drawerId === player.id &&
      (room.phase === "selecting" || room.phase === "drawing");
    await this.#removePlayer(room, player, "left");
    session.roomCode = null;
    session.playerId = null;
    await this.#transport.leave(socketId, room.code);
    if (wasDrawer) {
      await this.#endTurn(room, "drawer-left");
    } else {
      this.#incrementRevision(room);
      await this.#saveRoom(room);
      this.#publishSnapshots(room);
    }
    const result = { revision: room.revision, data: {} };
    this.#recordSessionCommand(session, idempotencyId, "room:leave", result);
    await Promise.all([this.#saveSession(session), this.#saveRoom(room)]);
    return result;
  }

  async updateProfile(
    socketId: string,
    idempotencyId: string,
    profile: { name: string; avatar: AvatarConfig },
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "room:profile:update",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    const normalizedName = this.#rules.normalizeText(profile.name);
    if (
      room.players.some(
        (candidate) =>
          candidate.id !== player.id &&
          this.#rules.normalizeText(candidate.name) === normalizedName,
      )
    ) {
      throw new GameError("DUPLICATE_NAME", "Choose a different name for this room.");
    }
    player.name = profile.name.trim();
    player.avatar = structuredClone(profile.avatar);
    this.#incrementRevision(room);
    const result = { revision: room.revision, data: {} };
    this.#recordCommand(
      room,
      session.sessionId,
      idempotencyId,
      "room:profile:update",
      result,
    );
    await this.#saveRoom(room);
    this.#emitRoom(room.code, "room:player-updated", {
      revision: room.revision,
      player: this.#publicPlayer(room, player),
    });
    this.#publishSnapshots(room);
    return result;
  }

  async updateSettings(
    socketId: string,
    idempotencyId: string,
    settingsInput: RoomSettings,
    customThemeInput?: CustomThemeInput,
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "room:settings:update",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    this.#assertHost(room, player);
    if (room.phase !== "lobby") {
      throw new GameError("INVALID_PHASE", "Room settings can only change in the lobby.");
    }
    if (settingsInput.maxPlayers < room.players.length) {
      throw new GameError(
        "INVALID_PAYLOAD",
        "The player cap cannot be lower than the current player count.",
      );
    }
    const { settings, customTheme } = this.#canonicalizeSettings(
      settingsInput,
      customThemeInput,
      room.customTheme,
    );
    room.settings = settings;
    room.customTheme = customTheme;
    this.#incrementRevision(room);
    const result = { revision: room.revision, data: {} };
    this.#recordCommand(
      room,
      session.sessionId,
      idempotencyId,
      "room:settings:update",
      result,
    );
    await this.#saveRoom(room);
    this.#emitRoom(room.code, "room:settings-updated", {
      revision: room.revision,
      settings: room.settings,
    });
    this.#publishSnapshots(room);
    return result;
  }

  async kickPlayer(
    socketId: string,
    idempotencyId: string,
    targetPlayerId: string,
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "room:kick",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    this.#assertHost(room, player);
    if (targetPlayerId === player.id) {
      throw new GameError("FORBIDDEN", "The host cannot kick themselves.");
    }
    const target = room.players.find((candidate) => candidate.id === targetPlayerId);
    if (!target) {
      throw new GameError("INVALID_PAYLOAD", "That player is no longer in the room.");
    }
    const wasDrawer =
      room.round?.drawerId === target.id &&
      (room.phase === "selecting" || room.phase === "drawing");
    room.kickedSessionIds.push(target.sessionId);
    await this.#removePlayer(room, target, "kicked");
    const targetSession = this.#sessions.get(target.sessionId);
    if (targetSession && target.socketId) {
      targetSession.roomCode = null;
      targetSession.playerId = null;
      await this.#saveSession(targetSession);
    }
    if (target.socketId) {
      this.#emitSocket(target.socketId, "room:kicked", {
        revision: room.revision + 1,
        code: "KICKED",
        reason: "The host removed you from the room.",
      });
      await this.#transport.leave(target.socketId, room.code);
    }
    if (wasDrawer) {
      await this.#endTurn(room, "drawer-left");
    } else {
      this.#incrementRevision(room);
    }
    const result = { revision: room.revision, data: {} };
    this.#recordCommand(room, session.sessionId, idempotencyId, "room:kick", result);
    await this.#saveRoom(room);
    this.#publishSnapshots(room);
    return result;
  }

  async startMatch(
    socketId: string,
    idempotencyId: string,
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "match:start",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    this.#assertHost(room, player);
    if (room.phase !== "lobby" && room.phase !== "final-results") {
      throw new GameError("INVALID_PHASE", "A match is already in progress.");
    }
    const connectedPlayers = room.players.filter((candidate) => candidate.socketId);
    if (connectedPlayers.length < 2) {
      throw new GameError("INVALID_PHASE", "At least two connected players are required.");
    }
    for (const candidate of room.players) {
      candidate.score = 0;
    }
    room.turnOrder = connectedPlayers
      .sort((left, right) => left.joinOrder - right.joinOrder)
      .map((candidate) => candidate.id);
    room.pendingTurnPlayerIds = [];
    room.turnIndex = 0;
    room.currentCycle = 1;
    room.chat = [];
    this.#incrementRevision(room);
    await this.#beginTurn(room);
    const result = { revision: room.revision, data: {} };
    this.#recordCommand(room, session.sessionId, idempotencyId, "match:start", result);
    await this.#saveRoom(room);
    return result;
  }

  async selectWord(
    socketId: string,
    idempotencyId: string,
    turnId: string,
    choiceIndex: number,
    expectedRevision?: number,
  ): Promise<EngineMutationResult> {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<EngineMutationResult>(
      room,
      session.sessionId,
      idempotencyId,
      "round:select-word",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    this.#assertCurrentTurn(room, turnId);
    if (room.phase !== "selecting") {
      throw new GameError("INVALID_PHASE", "Word selection has ended.");
    }
    if (room.round?.drawerId !== player.id) {
      throw new GameError("NOT_DRAWER", "Only the drawer can choose the word.");
    }
    if (!Number.isInteger(choiceIndex) || choiceIndex < 0 || choiceIndex > 2) {
      throw new GameError("INVALID_WORD", "Choose one of the three offered words.");
    }
    await this.#startDrawing(room, choiceIndex);
    const result = { revision: room.revision, data: {} };
    this.#recordCommand(
      room,
      session.sessionId,
      idempotencyId,
      "round:select-word",
      result,
    );
    await this.#saveRoom(room);
    return result;
  }

  async submitDrawingBatch(
    socketId: string,
    command: DrawingBatchCommand,
  ): Promise<
    EngineMutationResult<{ acceptedThroughSequence: number; envelopes: DrawingEnvelope[] }>
  > {
    const { session, room, player } = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<
      EngineMutationResult<{
        acceptedThroughSequence: number;
        envelopes: DrawingEnvelope[];
      }>
    >(room, session.sessionId, command.idempotencyId, "drawing:batch");
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, command.expectedRevision);
    this.#assertCurrentTurn(room, command.turnId);
    if (room.phase !== "drawing" || !room.round || room.round.pausedUntil !== null) {
      throw new GameError("INVALID_PHASE", "Drawing is not active.");
    }
    if (room.round.drawerId !== player.id) {
      throw new GameError("NOT_DRAWER", "Only the drawer can send drawing operations.");
    }
    if (command.operations.length === 0 || command.operations.length > 64) {
      throw new GameError("PAYLOAD_TOO_LARGE", "A drawing batch must contain 1–64 operations.");
    }
    if (room.round.drawingLog.length + command.operations.length > MAX_DRAWING_OPERATIONS) {
      throw new GameError("PAYLOAD_TOO_LARGE", "This turn's drawing log is full.");
    }
    const batchPointCount = command.operations.reduce(
      (total, operation) =>
        total +
        (operation.kind === "stroke"
          ? operation.points.length
          : operation.kind === "shape"
            ? 2
            : 0),
      0,
    );
    const batchByteCount = command.operations.reduce(
      (total, operation) => total + this.#drawingOperationBytes(operation),
      0,
    );
    if (
      room.round.drawingPointCount + batchPointCount >
        VALIDATION_LIMITS.drawingLogPoints ||
      room.round.drawingByteCount + batchByteCount >
        VALIDATION_LIMITS.drawingLogBytes
    ) {
      throw new GameError(
        "PAYLOAD_TOO_LARGE",
        "This turn's drawing data limit has been reached.",
      );
    }
    const priorChunk = room.round.strokeChunks[command.strokeId];
    const expectedChunk = priorChunk === undefined ? 0 : priorChunk + 1;
    if (command.chunkId !== expectedChunk) {
      throw new GameError("DRAWING_SEQUENCE_GAP", "Drawing chunks must arrive in order.", {
        expectedChunk,
        currentRevision: room.revision,
        latestSequence: Math.max(0, room.round.nextServerSequence - 1),
      });
    }
    for (const operation of command.operations) {
      if (room.round.drawingOperationIds[operation.opId]) {
        throw new GameError(
          "DRAWING_SEQUENCE_GAP",
          "Drawing operation IDs must be unique within a turn.",
          {
            currentRevision: room.revision,
            latestSequence: Math.max(0, room.round.nextServerSequence - 1),
          },
        );
      }
    }

    const nextUndoStack = [...room.round.undoStack];
    const nextRedoStack = [...room.round.redoStack];
    this.#validateDrawingStackBatch(
      command.operations,
      command.strokeId,
      command.chunkId,
      nextUndoStack,
      nextRedoStack,
    );

    const envelopes = command.operations.map((operation) => {
      const envelope: DrawingEnvelope = {
        turnId: room.round!.turnId,
        strokeId: command.strokeId,
        chunkId: command.chunkId,
        serverSequence: room.round!.nextServerSequence++,
        operation: structuredClone(operation),
      };
      return envelope;
    });
    room.round.strokeChunks[command.strokeId] = command.chunkId;
    for (const operation of command.operations) {
      room.round.drawingOperationIds[operation.opId] = true;
    }
    room.round.drawingPointCount += batchPointCount;
    room.round.drawingByteCount += batchByteCount;
    room.round.undoStack = nextUndoStack;
    room.round.redoStack = nextRedoStack;
    room.round.drawingLog.push(...envelopes);
    this.#incrementRevision(room);
    const acceptedThroughSequence =
      envelopes.at(-1)?.serverSequence ?? room.round.nextServerSequence - 1;
    const result = {
      revision: room.revision,
      data: { acceptedThroughSequence, envelopes },
    };
    this.#recordCommand(
      room,
      session.sessionId,
      command.idempotencyId,
      "drawing:batch",
      result,
    );
    this.#emitRoom(
      room.code,
      "drawing:batch",
      { revision: result.revision, envelopes },
      socketId,
    );
    await this.#saveRoom(room);
    return result;
  }

  async sendChat(
    socketId: string,
    idempotencyId: string,
    text: string,
    expectedRevision?: number,
  ): Promise<EngineMutationResult<{ message: ChatMessage }>> {
    const membership = await this.#requireMembership(socketId);
    const { session, room, player } = membership;
    const cached = this.#cachedCommand<EngineMutationResult<{ message: ChatMessage }>>(
      room,
      session.sessionId,
      idempotencyId,
      "chat:send",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(room, expectedRevision);
    if (room.phase === "drawing") {
      throw new GameError(
        "INVALID_PHASE",
        "Use the guess action while a drawing turn is active.",
      );
    }
    if (room.phase === "selecting" && room.round?.drawerId === player.id) {
      throw new GameError("FORBIDDEN", "The drawer cannot chat during their turn.");
    }
    return this.#publishChat(membership, idempotencyId, text, "chat:send");
  }

  async submitGuess(
    socketId: string,
    idempotencyId: string,
    turnId: string,
    text: string,
    expectedRevision?: number,
  ): Promise<EngineMutationResult<{ feedback: GuessFeedback }>> {
    const membership = await this.#requireMembership(socketId);
    const cached = this.#cachedCommand<
      EngineMutationResult<{ feedback: GuessFeedback }>
    >(
      membership.room,
      membership.session.sessionId,
      idempotencyId,
      "guess:submit",
    );
    if (cached) {
      return cached;
    }
    this.#assertExpectedRevision(membership.room, expectedRevision);
    this.#assertCurrentTurn(membership.room, turnId);
    return this.#handleGuess(membership, idempotencyId, text, turnId);
  }

  async snapshotForSocket(socketId: string): Promise<PlayerRoomSnapshot> {
    const { room, player } = await this.#requireMembership(socketId);
    return this.snapshotFor(room, player.id);
  }

  async replayForSocket(
    socketId: string,
    turnId: string,
    afterSequence: number,
  ): Promise<ReplayState> {
    const { room } = await this.#requireMembership(socketId);
    this.#assertCurrentTurn(room, turnId);
    return this.#drawingReplay(room, afterSequence);
  }

  snapshotFor(room: AuthoritativeRoom, playerId: string): PlayerRoomSnapshot {
    const publicSnapshot = this.#publicSnapshot(room);
    const isDrawer = room.round?.drawerId === playerId;
    let privateRound: RoundPrivate | null = null;
    if (room.round && isDrawer) {
      privateRound = {
        turnId: room.round.turnId,
        answer: room.round.answer,
        wordChoices: this.#threeChoices(room.round.choices),
      };
    }
    return {
      ...publicSnapshot,
      selfPlayerId: playerId,
      privateRound,
    };
  }

  inspectRoom(code: string): AuthoritativeRoom | undefined {
    return this.#rooms.get(this.#rules.normalizeRoomCode(code));
  }

  async #handleGuess(
    membership: {
      session: SessionState;
      room: AuthoritativeRoom;
      player: ServerPlayer;
    },
    idempotencyId: string,
    text: string,
    assertedTurnId?: string,
  ): Promise<EngineMutationResult<{ feedback: GuessFeedback }>> {
    const { session, room, player } = membership;
    if (
      room.phase !== "drawing" ||
      !room.round ||
      room.round.pausedUntil !== null ||
      !room.round.answer
    ) {
      throw new GameError("INVALID_PHASE", "There is no active word to guess.");
    }
    if (assertedTurnId && assertedTurnId !== room.round.turnId) {
      throw new GameError("STALE_TURN", "That guess belongs to an earlier turn.");
    }
    if (room.round.drawerId === player.id) {
      throw new GameError("FORBIDDEN", "The drawer cannot chat or guess during their turn.");
    }

    const classification = this.#rules.classifyGuess(text, room.round.answer);
    const priorCorrectGuess = room.round.correctGuesses.find(
      (guess) => guess.playerId === player.id,
    );
    if (priorCorrectGuess) {
      if (classification.kind === "correct" || classification.kind === "close") {
        const feedback: GuessFeedback = {
          kind: classification.kind,
          turnId: room.round.turnId,
          message:
            classification.kind === "correct"
              ? "You already guessed the word."
              : "That is close—keep the answer secret.",
          scoreAwarded: 0,
          placement: priorCorrectGuess.placement,
        };
        this.#emitSocket(player.socketId!, "guess:feedback", {
          revision: room.revision,
          feedbackId: idempotencyId,
          feedback,
        });
        const result = { revision: room.revision, data: { feedback } };
        this.#recordCommand(
          room,
          session.sessionId,
          idempotencyId,
          "guess:submit",
          result,
        );
        await this.#saveRoom(room);
        return result;
      }
      const chatResult = await this.#publishChat(
        membership,
        idempotencyId,
        text,
        "guess:submit",
      );
      const feedback: GuessFeedback = {
        kind: "incorrect",
        turnId: room.round.turnId,
        message: "Not quite—keep guessing!",
        scoreAwarded: 0,
        placement: priorCorrectGuess.placement,
      };
      const result = { revision: chatResult.revision, data: { feedback } };
      this.#replaceCachedCommandResult(
        room,
        session.sessionId,
        idempotencyId,
        "guess:submit",
        result,
      );
      await this.#saveRoom(room);
      return result;
    }

    if (classification.kind === "close") {
      const feedback: GuessFeedback = {
        kind: "close",
        turnId: room.round.turnId,
        message: "Very close! Try another spelling.",
        scoreAwarded: 0,
        placement: null,
      };
      this.#emitSocket(player.socketId!, "guess:feedback", {
        revision: room.revision,
        feedbackId: idempotencyId,
        feedback,
      });
      const result = { revision: room.revision, data: { feedback } };
      this.#recordCommand(
        room,
        session.sessionId,
        idempotencyId,
        "guess:submit",
        result,
      );
      await this.#saveRoom(room);
      return result;
    }

    if (classification.kind === "incorrect") {
      const chatResult = await this.#publishChat(
        membership,
        idempotencyId,
        text,
        "guess:submit",
      );
      const feedback: GuessFeedback = {
        kind: "incorrect",
        turnId: room.round.turnId,
        message: "Not quite—keep guessing!",
        scoreAwarded: 0,
        placement: null,
      };
      this.#emitSocket(player.socketId!, "guess:feedback", {
        revision: room.revision,
        feedbackId: idempotencyId,
        feedback,
      });
      const result = { revision: chatResult.revision, data: { feedback } };
      this.#replaceCachedCommandResult(
        room,
        session.sessionId,
        idempotencyId,
        "guess:submit",
        result,
      );
      await this.#saveRoom(room);
      return result;
    }

    const placement = room.round.correctGuesses.length + 1;
    const remainingSeconds = Math.max(0, room.round.deadlineAt - this.#now()) / 1_000;
    const scoreAwarded = this.#rules.calculateGuesserScore(
      remainingSeconds,
      room.settings.turnSeconds,
      placement,
    );
    player.score += scoreAwarded;
    const guessedAt = this.#now();
    const guessRecord: CorrectGuessRecord = {
      playerId: player.id,
      placement,
      guessedAt,
      scoreAwarded,
    };
    room.round.correctGuesses.push(guessRecord);
    this.#incrementRevision(room);
    const feedback: GuessFeedback = {
      kind: "correct",
      turnId: room.round.turnId,
      message: `Correct! +${scoreAwarded} points`,
      scoreAwarded,
      placement,
    };
    const publicGuess: CorrectGuessEvent = {
      turnId: room.round.turnId,
      playerId: player.id,
      playerName: player.name,
      placement,
      guessedAt,
    };
    this.#emitSocket(player.socketId!, "guess:feedback", {
      revision: room.revision,
      feedbackId: idempotencyId,
      feedback,
    });
    this.#emitRoom(room.code, "guess:correct", {
      revision: room.revision,
      guess: publicGuess,
    });
    this.#emitRoom(room.code, "score:updated", {
      revision: room.revision,
      changes: [
        {
          playerId: player.id,
          delta: scoreAwarded,
          total: player.score,
          reason: "correct-guess",
        },
      ],
    });
    const result = { revision: room.revision, data: { feedback } };
    this.#recordCommand(
      room,
      session.sessionId,
      idempotencyId,
      "guess:submit",
      result,
    );
    await this.#saveRoom(room);

    const eligibleGuessers = room.players.filter(
      (candidate) => candidate.id !== room.round?.drawerId && candidate.socketId,
    );
    if (
      eligibleGuessers.length > 0 &&
      eligibleGuessers.every((candidate) =>
        room.round?.correctGuesses.some((guess) => guess.playerId === candidate.id),
      )
    ) {
      await this.#endTurn(room, "all-guessed");
      result.revision = room.revision;
      this.#replaceCachedCommandResult(
        room,
        session.sessionId,
        idempotencyId,
        "guess:submit",
        result,
      );
      await this.#saveRoom(room);
    }
    return result;
  }

  async #publishChat(
    membership: {
      session: SessionState;
      room: AuthoritativeRoom;
      player: ServerPlayer;
    },
    idempotencyId: string,
    rawText: string,
    event: "chat:send" | "guess:submit",
  ): Promise<EngineMutationResult<{ message: ChatMessage }>> {
    const text = rawText.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/gu, "").trim();
    if (!text || text.length > 180) {
      throw new GameError("INVALID_PAYLOAD", "Chat messages must be 1–180 characters.");
    }
    this.#incrementRevision(membership.room);
    const message: ChatMessage = {
      id: this.#id(),
      roomRevision: membership.room.revision,
      playerId: membership.player.id,
      playerName: membership.player.name,
      text,
      createdAt: this.#now(),
    };
    membership.room.chat.push(message);
    if (membership.room.chat.length > MAX_CHAT_MESSAGES) {
      membership.room.chat.splice(0, membership.room.chat.length - MAX_CHAT_MESSAGES);
    }
    const result = { revision: membership.room.revision, data: { message } };
    this.#recordCommand(
      membership.room,
      membership.session.sessionId,
      idempotencyId,
      event,
      result,
    );
    this.#emitRoom(membership.room.code, "chat:message", {
      revision: result.revision,
      message,
    });
    await this.#saveRoom(membership.room);
    return result;
  }

  async #beginTurn(room: AuthoritativeRoom): Promise<void> {
    this.#cancelTimer(this.#phaseTimerKey(room.code));
    this.#cancelTimer(this.#drawerPauseTimerKey(room.code));

    if (room.currentCycle > room.settings.drawingCycles || room.turnOrder.length === 0) {
      await this.#finishMatch(room);
      return;
    }

    let attempts = 0;
    let drawer: ServerPlayer | undefined;
    while (attempts < room.turnOrder.length) {
      const playerId = room.turnOrder[room.turnIndex];
      drawer = room.players.find((candidate) => candidate.id === playerId);
      if (drawer?.socketId) {
        break;
      }
      drawer = undefined;
      this.#advanceTurnPosition(room);
      attempts += 1;
      if (room.currentCycle > room.settings.drawingCycles) {
        await this.#finishMatch(room);
        return;
      }
    }
    if (!drawer) {
      await this.#finishMatch(room);
      return;
    }

    const choices = this.#pickWordChoices(room);
    const now = this.#now();
    room.phase = "selecting";
    room.round = {
      turnId: this.#id(),
      drawerId: drawer.id,
      cycle: room.currentCycle,
      turnNumber: room.turnIndex + 1,
      choices,
      answer: null,
      normalizedAnswer: null,
      choiceDeadlineAt: now + room.settings.wordSelectionSeconds * 1_000,
      startedAt: null,
      deadlineAt: 0,
      resultDeadlineAt: null,
      pausedRemainingMs: null,
      pausedUntil: null,
      drawerPauseUsed: false,
      correctGuesses: [],
      drawerScoreAwarded: 0,
      drawingLog: [],
      drawingOperationIds: {},
      drawingPointCount: 0,
      drawingByteCount: 0,
      nextServerSequence: 1,
      strokeChunks: {},
      undoStack: [],
      redoStack: [],
    };
    this.#incrementRevision(room);
    await this.#saveRoom(room);
    this.#publishSnapshots(room);
    this.#emitRoom(room.code, "round:selection-started", {
      revision: room.revision,
      round: this.#publicRound(room),
    });
    const drawerSocketId = drawer.socketId;
    if (!drawerSocketId) {
      await this.#endTurn(room, "drawer-disconnected");
      return;
    }
    this.#emitSocket(drawerSocketId, "round:private", {
      revision: room.revision,
      privateRound: {
        turnId: room.round.turnId,
        answer: null,
        wordChoices: this.#threeChoices(choices),
      },
    });
    const selectingTurnId = room.round.turnId;
    this.#schedule(
      this.#phaseTimerKey(room.code),
      room.round.choiceDeadlineAt,
      async () => {
        const current = await this.#loadRoom(room.code);
        if (
          current?.phase === "selecting" &&
          current.round?.turnId === selectingTurnId &&
          current.round.pausedUntil === null
        ) {
          await this.#startDrawing(current, 0);
        }
      },
    );
  }

  async #startDrawing(room: AuthoritativeRoom, choiceIndex: number): Promise<void> {
    if (!room.round) {
      return;
    }
    this.#cancelTimer(this.#phaseTimerKey(room.code));
    const answer = room.round.choices[choiceIndex];
    if (!answer) {
      throw new GameError("INVALID_WORD", "That word choice is not available.");
    }
    const now = this.#now();
    room.phase = "drawing";
    room.round.answer = answer;
    room.round.normalizedAnswer = this.#rules.normalizeText(answer);
    room.round.startedAt = now;
    room.round.deadlineAt = now + room.settings.turnSeconds * 1_000;
    room.round.pausedRemainingMs = null;
    room.round.pausedUntil = null;
    this.#incrementRevision(room);
    await this.#saveRoom(room);
    this.#publishSnapshots(room);
    this.#emitRoom(room.code, "round:started", {
      revision: room.revision,
      round: this.#publicRound(room),
    });
    const drawer = room.players.find((candidate) => candidate.id === room.round?.drawerId);
    if (drawer?.socketId) {
      this.#emitSocket(drawer.socketId, "round:private", {
        revision: room.revision,
        privateRound: {
          turnId: room.round.turnId,
          answer,
          wordChoices: this.#threeChoices(room.round.choices),
        },
      });
    }
    const drawingTurnId = room.round.turnId;
    this.#schedule(this.#phaseTimerKey(room.code), room.round.deadlineAt, async () => {
      const current = await this.#loadRoom(room.code);
      if (
        current?.phase === "drawing" &&
        current.round?.turnId === drawingTurnId &&
        current.round.pausedUntil === null
      ) {
        await this.#endTurn(current, "time-expired");
      }
    });
  }

  async #endTurn(room: AuthoritativeRoom, reason: TurnEndReason): Promise<void> {
    if (!room.round || room.phase === "turn-results" || room.phase === "final-results") {
      return;
    }
    this.#cancelTimer(this.#phaseTimerKey(room.code));
    this.#cancelTimer(this.#drawerPauseTimerKey(room.code));
    const round = room.round;
    const drawer = room.players.find((candidate) => candidate.id === round.drawerId);
    const scoreChanges: ScoreChange[] = round.correctGuesses.flatMap((guess) => {
        const guesser = room.players.find((candidate) => candidate.id === guess.playerId);
        return guesser
          ? [{
              playerId: guess.playerId,
              delta: guess.scoreAwarded,
              total: guesser.score,
              reason: "correct-guess" as const,
            }]
          : [];
      });
    if (drawer) {
      round.drawerScoreAwarded = this.#rules.calculateDrawerScore(
        round.correctGuesses.length,
      );
      drawer.score += round.drawerScoreAwarded;
      if (round.drawerScoreAwarded > 0) {
        scoreChanges.push({
          playerId: drawer.id,
          delta: round.drawerScoreAwarded,
          total: drawer.score,
          reason: "drawer-guesses",
        });
      }
    }
    room.phase = "turn-results";
    round.pausedUntil = null;
    round.pausedRemainingMs = null;
    round.resultDeadlineAt = this.#now() + TURN_RESULTS_MS;
    this.#incrementRevision(room);
    const result: TurnResult = {
      turnId: round.turnId,
      answer: round.answer ?? round.choices[0] ?? "Unknown",
      drawerId: round.drawerId,
      correctPlayerIds: round.correctGuesses.map((guess) => guess.playerId),
      scoreChanges,
      endedAt: this.#now(),
      reason,
    };
    await this.#saveRoom(room);
    this.#emitRoom(room.code, "round:ended", {
      revision: room.revision,
      result,
      snapshot: this.#publicSnapshot(room),
    });
    if (scoreChanges.length > 0) {
      this.#emitRoom(room.code, "score:updated", {
        revision: room.revision,
        changes: scoreChanges,
      });
    }
    this.#publishSnapshots(room);
    this.#schedule(this.#phaseTimerKey(room.code), round.resultDeadlineAt, async () => {
      const current = await this.#loadRoom(room.code);
      if (
        current?.phase === "turn-results" &&
        current.round?.turnId === round.turnId
      ) {
        this.#incorporatePendingPlayers(current);
        this.#advanceTurnPosition(current);
        await this.#beginTurn(current);
      }
    });
  }

  async #finishMatch(room: AuthoritativeRoom): Promise<void> {
    this.#cancelTimer(this.#phaseTimerKey(room.code));
    this.#cancelTimer(this.#drawerPauseTimerKey(room.code));
    room.phase = "final-results";
    room.round = null;
    room.turnOrder = [];
    room.pendingTurnPlayerIds = [];
    this.#incrementRevision(room);
    await this.#saveRoom(room);
    for (const player of room.players) {
      if (player.socketId) {
        this.#emitSocket(player.socketId, "match:finished", {
          revision: room.revision,
          snapshot: this.snapshotFor(room, player.id),
        });
      }
    }
    this.#publishSnapshots(room);
  }

  #advanceTurnPosition(room: AuthoritativeRoom): void {
    room.turnIndex += 1;
    if (room.turnIndex >= room.turnOrder.length) {
      room.turnIndex = 0;
      room.currentCycle += 1;
    }
  }

  #incorporatePendingPlayers(room: AuthoritativeRoom): void {
    for (const playerId of room.pendingTurnPlayerIds) {
      if (
        room.players.some((player) => player.id === playerId) &&
        !room.turnOrder.includes(playerId)
      ) {
        room.turnOrder.push(playerId);
      }
    }
    room.pendingTurnPlayerIds = [];
  }

  async #resumeDrawerIfNeeded(
    room: AuthoritativeRoom,
    player: ServerPlayer,
  ): Promise<boolean> {
    if (
      !room.round ||
      room.round.drawerId !== player.id ||
      room.round.pausedUntil === null ||
      room.round.pausedRemainingMs === null ||
      (room.phase !== "selecting" && room.phase !== "drawing")
    ) {
      return false;
    }
    this.#cancelTimer(this.#drawerPauseTimerKey(room.code));
    const remaining = room.round.pausedRemainingMs;
    room.round.pausedUntil = null;
    room.round.pausedRemainingMs = null;
    if (room.phase === "selecting") {
      room.round.choiceDeadlineAt = this.#now() + remaining;
      this.#schedule(
        this.#phaseTimerKey(room.code),
        room.round.choiceDeadlineAt,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (
            current?.phase === "selecting" &&
            current.round?.turnId === room.round?.turnId
          ) {
            await this.#startDrawing(current, 0);
          }
        },
      );
    } else {
      room.round.deadlineAt = this.#now() + remaining;
      this.#schedule(this.#phaseTimerKey(room.code), room.round.deadlineAt, async () => {
        const current = await this.#loadRoom(room.code);
        if (
          current?.phase === "drawing" &&
          current.round?.turnId === room.round?.turnId
        ) {
          await this.#endTurn(current, "time-expired");
        }
      });
    }
    return true;
  }

  async #expireDisconnectedSeat(roomCode: string, playerId: string): Promise<void> {
    const room = await this.#loadRoom(roomCode);
    const player = room?.players.find((candidate) => candidate.id === playerId);
    if (!room || !player || player.socketId || player.disconnectedAt === null) {
      return;
    }
    if (player.disconnectedAt + this.#config.disconnectedSeatMs > this.#now()) {
      return;
    }
    const session = this.#sessions.get(player.sessionId);
    await this.#removePlayer(room, player, "expired");
    if (session) {
      session.roomCode = null;
      session.playerId = null;
      await this.#saveSession(session);
    }
    this.#incrementRevision(room);
    await this.#saveRoom(room);
    this.#publishSnapshots(room);
  }

  async #removePlayer(
    room: AuthoritativeRoom,
    player: ServerPlayer,
    reason: "left" | "kicked" | "expired",
  ): Promise<void> {
    const wasHost = room.hostPlayerId === player.id;
    const removedTurnIndex = room.turnOrder.indexOf(player.id);
    room.players = room.players.filter((candidate) => candidate.id !== player.id);
    room.turnOrder = room.turnOrder.filter((playerId) => playerId !== player.id);
    if (removedTurnIndex >= 0 && removedTurnIndex <= room.turnIndex) {
      room.turnIndex -= 1;
    }
    room.pendingTurnPlayerIds = room.pendingTurnPlayerIds.filter(
      (playerId) => playerId !== player.id,
    );
    this.#cancelTimer(this.#seatTimerKey(room.code, player.id));
    this.#emitRoom(room.code, "room:player-left", {
      revision: room.revision + 1,
      playerId: player.id,
      reason,
      reconnectDeadline: null,
    });
    if (wasHost) {
      this.#transferHost(room, player.id);
    }
    if (room.players.length === 0) {
      this.#schedule(
        this.#emptyTimerKey(room.code),
        this.#now() + this.#config.emptyRoomTtlMs,
        async () => this.#expireRoom(room.code),
      );
    }
  }

  #transferHost(room: AuthoritativeRoom, previousHostId: string): void {
    const nextHost = room.players
      .filter((player) => player.socketId)
      .sort(
        (left, right) =>
          left.connectedAt - right.connectedAt || left.joinOrder - right.joinOrder,
      )[0];
    for (const player of room.players) {
      player.isHost = player.id === nextHost?.id;
    }
    room.hostPlayerId = nextHost?.id ?? "";
    if (nextHost) {
      this.#emitRoom(room.code, "room:host-transferred", {
        revision: room.revision + 1,
        previousHostId,
        hostId: nextHost.id,
      });
    }
  }

  #canonicalizeSettings(
    settingsInput: RoomSettings,
    customThemeInput?: CustomThemeInput,
    existingCustomTheme?: CustomThemeInput | null,
  ): { settings: RoomSettings; customTheme: CustomThemeInput | null } {
    if (settingsInput.theme.isCustom) {
      const selectedTheme =
        customThemeInput ??
        (existingCustomTheme?.id === settingsInput.theme.id
          ? existingCustomTheme
          : undefined);
      if (!selectedTheme) {
        throw new GameError("INVALID_THEME", "The selected custom theme is missing.");
      }
      const validation = this.#rules.validateCustomTheme(selectedTheme);
      if (!validation.valid) {
        throw new GameError(
          "INVALID_THEME",
          validation.errors[0] ?? "The custom theme is invalid.",
        );
      }
      const customTheme: CustomThemeInput = {
        id: selectedTheme.id || this.#id(),
        name: selectedTheme.name.trim(),
        words: validation.normalizedWords,
      };
      return {
        settings: {
          ...structuredClone(settingsInput),
          theme: {
            id: customTheme.id,
            name: customTheme.name,
            isCustom: true,
            wordCount: customTheme.words.length,
          },
        },
        customTheme,
      };
    }

    const theme = this.#rules.getTheme(settingsInput.theme.id);
    if (!theme) {
      throw new GameError("INVALID_THEME", "Choose an available preset theme.");
    }
    return {
      settings: {
        ...structuredClone(settingsInput),
        theme: {
          id: theme.id,
          name: theme.name,
          isCustom: false,
          wordCount: theme.words.length,
        },
      },
      customTheme: null,
    };
  }

  #pickWordChoices(room: AuthoritativeRoom): [string, string, string] {
    const words = room.customTheme?.words ?? this.#rules.getTheme(room.settings.theme.id)?.words;
    if (!words || words.length < 3) {
      throw new GameError("INVALID_THEME", "This theme needs at least three words.");
    }
    const pool = [...new Set(words)];
    const choices: string[] = [];
    while (choices.length < 3 && pool.length > 0) {
      const index = Math.floor(this.#random() * pool.length);
      const [choice] = pool.splice(Math.min(index, pool.length - 1), 1);
      if (choice) {
        choices.push(choice);
      }
    }
    return this.#threeChoices(choices);
  }

  #validateDrawingStackBatch(
    operations: DrawingOp[],
    actionId: string,
    chunkId: number,
    undoStack: string[],
    redoStack: string[],
  ): void {
    const controlOperations = operations.filter(
      (operation) => operation.kind === "undo" || operation.kind === "redo",
    );
    if (controlOperations.length > 0 && operations.length !== 1) {
      throw new GameError(
        "INVALID_PAYLOAD",
        "Undo and redo must be sent as individual drawing actions.",
      );
    }
    const operation = operations[0];
    if (!operation) {
      return;
    }
    if (operation.kind === "undo") {
      if (undoStack.at(-1) !== operation.targetOpId) {
        throw new GameError(
          "DRAWING_SEQUENCE_GAP",
          "Undo must target the latest visible action.",
        );
      }
      undoStack.pop();
      redoStack.push(operation.targetOpId);
      return;
    }
    if (operation.kind === "redo") {
      if (redoStack.at(-1) !== operation.targetOpId) {
        throw new GameError(
          "DRAWING_SEQUENCE_GAP",
          "Redo must target the latest undone action.",
        );
      }
      redoStack.pop();
      undoStack.push(operation.targetOpId);
      return;
    }
    if (chunkId === 0) {
      if (undoStack.includes(actionId)) {
        throw new GameError("DRAWING_SEQUENCE_GAP", "Drawing action IDs must be unique.");
      }
      undoStack.push(actionId);
      redoStack.splice(0);
    }
  }

  #publicSnapshot(room: AuthoritativeRoom): RoomSnapshot {
    return {
      code: room.code,
      revision: room.revision,
      phase: room.phase,
      settings: structuredClone(room.settings),
      players: room.players
        .map((player) => this.#publicPlayer(room, player))
        .sort((left, right) => left.joinOrder - right.joinOrder),
      round: room.round ? this.#publicRound(room) : null,
      drawing: room.round ? this.#drawingReplay(room, 0) : null,
      chat: structuredClone(room.chat),
      serverTime: this.#now(),
      createdAt: room.createdAt,
      expiresAt: room.expiresAt,
    };
  }

  #publicPlayer(room: AuthoritativeRoom, player: ServerPlayer): PlayerPublic {
    return {
      id: player.id,
      name: player.name,
      avatar: structuredClone(player.avatar),
      score: player.score,
      isHost: room.hostPlayerId === player.id,
      isConnected: player.socketId !== null,
      hasGuessed:
        room.round?.correctGuesses.some((guess) => guess.playerId === player.id) ?? false,
      isDrawing: room.round?.drawerId === player.id,
      joinedAt: player.joinedAt,
      joinOrder: player.joinOrder,
      disconnectedUntil:
        player.disconnectedAt === null
          ? null
          : player.disconnectedAt + this.#config.disconnectedSeatMs,
    };
  }

  #publicRound(room: AuthoritativeRoom): RoundPublic {
    if (!room.round || room.phase === "lobby" || room.phase === "final-results") {
      throw new GameError("INTERNAL_ERROR", "The room has no public round.");
    }
    return {
      turnId: room.round.turnId,
      phase: room.phase,
      drawerId: room.round.drawerId,
      cycle: room.round.cycle,
      cycleCount: room.settings.drawingCycles,
      turn: room.round.turnNumber,
      turnCount: room.turnOrder.length,
      wordMask:
        room.round.answer && room.phase !== "selecting"
          ? this.#wordMask(room.round.answer)
          : null,
      selectionDeadline:
        room.phase === "selecting" ? room.round.choiceDeadlineAt : null,
      drawingDeadline: room.phase === "drawing" ? room.round.deadlineAt : null,
      pausedUntil: room.round.pausedUntil,
      guessedPlayerIds: room.round.correctGuesses.map((guess) => guess.playerId),
      correctGuessCount: room.round.correctGuesses.length,
    };
  }

  #drawingReplay(room: AuthoritativeRoom, afterSequence: number): ReplayState {
    const round = room.round;
    if (!round) {
      throw new GameError("STALE_TURN", "There is no drawing to replay.");
    }
    const latestSequence = Math.max(0, round.nextServerSequence - 1);
    if (afterSequence > latestSequence) {
      throw new GameError(
        "DRAWING_SEQUENCE_GAP",
        "The requested drawing sequence is ahead of the server.",
        {
          currentRevision: room.revision,
          latestSequence,
        },
      );
    }
    const operations = round.drawingLog.filter(
      (envelope) => envelope.serverSequence > afterSequence,
    );
    return {
      revision: room.revision,
      turnId: round.turnId,
      fromSequence: operations[0]?.serverSequence ?? afterSequence,
      throughSequence:
        operations.at(-1)?.serverSequence ?? latestSequence,
      operations: structuredClone(operations),
    };
  }

  #wordMask(answer: string): { pattern: string; letters: number; words: number } {
    const characters = Array.from(answer);
    return {
      pattern: characters
        .map((character) => (/[\p{L}\p{N}]/u.test(character) ? "_" : character))
        .join(""),
      letters: characters.filter((character) => /[\p{L}\p{N}]/u.test(character)).length,
      words: Math.max(1, answer.trim().split(/\s+/u).length),
    };
  }

  #publishSnapshots(room: AuthoritativeRoom): void {
    for (const player of room.players) {
      if (player.socketId) {
        this.#emitSocket(player.socketId, "room:snapshot", this.snapshotFor(room, player.id));
      }
    }
  }

  #assertHost(room: AuthoritativeRoom, player: ServerPlayer): void {
    if (room.hostPlayerId !== player.id) {
      throw new GameError("NOT_HOST", "Only the room host can do that.");
    }
  }

  #assertCurrentTurn(room: AuthoritativeRoom, turnId: string): void {
    if (!room.round || room.round.turnId !== turnId) {
      throw new GameError("STALE_TURN", "That action belongs to an earlier turn.");
    }
  }

  #assertExpectedRevision(room: AuthoritativeRoom, expected?: number): void {
    if (expected !== undefined && expected !== room.revision) {
      throw new GameError("STALE_REVISION", "Your room state is out of date.", {
        currentRevision: room.revision,
      });
    }
  }

  async #requireMembership(socketId: string): Promise<{
    session: SessionState;
    room: AuthoritativeRoom;
    player: ServerPlayer;
  }> {
    const session = this.#requireSession(socketId);
    if (!session.roomCode || !session.playerId) {
      throw new GameError("NOT_IN_ROOM", "Join a room before doing that.");
    }
    const room = await this.#loadRoom(session.roomCode);
    if (!room) {
      session.roomCode = null;
      session.playerId = null;
      await this.#saveSession(session);
      throw new GameError("ROOM_EXPIRED", "That room has expired.");
    }
    const player = room.players.find(
      (candidate) =>
        candidate.id === session.playerId && candidate.sessionId === session.sessionId,
    );
    if (!player) {
      throw new GameError(
        room.kickedSessionIds.includes(session.sessionId) ? "KICKED" : "NOT_IN_ROOM",
        "Your seat is no longer available.",
      );
    }
    return { session, room, player };
  }

  #requireSession(socketId: string): SessionState {
    const session = this.#sessionForSocket(socketId, false);
    if (!session) {
      throw new GameError("UNAUTHORIZED", "Reconnect to establish a guest session.");
    }
    return session;
  }

  #sessionForSocket(socketId: string, required: true): SessionState;
  #sessionForSocket(socketId: string, required: false): SessionState | undefined;
  #sessionForSocket(socketId: string, required: boolean): SessionState | undefined {
    const sessionId = this.#socketSessions.get(socketId);
    const session = sessionId ? this.#sessions.get(sessionId) : undefined;
    if (!session && required) {
      throw new GameError("UNAUTHORIZED", "Reconnect to establish a guest session.");
    }
    return session;
  }

  async #availableRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = this.#rules.generateRoomCode();
      if (this.#rooms.has(code) || this.#reservedRoomCodes.has(code)) {
        continue;
      }
      const persistedRoom = await this.#persistence.getRoom(code);
      if (
        !persistedRoom &&
        !this.#rooms.has(code) &&
        !this.#reservedRoomCodes.has(code)
      ) {
        this.#reservedRoomCodes.add(code);
        return code;
      }
    }
    throw new GameError("SERVER_UNAVAILABLE", "Could not reserve a room code.");
  }

  async #loadRoom(codeInput: string): Promise<AuthoritativeRoom | null> {
    const code = this.#rules.normalizeRoomCode(codeInput);
    const cached = this.#rooms.get(code);
    if (cached) {
      if (cached.expiresAt <= this.#now()) {
        await this.#expireRoom(code);
        return null;
      }
      await this.#advanceExpiredPhase(cached);
      return cached;
    }
    const room = await this.#persistence.getRoom<AuthoritativeRoom>(code);
    if (!room || room.expiresAt <= this.#now()) {
      return null;
    }
    this.#prepareRehydratedRoom(room);
    this.#rooms.set(code, room);
    await this.#restoreRoomTimers(room);
    await this.#advanceExpiredPhase(room);
    return room;
  }

  async #advanceExpiredPhase(room: AuthoritativeRoom): Promise<void> {
    const now = this.#now();
    const round = room.round;
    if (!round) {
      return;
    }
    if (
      (room.phase === "selecting" || room.phase === "drawing") &&
      round.pausedUntil !== null
    ) {
      if (round.pausedUntil <= now) {
        await this.#endTurn(room, "drawer-disconnected");
      }
      return;
    }
    if (room.phase === "selecting" && round.choiceDeadlineAt <= now) {
      await this.#startDrawing(room, 0);
      return;
    }
    if (room.phase === "drawing" && round.deadlineAt <= now) {
      await this.#endTurn(room, "time-expired");
      return;
    }
    if (
      room.phase === "turn-results" &&
      round.resultDeadlineAt !== null &&
      round.resultDeadlineAt <= now
    ) {
      this.#incorporatePendingPlayers(room);
      this.#advanceTurnPosition(room);
      await this.#beginTurn(room);
    }
  }

  #prepareRehydratedRoom(room: AuthoritativeRoom): void {
    const now = this.#now();
    room.chat ??= [];
    room.recentCommands ??= {};
    if (room.round) {
      room.round.drawingOperationIds ??= Object.fromEntries(
        room.round.drawingLog.map((envelope) => [
          envelope.operation.opId,
          true as const,
        ]),
      );
      room.round.drawingPointCount ??= room.round.drawingLog.reduce(
        (total, envelope) =>
          total +
          (envelope.operation.kind === "stroke"
            ? envelope.operation.points.length
            : envelope.operation.kind === "shape"
              ? 2
              : 0),
        0,
      );
      room.round.drawingByteCount ??= room.round.drawingLog.reduce(
        (total, envelope) =>
          total + this.#drawingOperationBytes(envelope.operation),
        0,
      );
    }
    for (const player of room.players) {
      player.socketId = null;
      player.disconnectedAt ??= now;
    }
  }

  async #restoreRoomTimers(room: AuthoritativeRoom): Promise<void> {
    this.#scheduleAbsoluteExpiration(room);
    for (const player of room.players) {
      if (player.disconnectedAt !== null) {
        this.#schedule(
          this.#seatTimerKey(room.code, player.id),
          player.disconnectedAt + this.#config.disconnectedSeatMs,
          async () => this.#expireDisconnectedSeat(room.code, player.id),
        );
      }
    }
    if (room.players.length === 0) {
      this.#schedule(
        this.#emptyTimerKey(room.code),
        this.#now() + this.#config.emptyRoomTtlMs,
        async () => this.#expireRoom(room.code),
      );
      return;
    }
    if (
      room.round &&
      (room.phase === "selecting" || room.phase === "drawing")
    ) {
      const restoredTurnId = room.round.turnId;
      if (room.round.pausedUntil !== null) {
        this.#schedule(
          this.#drawerPauseTimerKey(room.code),
          room.round.pausedUntil,
          async () => {
            const current = await this.#loadRoom(room.code);
            if (
              current?.round?.turnId === restoredTurnId &&
              current.round.pausedUntil !== null
            ) {
              await this.#endTurn(current, "drawer-disconnected");
            }
          },
        );
      } else if (!room.round.drawerPauseUsed) {
        const deadline =
          room.phase === "selecting"
            ? room.round.choiceDeadlineAt
            : room.round.deadlineAt;
        room.round.pausedRemainingMs = Math.max(0, deadline - this.#now());
        room.round.pausedUntil = this.#now() + this.#config.drawerPauseMs;
        room.round.drawerPauseUsed = true;
        this.#schedule(
          this.#drawerPauseTimerKey(room.code),
          room.round.pausedUntil,
          async () => {
            const current = await this.#loadRoom(room.code);
            if (
              current?.round?.turnId === restoredTurnId &&
              current.round.pausedUntil !== null
            ) {
              await this.#endTurn(current, "drawer-disconnected");
            }
          },
        );
        this.#incrementRevision(room);
        await this.#saveRoom(room);
      } else {
        await this.#endTurn(room, "drawer-disconnected");
      }
    } else if (room.phase === "turn-results" && room.round?.resultDeadlineAt) {
      this.#schedule(
        this.#phaseTimerKey(room.code),
        room.round.resultDeadlineAt,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (current?.phase === "turn-results") {
            this.#incorporatePendingPlayers(current);
            this.#advanceTurnPosition(current);
            await this.#beginTurn(current);
          }
        },
      );
    }
  }

  async #saveRoom(room: AuthoritativeRoom): Promise<void> {
    if (this.#expiredRooms.has(room)) {
      return;
    }
    const now = this.#now();
    room.lastActiveAt = now;
    const isEmpty = !room.players.some((player) => player.socketId);
    const expiresAt = isEmpty
      ? Math.min(room.expiresAt, now + this.#config.emptyRoomTtlMs)
      : room.expiresAt;
    const value = structuredClone(room);
    for (const player of value.players) {
      player.socketId = null;
    }
    const envelope = {
      code: room.code,
      createdAt: room.createdAt,
      expiresAt,
      isEmpty,
      value,
    };
    await this.#enqueueRoomPersistence(room.code, async () => {
      if (!this.#expiredRooms.has(room)) {
        await this.#persistence.saveRoom(envelope);
      }
    });
  }

  #enqueueRoomPersistence(
    roomCode: string,
    operation: () => Promise<void>,
  ): Promise<void> {
    const previous =
      this.#roomPersistenceChains.get(roomCode) ?? Promise.resolve();
    const current = previous.catch(() => undefined).then(operation);
    this.#roomPersistenceChains.set(roomCode, current);
    void current
      .finally(() => {
        if (this.#roomPersistenceChains.get(roomCode) === current) {
          this.#roomPersistenceChains.delete(roomCode);
        }
      })
      .catch(() => undefined);
    return current;
  }

  async #saveSession(session: SessionState): Promise<void> {
    const persisted: PersistedSession = {
      sessionId: session.sessionId,
      reconnectTokenHash: session.reconnectTokenHash,
      playerId: session.playerId,
      roomCode: session.roomCode,
      createdAt: session.createdAt,
      expiresAt: session.expiresAt,
      recentCommands: structuredClone(session.recentCommands),
    };
    await this.#persistence.saveSession(persisted);
  }

  async #expireRoom(code: string): Promise<void> {
    const room = this.#rooms.get(code);
    if (room) {
      this.#expiredRooms.add(room);
      this.#emitRoom(code, "room:kicked", {
        revision: room.revision,
        code: "ROOM_EXPIRED",
        reason: "This room has expired.",
      });
      for (const player of room.players) {
        if (player.socketId) {
          await this.#transport.leave(player.socketId, code);
        }
        const session = this.#sessions.get(player.sessionId);
        if (session) {
          session.roomCode = null;
          session.playerId = null;
          await this.#saveSession(session);
        }
      }
    }
    this.#clearRoomTimers(code);
    this.#rooms.delete(code);
    await this.#enqueueRoomPersistence(code, () =>
      this.#persistence.deleteRoom(code),
    );
  }

  #incrementRevision(room: AuthoritativeRoom): void {
    room.revision += 1;
    room.lastActiveAt = this.#now();
  }

  #cachedCommand<T>(
    room: AuthoritativeRoom,
    sessionId: string,
    idempotencyId: string,
    event: string,
  ): T | undefined {
    const entry = room.recentCommands[sessionId]?.find(
      (candidate) => candidate.id === idempotencyId,
    );
    if (entry && entry.event !== event) {
      throw new GameError(
        "DUPLICATE_EVENT",
        "That idempotency ID was already used for a different action.",
      );
    }
    return entry?.result as T | undefined;
  }

  #recordCommand(
    room: AuthoritativeRoom,
    sessionId: string,
    idempotencyId: string,
    event: string,
    result: unknown,
  ): void {
    const commands = (room.recentCommands[sessionId] ??= []);
    commands.push({ id: idempotencyId, event, result: structuredClone(result) });
    if (commands.length > MAX_RECENT_COMMANDS_PER_SESSION) {
      commands.splice(0, commands.length - MAX_RECENT_COMMANDS_PER_SESSION);
    }
  }

  #sessionEstablishedResult(
    room: AuthoritativeRoom,
    player: ServerPlayer,
    session: SessionState,
  ): EngineMutationResult<{
    snapshot: PlayerRoomSnapshot;
    credentials: { playerId: string; reconnectToken: string };
  }> {
    return {
      revision: room.revision,
      data: {
        snapshot: this.snapshotFor(room, player.id),
        credentials: {
          playerId: player.id,
          reconnectToken: session.reconnectToken,
        },
      },
    };
  }

  #replaceCachedCommandResult(
    room: AuthoritativeRoom,
    sessionId: string,
    idempotencyId: string,
    event: string,
    result: unknown,
  ): void {
    const command = room.recentCommands[sessionId]?.find(
      (entry) => entry.id === idempotencyId,
    );
    if (command) {
      if (command.event !== event) {
        throw new GameError(
          "DUPLICATE_EVENT",
          "That idempotency ID was already used for a different action.",
        );
      }
      command.result = structuredClone(result);
      return;
    }
    this.#recordCommand(room, sessionId, idempotencyId, event, result);
  }

  #cachedSessionCommand<T>(
    session: SessionState,
    idempotencyId: string,
    event: string,
  ): T | undefined {
    const entry = session.recentCommands.find(
      (candidate) => candidate.id === idempotencyId,
    );
    if (entry && entry.event !== event) {
      throw new GameError(
        "DUPLICATE_EVENT",
        "That idempotency ID was already used for a different action.",
      );
    }
    return entry?.result as T | undefined;
  }

  #recordSessionCommand(
    session: SessionState,
    idempotencyId: string,
    event: string,
    result: unknown,
  ): void {
    session.recentCommands.push({
      id: idempotencyId,
      event,
      result: structuredClone(result),
    });
    if (session.recentCommands.length > MAX_RECENT_COMMANDS_PER_SESSION) {
      session.recentCommands.splice(
        0,
        session.recentCommands.length - MAX_RECENT_COMMANDS_PER_SESSION,
      );
    }
  }

  #hashToken(token: string): string {
    return createHmac("sha256", this.#config.sessionSecret)
      .update(token)
      .digest("base64url");
  }

  #drawingOperationBytes(operation: DrawingOp): number {
    return Buffer.byteLength(JSON.stringify(operation), "utf8") + 192;
  }

  #threeChoices(choices: string[]): [string, string, string] {
    const [first, second, third] = choices;
    if (!first || !second || !third) {
      throw new GameError("INVALID_THEME", "A theme must provide three unique words.");
    }
    return [first, second, third];
  }

  #schedule(
    key: string,
    deadline: number,
    callback: () => Promise<void>,
  ): void {
    this.#cancelTimer(key);
    const delay = Math.max(0, deadline - this.#now());
    const timer = setTimeout(() => {
      this.#timers.delete(key);
      void callback().catch(() => {
        // Keep logs metadata-only: scheduled failures must never expose chat
        // or secret-word payloads.
        console.error("Scheduled game transition failed", { timerKey: key });
        this.#schedule(
          key,
          this.#now() + 1_000,
          async () => {
            const roomCode = key.split(":", 1)[0];
            const room = roomCode ? this.#rooms.get(roomCode) : undefined;
            if (!room) {
              await callback();
              return;
            }
            await this.#saveRoom(room);
            this.#armCurrentPhaseTimer(room);
          },
        );
      });
    }, delay);
    timer.unref?.();
    this.#timers.set(key, timer);
  }

  #armCurrentPhaseTimer(room: AuthoritativeRoom): void {
    const round = room.round;
    if (!round) {
      return;
    }
    const turnId = round.turnId;
    if (
      (room.phase === "selecting" || room.phase === "drawing") &&
      round.pausedUntil !== null
    ) {
      this.#schedule(
        this.#drawerPauseTimerKey(room.code),
        round.pausedUntil,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (
            current?.round?.turnId === turnId &&
            current.round.pausedUntil !== null
          ) {
            await this.#endTurn(current, "drawer-disconnected");
          }
        },
      );
      return;
    }
    if (room.phase === "selecting") {
      this.#schedule(
        this.#phaseTimerKey(room.code),
        round.choiceDeadlineAt,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (
            current?.phase === "selecting" &&
            current.round?.turnId === turnId
          ) {
            await this.#startDrawing(current, 0);
          }
        },
      );
      return;
    }
    if (room.phase === "drawing") {
      this.#schedule(
        this.#phaseTimerKey(room.code),
        round.deadlineAt,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (
            current?.phase === "drawing" &&
            current.round?.turnId === turnId
          ) {
            await this.#endTurn(current, "time-expired");
          }
        },
      );
      return;
    }
    if (room.phase === "turn-results" && round.resultDeadlineAt !== null) {
      this.#schedule(
        this.#phaseTimerKey(room.code),
        round.resultDeadlineAt,
        async () => {
          const current = await this.#loadRoom(room.code);
          if (
            current?.phase === "turn-results" &&
            current.round?.turnId === turnId
          ) {
            this.#incorporatePendingPlayers(current);
            this.#advanceTurnPosition(current);
            await this.#beginTurn(current);
          }
        },
      );
    }
  }

  #cancelTimer(key: string): void {
    const timer = this.#timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.#timers.delete(key);
    }
  }

  #clearRoomTimers(roomCode: string): void {
    for (const key of this.#timers.keys()) {
      if (key.startsWith(`${roomCode}:`)) {
        this.#cancelTimer(key);
      }
    }
  }

  #scheduleAbsoluteExpiration(room: AuthoritativeRoom): void {
    this.#schedule(this.#absoluteTimerKey(room.code), room.expiresAt, async () => {
      await this.#expireRoom(room.code);
    });
  }

  #phaseTimerKey = (roomCode: string): string => `${roomCode}:phase`;
  #drawerPauseTimerKey = (roomCode: string): string => `${roomCode}:drawer-pause`;
  #seatTimerKey = (roomCode: string, playerId: string): string =>
    `${roomCode}:seat:${playerId}`;
  #emptyTimerKey = (roomCode: string): string => `${roomCode}:empty`;
  #absoluteTimerKey = (roomCode: string): string => `${roomCode}:absolute`;

  #emitSocket(socketId: string, event: string, payload: unknown): void {
    this.#transport.emit({
      target: { kind: "socket", socketId },
      event,
      payload,
    });
  }

  #emitRoom(
    roomCode: string,
    event: string,
    payload: unknown,
    exceptSocketId?: string,
  ): void {
    this.#transport.emit({
      target: { kind: "room", roomCode },
      event,
      payload,
      ...(exceptSocketId ? { exceptSocketId } : {}),
    });
  }
}
