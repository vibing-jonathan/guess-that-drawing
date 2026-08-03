import type {
  ClientToServerEvents,
  MutationMeta,
  ServerToClientEvents,
} from "@gtd/contracts";
import {
  io,
  type ManagerOptions,
  type Socket,
  type SocketOptions,
} from "socket.io-client";

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const developmentServerUrl =
  import.meta.env.DEV && typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:3000`
    : undefined;

export function createGameSocket(
  url: string | undefined =
    import.meta.env.VITE_SERVER_URL || developmentServerUrl,
  options: Partial<ManagerOptions & SocketOptions> = {},
): GameSocket {
  return io(url, {
    autoConnect: false,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Number.POSITIVE_INFINITY,
    reconnectionDelay: 500,
    reconnectionDelayMax: 5_000,
    randomizationFactor: 0.35,
    timeout: 10_000,
    ...options,
  }) as GameSocket;
}

export function createMutationMeta(expectedRevision?: number): MutationMeta {
  const idempotencyId =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return expectedRevision === undefined
    ? { idempotencyId }
    : { idempotencyId, expectedRevision };
}
