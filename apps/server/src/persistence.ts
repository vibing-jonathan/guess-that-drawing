import { Redis } from "ioredis";

export interface PersistedSession {
  sessionId: string;
  reconnectTokenHash: string;
  playerId: string | null;
  roomCode: string | null;
  createdAt: number;
  expiresAt: number;
  recentCommands?: Array<{ id: string; event: string; result: unknown }>;
}

export interface PersistedRoomEnvelope {
  code: string;
  createdAt: number;
  expiresAt: number;
  isEmpty: boolean;
  value: unknown;
}

export interface GamePersistence {
  readonly kind: "memory" | "redis";
  connect(): Promise<void>;
  close(): Promise<void>;
  isReady(): Promise<boolean>;
  getRoom<T>(code: string): Promise<T | null>;
  saveRoom<T>(room: PersistedRoomEnvelope & { value: T }): Promise<void>;
  deleteRoom(code: string): Promise<void>;
  listRoomCodes(): Promise<string[]>;
  getSession(tokenHash: string): Promise<PersistedSession | null>;
  saveSession(session: PersistedSession): Promise<void>;
  deleteSession(tokenHash: string): Promise<void>;
}

interface MemoryValue<T> {
  expiresAt: number;
  value: T;
}

export class MemoryGamePersistence implements GamePersistence {
  readonly kind = "memory" as const;
  readonly #rooms = new Map<string, MemoryValue<unknown>>();
  readonly #sessions = new Map<string, MemoryValue<PersistedSession>>();
  readonly #now: () => number;
  #connected = false;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  async connect(): Promise<void> {
    this.#connected = true;
  }

  async close(): Promise<void> {
    this.#connected = false;
  }

  async isReady(): Promise<boolean> {
    return this.#connected;
  }

  async getRoom<T>(code: string): Promise<T | null> {
    const record = this.#rooms.get(code);
    if (!record) {
      return null;
    }
    if (record.expiresAt <= this.#now()) {
      this.#rooms.delete(code);
      return null;
    }
    return structuredClone(record.value) as T;
  }

  async saveRoom<T>(room: PersistedRoomEnvelope & { value: T }): Promise<void> {
    this.#rooms.set(room.code, {
      expiresAt: room.expiresAt,
      value: structuredClone(room.value),
    });
  }

  async deleteRoom(code: string): Promise<void> {
    this.#rooms.delete(code);
  }

  async listRoomCodes(): Promise<string[]> {
    await this.#sweep();
    return [...this.#rooms.keys()];
  }

  async getSession(tokenHash: string): Promise<PersistedSession | null> {
    const record = this.#sessions.get(tokenHash);
    if (!record) {
      return null;
    }
    if (record.expiresAt <= this.#now()) {
      this.#sessions.delete(tokenHash);
      return null;
    }
    return structuredClone(record.value);
  }

  async saveSession(session: PersistedSession): Promise<void> {
    this.#sessions.set(session.reconnectTokenHash, {
      expiresAt: session.expiresAt,
      value: structuredClone(session),
    });
  }

  async deleteSession(tokenHash: string): Promise<void> {
    this.#sessions.delete(tokenHash);
  }

  async #sweep(): Promise<void> {
    const now = this.#now();
    for (const [code, room] of this.#rooms) {
      if (room.expiresAt <= now) {
        this.#rooms.delete(code);
      }
    }
    for (const [token, session] of this.#sessions) {
      if (session.expiresAt <= now) {
        this.#sessions.delete(token);
      }
    }
  }
}

const ROOM_SET_KEY = "gtd:rooms";
const roomKey = (code: string) => `gtd:room:${code}`;
const sessionKey = (tokenHash: string) => `gtd:session:${tokenHash}`;

export class RedisGamePersistence implements GamePersistence {
  readonly kind = "redis" as const;
  readonly #redis: Redis;
  #closed = false;
  #connectPromise: Promise<void> | null = null;

  constructor(redisUrl: string, redis?: Redis) {
    this.#redis =
      redis ??
      new Redis(redisUrl, {
        lazyConnect: true,
        enableReadyCheck: true,
        connectTimeout: 2_000,
        maxRetriesPerRequest: 2,
        retryStrategy(times: number) {
          return times >= 2 ? null : 200;
        },
      });
    // ioredis otherwise treats an initial connection failure as an uncaught error.
    this.#redis.on("error", () => undefined);
  }

  async connect(): Promise<void> {
    this.#closed = false;
    await this.#ensureConnected();
    await this.#redis.ping();
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#redis.status === "end") {
      return;
    }
    try {
      await this.#redis.quit();
    } catch {
      this.#redis.disconnect();
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.#ensureConnected();
      return (await this.#redis.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  async getRoom<T>(code: string): Promise<T | null> {
    await this.#ensureConnected();
    const value = await this.#redis.get(roomKey(code));
    if (!value) {
      await this.#redis.srem(ROOM_SET_KEY, code);
      return null;
    }
    return JSON.parse(value) as T;
  }

  async saveRoom<T>(room: PersistedRoomEnvelope & { value: T }): Promise<void> {
    await this.#ensureConnected();
    const ttlMs = Math.max(1, room.expiresAt - Date.now());
    const transaction = this.#redis.multi();
    transaction.set(roomKey(room.code), JSON.stringify(room.value), "PX", ttlMs);
    transaction.sadd(ROOM_SET_KEY, room.code);
    await transaction.exec();
  }

  async deleteRoom(code: string): Promise<void> {
    await this.#ensureConnected();
    await this.#redis.multi().del(roomKey(code)).srem(ROOM_SET_KEY, code).exec();
  }

  async listRoomCodes(): Promise<string[]> {
    await this.#ensureConnected();
    const codes = await this.#redis.smembers(ROOM_SET_KEY);
    if (codes.length === 0) {
      return [];
    }

    const exists = await Promise.all(codes.map((code) => this.#redis.exists(roomKey(code))));
    const staleCodes = codes.filter((_, index) => exists[index] === 0);
    if (staleCodes.length > 0) {
      await this.#redis.srem(ROOM_SET_KEY, ...staleCodes);
    }
    return codes.filter((_, index) => exists[index] === 1);
  }

  async getSession(tokenHash: string): Promise<PersistedSession | null> {
    await this.#ensureConnected();
    const value = await this.#redis.get(sessionKey(tokenHash));
    return value ? (JSON.parse(value) as PersistedSession) : null;
  }

  async saveSession(session: PersistedSession): Promise<void> {
    await this.#ensureConnected();
    const ttlMs = Math.max(1, session.expiresAt - Date.now());
    await this.#redis.set(
      sessionKey(session.reconnectTokenHash),
      JSON.stringify(session),
      "PX",
      ttlMs,
    );
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.#ensureConnected();
    await this.#redis.del(sessionKey(tokenHash));
  }

  async #ensureConnected(): Promise<void> {
    if (this.#closed) {
      throw new Error("Redis persistence is closed.");
    }
    if (this.#redis.status === "ready") {
      return;
    }
    if (!this.#connectPromise) {
      this.#connectPromise = (async () => {
        if (this.#redis.status === "wait" || this.#redis.status === "end") {
          await this.#redis.connect();
          return;
        }
        await this.#redis.ping();
      })();
    }
    try {
      await this.#connectPromise;
    } finally {
      this.#connectPromise = null;
    }
  }
}

export async function createGamePersistence(options: {
  redisUrl: string;
  redisRequired: boolean;
  now?: () => number;
}): Promise<GamePersistence> {
  const redis = new RedisGamePersistence(options.redisUrl);
  try {
    await redis.connect();
    return redis;
  } catch (error) {
    await redis.close();
    if (options.redisRequired) {
      throw error;
    }
    const memory = new MemoryGamePersistence(options.now);
    await memory.connect();
    return memory;
  }
}
