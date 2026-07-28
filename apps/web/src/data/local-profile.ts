import {
  DEFAULT_AVATAR,
  PlayerProfileSchema,
  type PlayerProfile,
  type SessionCredentials,
} from "@gtd/contracts";

const PROFILE_KEY = "gtd:profile:v1";
const SESSION_PREFIX = "gtd:session:v1:";

export const DEFAULT_PROFILE: PlayerProfile = {
  name: "",
  avatar: DEFAULT_AVATAR,
};

function storageAvailable(storage: Storage | undefined): storage is Storage {
  return Boolean(storage);
}

export function loadProfile(
  storage: Storage | undefined = globalThis.localStorage,
): PlayerProfile {
  if (!storageAvailable(storage)) {
    return DEFAULT_PROFILE;
  }

  try {
    const raw = storage.getItem(PROFILE_KEY);
    if (!raw) {
      return DEFAULT_PROFILE;
    }

    const parsed = PlayerProfileSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

export function saveProfile(
  profile: PlayerProfile,
  storage: Storage | undefined = globalThis.localStorage,
): PlayerProfile {
  const parsed = PlayerProfileSchema.parse(profile);
  storage?.setItem(PROFILE_KEY, JSON.stringify(parsed));
  return parsed;
}

export function loadRoomSession(
  roomCode: string,
  storage: Storage | undefined = globalThis.sessionStorage,
): SessionCredentials | null {
  if (!storageAvailable(storage)) {
    return null;
  }

  try {
    const raw = storage.getItem(`${SESSION_PREFIX}${roomCode}`);
    if (!raw) {
      return null;
    }

    const value = JSON.parse(raw) as Partial<SessionCredentials>;
    if (
      typeof value.playerId !== "string" ||
      typeof value.reconnectToken !== "string"
    ) {
      return null;
    }

    return {
      playerId: value.playerId,
      reconnectToken: value.reconnectToken,
    };
  } catch {
    return null;
  }
}

export function saveRoomSession(
  roomCode: string,
  credentials: SessionCredentials,
  storage: Storage | undefined = globalThis.sessionStorage,
): void {
  storage?.setItem(
    `${SESSION_PREFIX}${roomCode}`,
    JSON.stringify(credentials),
  );
}

export function clearRoomSession(
  roomCode: string,
  storage: Storage | undefined = globalThis.sessionStorage,
): void {
  storage?.removeItem(`${SESSION_PREFIX}${roomCode}`);
}
