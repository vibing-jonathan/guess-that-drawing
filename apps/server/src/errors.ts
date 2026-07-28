export type GameErrorCode =
  | "INVALID_PAYLOAD"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "RATE_LIMITED"
  | "SERVER_UNAVAILABLE"
  | "ROOM_NOT_FOUND"
  | "ROOM_EXPIRED"
  | "ROOM_FULL"
  | "ROOM_STARTED"
  | "DUPLICATE_NAME"
  | "KICKED"
  | "NOT_IN_ROOM"
  | "NOT_HOST"
  | "NOT_DRAWER"
  | "INVALID_PHASE"
  | "STALE_REVISION"
  | "STALE_TURN"
  | "DUPLICATE_EVENT"
  | "INVALID_THEME"
  | "INVALID_WORD"
  | "DRAWING_SEQUENCE_GAP"
  | "PAYLOAD_TOO_LARGE"
  | "INTERNAL_ERROR";

export class GameError extends Error {
  readonly code: GameErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GameErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GameError";
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

export interface CommandSuccess<T = undefined> {
  ok: true;
  revision: number;
  data?: T;
}

export interface CommandFailure {
  ok: false;
  error: {
    code: GameErrorCode;
    message: string;
    retryAfterMs?: number;
  };
}

export type CommandResult<T = undefined> = CommandSuccess<T> | CommandFailure;

export function commandFailure(error: unknown): CommandFailure {
  if (error instanceof GameError) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.message,
        ...(typeof error.details?.retryAfterMs === "number"
          ? { retryAfterMs: error.details.retryAfterMs }
          : {}),
      },
    };
  }

  return {
    ok: false,
    error: {
      code: "INTERNAL_ERROR",
      message: "The game server could not complete that action.",
    },
  };
}
