import {
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  VALIDATION_LIMITS,
} from "./constants.js";

export type RandomIntegerSource = (maximumExclusive: number) => number;

const cryptoRandomInteger: RandomIntegerSource = (maximumExclusive) => {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) {
    throw new Error("A cryptographically secure random source is unavailable");
  }

  // Rejection sampling avoids modulo bias.
  const rejectionLimit =
    Math.floor(0x1_0000_0000 / maximumExclusive) * maximumExclusive;
  const buffer = new Uint32Array(1);
  do {
    cryptoApi.getRandomValues(buffer);
  } while (buffer[0]! >= rejectionLimit);
  return buffer[0]! % maximumExclusive;
};

export function normalizeRoomCode(input: string): string {
  return input.trim().toUpperCase().replace(/[\s-]+/gu, "");
}

export function isValidRoomCode(input: string): boolean {
  return ROOM_CODE_PATTERN.test(normalizeRoomCode(input));
}

export function generateRoomCode(
  randomInteger: RandomIntegerSource = cryptoRandomInteger,
): string {
  let result = "";
  for (let index = 0; index < VALIDATION_LIMITS.roomCodeLength; index += 1) {
    const randomIndex = randomInteger(ROOM_CODE_ALPHABET.length);
    if (
      !Number.isInteger(randomIndex) ||
      randomIndex < 0 ||
      randomIndex >= ROOM_CODE_ALPHABET.length
    ) {
      throw new RangeError("randomInteger returned an out-of-range value");
    }
    result += ROOM_CODE_ALPHABET[randomIndex]!;
  }
  return result;
}
