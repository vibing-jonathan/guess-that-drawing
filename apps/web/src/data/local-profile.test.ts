import { DEFAULT_AVATAR } from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_PROFILE,
  clearRoomSession,
  loadProfile,
  loadRoomSession,
  saveProfile,
  saveRoomSession,
} from "./local-profile";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

describe("local profile persistence", () => {
  it("returns the default profile when stored data is invalid", () => {
    const storage = new MemoryStorage();
    storage.setItem("gtd:profile:v1", "{broken");

    expect(loadProfile(storage)).toEqual(DEFAULT_PROFILE);
  });

  it("round-trips a validated profile", () => {
    const storage = new MemoryStorage();
    const profile = {
      name: "Maya",
      avatar: { ...DEFAULT_AVATAR, hairStyle: "curls" as const },
    };

    expect(saveProfile(profile, storage)).toEqual(profile);
    expect(loadProfile(storage)).toEqual(profile);
  });

  it("stores reconnect credentials per room for the browser session", () => {
    const storage = new MemoryStorage();
    const credentials = {
      playerId: "player-1",
      reconnectToken: "a-secure-token-with-enough-length",
    };

    saveRoomSession("ABC234", credentials, storage);
    expect(loadRoomSession("ABC234", storage)).toEqual(credentials);

    clearRoomSession("ABC234", storage);
    expect(loadRoomSession("ABC234", storage)).toBeNull();
  });
});
