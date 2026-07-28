import { describe, expect, it } from "vitest";

import {
  calculateDrawerScore,
  calculateGuesserScore,
} from "../src/index.js";

describe("calculateGuesserScore", () => {
  it("combines base, rounded speed, and placement bonuses exactly", () => {
    expect(calculateGuesserScore(80, 80, 1)).toBe(1_000);
    expect(calculateGuesserScore(40, 80, 2)).toBe(650);
    expect(calculateGuesserScore(0, 80, 3)).toBe(350);
    expect(calculateGuesserScore(0, 80, 4)).toBe(300);
    expect(calculateGuesserScore(1, 3, 4)).toBe(467);
  });

  it("clamps remaining time to the turn duration", () => {
    expect(calculateGuesserScore(100, 80, 1)).toBe(1_000);
  });

  it("rejects invalid inputs", () => {
    expect(() => calculateGuesserScore(-1, 80, 1)).toThrow(RangeError);
    expect(() => calculateGuesserScore(10, 0, 1)).toThrow(RangeError);
    expect(() => calculateGuesserScore(10, 80, 0)).toThrow(RangeError);
    expect(() => calculateGuesserScore(10, 80, 1.5)).toThrow(RangeError);
  });
});

describe("calculateDrawerScore", () => {
  it("awards 75 points per guesser capped at 500", () => {
    expect(calculateDrawerScore(0)).toBe(0);
    expect(calculateDrawerScore(1)).toBe(75);
    expect(calculateDrawerScore(6)).toBe(450);
    expect(calculateDrawerScore(7)).toBe(500);
    expect(calculateDrawerScore(12)).toBe(500);
  });

  it("rejects invalid counts", () => {
    expect(() => calculateDrawerScore(-1)).toThrow(RangeError);
    expect(() => calculateDrawerScore(1.5)).toThrow(RangeError);
  });
});
