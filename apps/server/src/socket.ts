import type { Server as HttpServer } from "node:http";
import type { ZodType } from "zod";
import {
  ChatSendRequestSchema,
  CreateRoomRequestSchema,
  DrawingBatchRequestSchema,
  DrawingReplayRequestSchema,
  GuessSubmitRequestSchema,
  JoinRoomRequestSchema,
  KickPlayerRequestSchema,
  LeaveRoomRequestSchema,
  PhoneDrawingBatchRequestSchema,
  PhoneDrawingSubmitRequestSchema,
  PhoneSummaryNavigateRequestSchema,
  PhoneTextSubmitRequestSchema,
  ResumeSessionRequestSchema,
  SelectWordRequestSchema,
  SnapshotRequestSchema,
  SOCKET_RATE_LIMITS,
  StartMatchRequestSchema,
  UpdateProfileRequestSchema,
  UpdateSettingsRequestSchema,
  type AckEnvelope,
  type ClientToServerEvents,
  type ContractError,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from "@gtd/contracts";
import {
  Server as SocketIoServer,
  type BroadcastOperator,
  type Socket,
} from "socket.io";
import type { EngineTransport } from "./domain.js";
import type { ConnectedSession, GameEngine } from "./engine.js";
import { GameError } from "./errors.js";
import { EventRateLimiter, type RateLimit } from "./rate-limit.js";

export type GameSocketServer = SocketIoServer<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type GameSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

type Ack<T> = (response: AckEnvelope<T>) => void;

const socketEstablishments = new WeakMap<GameSocket, Promise<void>>();

const MUTATION_RATE: RateLimit = {
  limit: SOCKET_RATE_LIMITS.mutationsPerTenSeconds,
  intervalMs: 10_000,
};
const CHAT_RATE: RateLimit = {
  limit: SOCKET_RATE_LIMITS.chatPerTenSeconds,
  intervalMs: 10_000,
};
const GUESS_RATE: RateLimit = {
  limit: SOCKET_RATE_LIMITS.guessesPerTenSeconds,
  intervalMs: 10_000,
};
const DRAWING_RATE: RateLimit = {
  limit: SOCKET_RATE_LIMITS.drawingBatchesPerSecond,
  intervalMs: 1_000,
};
const RECOVERY_RATE: RateLimit = { limit: 20, intervalMs: 10_000 };
const DRAWING_PAYLOAD_BYTES = 128 * 1_024;

export function createSocketServer(
  httpServer: HttpServer,
  origins: readonly string[],
): GameSocketServer {
  return new SocketIoServer(httpServer, {
    transports: ["websocket", "polling"],
    maxHttpBufferSize: 256 * 1_024,
    pingInterval: 20_000,
    pingTimeout: 20_000,
    connectionStateRecovery: {
      maxDisconnectionDuration: 30_000,
      skipMiddlewares: false,
    },
    cors: {
      origin(origin, callback) {
        if (!origin || origins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed"));
      },
      credentials: true,
    },
  });
}

export class SocketIoTransport implements EngineTransport {
  readonly #io: GameSocketServer;

  constructor(io: GameSocketServer) {
    this.#io = io;
  }

  emit(delivery: Parameters<EngineTransport["emit"]>[0]): void {
    if (delivery.target.kind === "socket") {
      const socket = this.#io.sockets.sockets.get(delivery.target.socketId);
      if (socket) {
        this.#emitUntyped(socket, delivery.event, delivery.payload);
      }
      return;
    }

    let operator: BroadcastOperator<ServerToClientEvents, SocketData> = this.#io.to(
      delivery.target.roomCode,
    );
    if (delivery.exceptSocketId) {
      operator = operator.except(delivery.exceptSocketId);
    }
    this.#emitUntyped(operator, delivery.event, delivery.payload);
  }

  async join(socketId: string, roomCode: string): Promise<void> {
    await this.#io.sockets.sockets.get(socketId)?.join(roomCode);
  }

  async leave(socketId: string, roomCode: string): Promise<void> {
    await this.#io.sockets.sockets.get(socketId)?.leave(roomCode);
  }

  #emitUntyped(
    emitter: Socket | BroadcastOperator<ServerToClientEvents, SocketData>,
    event: string,
    payload: unknown,
  ): void {
    (
      emitter.emit as unknown as (eventName: string, eventPayload: unknown) => unknown
    )(event, payload);
  }
}

export function registerSocketHandlers(
  io: GameSocketServer,
  engine: GameEngine,
  limiter = new EventRateLimiter(),
): void {
  io.on("connection", (socket) => {
    establishSocket(socket, engine, limiter);
  });
}

function establishSocket(
  socket: GameSocket,
  engine: GameEngine,
  limiter: EventRateLimiter,
): void {
  const establishment = initializeSocket(socket, engine);
  socketEstablishments.set(socket, establishment);
  void establishment.catch((error: unknown) => {
    socket.emit("room:error", toContractError(error));
    socket.disconnect(true);
  });

  socket.on("session:resume", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      ResumeSessionRequestSchema,
      rawRequest,
      ack,
      undefined,
      RECOVERY_RATE,
      async (request) => {
        const connected = await engine.resumeSession(
          socket.id,
          request.code,
          request.credentials.playerId,
          request.credentials.reconnectToken,
        );
        applySocketData(socket, connected);
        if (!connected.snapshot || !connected.playerId) {
          throw new GameError("UNAUTHORIZED", "The room seat could not be recovered.");
        }
        return {
          data: {
            credentials: {
              playerId: connected.playerId,
              reconnectToken: connected.reconnectToken,
            },
            snapshot: connected.snapshot,
            recovered: true,
          },
          revision: connected.snapshot.revision,
        };
      },
    );
  });

  socket.on("room:create", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      CreateRoomRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.createRoom(socket.id, {
          idempotencyId: request.mutation.idempotencyId,
          ...(request.mutation.expectedRevision === undefined
            ? {}
            : { expectedRevision: request.mutation.expectedRevision }),
          name: request.profile.name,
          avatar: request.profile.avatar,
          settings: request.settings,
          ...(request.customTheme
            ? {
                customTheme: {
                  id:
                    request.customTheme.id ??
                    (request.settings.mode === "phone"
                      ? ""
                      : request.settings.theme.id),
                  name: request.customTheme.name,
                  words: request.customTheme.words,
                },
              }
            : {}),
        });
        socket.data.playerId = result.data.credentials.playerId;
        socket.data.roomCode = result.data.snapshot.code;
        return {
          data: {
            credentials: result.data.credentials,
            snapshot: result.data.snapshot,
            recovered: false,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("room:join", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      JoinRoomRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.joinRoom(socket.id, {
          idempotencyId: request.mutation.idempotencyId,
          ...(request.mutation.expectedRevision === undefined
            ? {}
            : { expectedRevision: request.mutation.expectedRevision }),
          roomCode: request.code,
          name: request.profile.name,
          avatar: request.profile.avatar,
        });
        socket.data.playerId = result.data.credentials.playerId;
        socket.data.roomCode = result.data.snapshot.code;
        return {
          data: {
            credentials: result.data.credentials,
            snapshot: result.data.snapshot,
            recovered: false,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("room:leave", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      LeaveRoomRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.leaveRoom(
          socket.id,
          request.mutation.idempotencyId,
          request.mutation.expectedRevision,
        );
        delete socket.data.playerId;
        delete socket.data.roomCode;
        return { data: {}, revision: result.revision };
      },
    );
  });

  socket.on("room:profile:update", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      UpdateProfileRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.updateProfile(
          socket.id,
          request.mutation.idempotencyId,
          request.profile,
          request.mutation.expectedRevision,
        );
        return {
          data: {
            revision: result.revision,
            snapshot: await engine.snapshotForSocket(socket.id),
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("room:settings:update", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      UpdateSettingsRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.updateSettings(
          socket.id,
          request.mutation.idempotencyId,
          request.settings,
          request.customTheme
            ? {
                id:
                  request.customTheme.id ??
                  (request.settings.mode === "phone"
                    ? ""
                    : request.settings.theme.id),
                name: request.customTheme.name,
                words: request.customTheme.words,
              }
            : undefined,
          request.mutation.expectedRevision,
        );
        return {
          data: {
            revision: result.revision,
            snapshot: await engine.snapshotForSocket(socket.id),
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("room:kick", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      KickPlayerRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.kickPlayer(
          socket.id,
          request.mutation.idempotencyId,
          request.playerId,
          request.mutation.expectedRevision,
        );
        return {
          data: {
            revision: result.revision,
            snapshot: await engine.snapshotForSocket(socket.id),
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("match:start", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      StartMatchRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.startMatch(
          socket.id,
          request.mutation.idempotencyId,
          request.mutation.expectedRevision,
        );
        return {
          data: {
            revision: result.revision,
            snapshot: await engine.snapshotForSocket(socket.id),
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("round:select-word", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      SelectWordRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.selectWord(
          socket.id,
          request.mutation.idempotencyId,
          request.turnId,
          request.choiceIndex,
          request.mutation.expectedRevision,
        );
        return {
          data: {
            revision: result.revision,
            snapshot: await engine.snapshotForSocket(socket.id),
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("drawing:batch", (rawRequest, ack) => {
    if (typeof ack !== "function") {
      return;
    }
    if (safeJsonByteLength(rawRequest) > DRAWING_PAYLOAD_BYTES) {
      ackFailure(ack, new GameError("PAYLOAD_TOO_LARGE", "Drawing batch is too large."), {
        idempotencyId: rawRequest?.mutation?.idempotencyId,
      });
      return;
    }
    void respondValidated(
      socket,
      limiter,
      DrawingBatchRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      DRAWING_RATE,
      async (request) => {
        const result = await engine.submitDrawingBatch(socket.id, {
          idempotencyId: request.mutation.idempotencyId,
          ...(request.mutation.expectedRevision === undefined
            ? {}
            : { expectedRevision: request.mutation.expectedRevision }),
          turnId: request.turnId,
          strokeId: request.strokeId,
          chunkId: request.chunkId,
          operations: request.operations,
        });
        return {
          data: {
            revision: result.revision,
            acceptedThroughSequence: result.data.acceptedThroughSequence,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("phone:text:submit", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      PhoneTextSubmitRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.submitPhoneText(
          socket.id,
          request.mutation.idempotencyId,
          request.assignmentId,
          request.text,
        );
        return {
          data: {
            revision: result.revision,
            assignmentId: result.data.assignmentId,
            submittedAt: result.data.submittedAt,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("phone:drawing:batch", (rawRequest, ack) => {
    if (typeof ack !== "function") {
      return;
    }
    if (safeJsonByteLength(rawRequest) > DRAWING_PAYLOAD_BYTES) {
      ackFailure(
        ack,
        new GameError("PAYLOAD_TOO_LARGE", "Drawing batch is too large."),
        { idempotencyId: rawRequest?.mutation?.idempotencyId },
      );
      return;
    }
    void respondValidated(
      socket,
      limiter,
      PhoneDrawingBatchRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      DRAWING_RATE,
      async (request) => {
        const result = await engine.submitPhoneDrawingBatch(socket.id, {
          idempotencyId: request.mutation.idempotencyId,
          assignmentId: request.assignmentId,
          strokeId: request.strokeId,
          chunkId: request.chunkId,
          operations: request.operations,
        });
        return {
          data: {
            revision: result.revision,
            assignmentId: result.data.assignmentId,
            acceptedThroughSequence:
              result.data.acceptedThroughSequence,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("phone:drawing:submit", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      PhoneDrawingSubmitRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.submitPhoneDrawing(
          socket.id,
          request.mutation.idempotencyId,
          request.assignmentId,
        );
        return {
          data: {
            revision: result.revision,
            assignmentId: result.data.assignmentId,
            submittedAt: result.data.submittedAt,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("phone:summary:navigate", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      PhoneSummaryNavigateRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      MUTATION_RATE,
      async (request) => {
        const result = await engine.navigatePhoneSummary(
          socket.id,
          request.mutation.idempotencyId,
          request.action,
        );
        return {
          data: {
            revision: result.revision,
            phone: result.data.phone,
          },
          revision: result.revision,
        };
      },
    );
  });

  socket.on("chat:send", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      ChatSendRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      CHAT_RATE,
      async (request) => {
        consumeRate(limiter, `${socket.id}:mutation`, MUTATION_RATE);
        const result = await engine.sendChat(
          socket.id,
          request.mutation.idempotencyId,
          request.text,
          request.mutation.expectedRevision,
        );
        return {
          data: result.data.message,
          revision: result.revision,
        };
      },
    );
  });

  socket.on("guess:submit", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      GuessSubmitRequestSchema,
      rawRequest,
      ack,
      rawRequest?.mutation?.idempotencyId,
      GUESS_RATE,
      async (request) => {
        consumeRate(limiter, `${socket.id}:mutation`, MUTATION_RATE);
        const result = await engine.submitGuess(
          socket.id,
          request.mutation.idempotencyId,
          request.turnId,
          request.text,
          request.mutation.expectedRevision,
        );
        return {
          data: result.data.feedback,
          revision: result.revision,
        };
      },
    );
  });

  socket.on("snapshot:request", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      SnapshotRequestSchema,
      rawRequest,
      ack,
      undefined,
      RECOVERY_RATE,
      async () => {
        const snapshot = await engine.snapshotForSocket(socket.id);
        return { data: snapshot, revision: snapshot.revision };
      },
    );
  });

  socket.on("drawing:replay", (rawRequest, ack) => {
    void respondValidated(
      socket,
      limiter,
      DrawingReplayRequestSchema,
      rawRequest,
      ack,
      undefined,
      RECOVERY_RATE,
      async (request) => {
        const replay = await engine.replayForSocket(
          socket.id,
          request.turnId,
          request.afterSequence,
        );
        return { data: replay, revision: replay.revision };
      },
    );
  });

  socket.on("disconnect", () => {
    void establishment.then(
      () =>
        engine.disconnect(socket.id).catch((error: unknown) => {
          logSocketLifecycleFailure("Socket disconnect cleanup failed", error);
        }),
      () => undefined,
    );
  });
}

async function initializeSocket(
  socket: GameSocket,
  engine: GameEngine,
): Promise<void> {
  const reconnectToken =
    typeof socket.handshake.auth.reconnectToken === "string" &&
    socket.handshake.auth.reconnectToken.length <= 512
      ? socket.handshake.auth.reconnectToken
      : undefined;
  const connected = await engine.connect(socket.id, reconnectToken);
  applySocketData(socket, connected);
  socket.emit("connection:state", {
    state: connected.recovered ? "reconnected" : "connected",
  });
  if (connected.snapshot) {
    socket.emit("room:snapshot", connected.snapshot);
  }
}

function applySocketData(socket: GameSocket, connected: ConnectedSession): void {
  if (connected.playerId) {
    socket.data.playerId = connected.playerId;
  } else {
    delete socket.data.playerId;
  }
  if (connected.roomCode) {
    socket.data.roomCode = connected.roomCode;
  } else {
    delete socket.data.roomCode;
  }
}

async function respondValidated<Input, Output>(
  socket: GameSocket,
  limiter: EventRateLimiter,
  schema: ZodType<Input>,
  rawInput: unknown,
  ack: Ack<Output>,
  idempotencyId: string | undefined,
  rate: RateLimit,
  run: (input: Input) => Promise<{
    data: Output;
    revision?: number;
  }>,
): Promise<void> {
  if (typeof ack !== "function") {
    return;
  }
  try {
    await socketEstablishments.get(socket);
    const rateKey =
      rate === DRAWING_RATE
        ? "drawing"
        : rate === CHAT_RATE
          ? "chat"
          : rate === GUESS_RATE
            ? "guess"
            : rate === RECOVERY_RATE
              ? "recovery"
              : "mutation";
    const identity = socket.data.playerId
      ? `player:${socket.data.playerId}`
      : `ip:${socket.handshake.address}`;
    consumeRate(limiter, `${identity}:${rateKey}`, rate);
    const parsed = schema.safeParse(rawInput);
    if (!parsed.success) {
      const issueSummary = parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
        .join("; ");
      throw new GameError("INVALID_PAYLOAD", issueSummary || "Invalid event payload.");
    }
    const result = await run(parsed.data);
    ack({
      ok: true,
      data: result.data,
      meta: {
        ...(idempotencyId ? { idempotencyId } : {}),
        ...(result.revision === undefined ? {} : { revision: result.revision }),
        serverTime: Date.now(),
      },
    });
  } catch (error) {
    if (error instanceof GameError && error.code === "STALE_REVISION") {
      socket.emit("snapshot:required", {
        reason: "stale-revision",
        currentRevision:
          typeof error.details?.currentRevision === "number"
            ? error.details.currentRevision
            : 0,
      });
    }
    if (error instanceof GameError && error.code === "DRAWING_SEQUENCE_GAP") {
      socket.emit("snapshot:required", {
        reason: "drawing-gap",
        currentRevision:
          typeof error.details?.currentRevision === "number"
            ? error.details.currentRevision
            : 0,
      });
    }
    ackFailure(ack, error, idempotencyId ? { idempotencyId } : {});
  }
}

function logSocketLifecycleFailure(context: string, error: unknown): void {
  const errorName = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Unknown failure";
  process.stderr.write(`${context} (${errorName}): ${message.slice(0, 240)}\n`);
}

function consumeRate(
  limiter: EventRateLimiter,
  key: string,
  rule: RateLimit,
): void {
  const result = limiter.consume(key, rule);
  if (!result.allowed) {
    throw new GameError("RATE_LIMITED", "Too many events; please slow down.", {
      retryAfterMs: result.retryAfterMs,
    });
  }
}

function ackFailure<T>(
  ack: Ack<T>,
  error: unknown,
  meta: { idempotencyId?: string; revision?: number },
): void {
  ack({
    ok: false,
    error: toContractError(error),
    meta: {
      ...(meta.idempotencyId ? { idempotencyId: meta.idempotencyId } : {}),
      ...(meta.revision === undefined ? {} : { revision: meta.revision }),
      serverTime: Date.now(),
    },
  });
}

function toContractError(error: unknown): ContractError {
  if (error instanceof GameError) {
    return {
      code: error.code,
      message: error.message.slice(0, 240),
      retryable: [
        "RATE_LIMITED",
        "SERVER_UNAVAILABLE",
        "STALE_REVISION",
        "STALE_TURN",
        "DRAWING_SEQUENCE_GAP",
      ].includes(error.code),
      ...(error.details ? { details: error.details } : {}),
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "The game server could not complete that action.",
    retryable: true,
  };
}

function safeJsonByteLength(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), "utf8");
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}
