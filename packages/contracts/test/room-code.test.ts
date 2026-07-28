import { describe, expect, it } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  generateRoomCode,
  isValidRoomCode,
  normalizeRoomCode,
} from "../src/index.js";

describe("room codes", () => {
  it("normalizes spaces, hyphens, and case", () => {
    expect(normalizeRoomCode(" ab-c 23 ")).toBe("ABC23");
  });

  it("accepts only six unambiguous characters", () => {
    expect(isValidRoomCode("abc-234")).toBe(true);
    expect(isValidRoomCode("ABCDEF")).toBe(true);
    expect(isValidRoomCode("ABCI23")).toBe(false);
    expect(isValidRoomCode("ABCO23")).toBe(false);
    expect(isValidRoomCode("ABC123")).toBe(false);
    expect(isValidRoomCode("ABCDE")).toBe(false);
  });

  it("generates a deterministic valid code from an injected source", () => {
    let index = 0;
    const code = generateRoomCode((maximum) => {
      const result = index % maximum;
      index += 1;
      return result;
    });

    expect(code).toBe(ROOM_CODE_ALPHABET.slice(0, 6));
    expect(isValidRoomCode(code)).toBe(true);
  });

  it("rejects a broken random source", () => {
    expect(() => generateRoomCode(() => -1)).toThrow(RangeError);
    expect(() =>
      generateRoomCode(() => ROOM_CODE_ALPHABET.length),
    ).toThrow(RangeError);
  });
});
