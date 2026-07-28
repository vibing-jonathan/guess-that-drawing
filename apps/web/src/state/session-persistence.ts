import type { SessionCredentials } from "@gtd/contracts";

import type { StoredRoomSession } from "./room-store";

export type MaybePromise<Value> = Value | Promise<Value>;

/**
 * Kept callback-based so routing code can use sessionStorage, IndexedDB, or a
 * privacy-hardened host bridge without coupling the realtime controller to it.
 */
export interface RoomCredentialPersistence {
  load: (
    roomCode: string,
  ) => MaybePromise<SessionCredentials | null>;
  save: (session: StoredRoomSession) => MaybePromise<void>;
  clear: (roomCode: string) => MaybePromise<void>;
}

export interface RoomCredentialHooks {
  onEstablished?: (
    session: StoredRoomSession,
  ) => MaybePromise<void>;
  onCleared?: (session: StoredRoomSession) => MaybePromise<void>;
  onPersistenceError?: (
    error: unknown,
    operation: "load" | "save" | "clear",
  ) => void;
}
