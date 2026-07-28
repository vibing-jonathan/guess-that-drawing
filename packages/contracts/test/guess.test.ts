import { describe, expect, it } from "vitest";

import {
  classifyGuess,
  closeGuessThreshold,
  damerauLevenshteinDistance,
  isAnswerEquivalent,
  normalizeGuess,
} from "../src/index.js";

describe("normalizeGuess", () => {
  it("normalizes case, diacritics, punctuation, and whitespace", () => {
    expect(normalizeGuess("  CRÈME---Brûlée!!  ")).toBe("creme brulee");
    expect(normalizeGuess("Spider—Man")).toBe("spider man");
    expect(normalizeGuess("  hello\t\nworld  ")).toBe("hello world");
  });

  it("normalizes compatibility Unicode while preserving letters and numbers", () => {
    expect(normalizeGuess("ＦＯＸ № ２")).toBe("fox no 2");
    expect(normalizeGuess("İSTANBUL")).toBe("istanbul");
    expect(normalizeGuess("東京 2026")).toBe("東京 2026");
  });

  it("recognizes answer-equivalent messages", () => {
    expect(isAnswerEquivalent("  Spider-Man! ", "spider man")).toBe(true);
    expect(isAnswerEquivalent("spider", "spider man")).toBe(false);
  });
});

describe("damerauLevenshteinDistance", () => {
  it("handles insertion, deletion, substitution, and transposition", () => {
    expect(damerauLevenshteinDistance("cat", "cart")).toBe(1);
    expect(damerauLevenshteinDistance("cart", "cat")).toBe(1);
    expect(damerauLevenshteinDistance("cat", "cut")).toBe(1);
    expect(damerauLevenshteinDistance("form", "from")).toBe(1);
    expect(damerauLevenshteinDistance("ca", "abc")).toBe(2);
  });

  it("handles empty and Unicode strings", () => {
    expect(damerauLevenshteinDistance("", "")).toBe(0);
    expect(damerauLevenshteinDistance("", "abc")).toBe(3);
    expect(damerauLevenshteinDistance("猫", "犬")).toBe(1);
  });
});

describe("close-guess classification", () => {
  it("uses the specified length-derived threshold", () => {
    expect(closeGuessThreshold(3)).toBe(0);
    expect(closeGuessThreshold(4)).toBe(1);
    expect(closeGuessThreshold(9)).toBe(1);
    expect(closeGuessThreshold(10)).toBe(2);
    expect(closeGuessThreshold(15)).toBe(3);
    expect(closeGuessThreshold(100)).toBe(3);
  });

  it("classifies normalized equality as correct", () => {
    expect(classifyGuess("Crème brûlée!", "creme brulee")).toMatchObject({
      kind: "correct",
      distance: 0,
    });
  });

  it("does not classify near guesses for answers shorter than four characters", () => {
    expect(classifyGuess("cot", "cat")).toMatchObject({
      kind: "incorrect",
      threshold: 0,
      distance: null,
    });
  });

  it("classifies a guess inside the threshold as close", () => {
    expect(classifyGuess("girafe", "giraffe")).toMatchObject({
      kind: "close",
      distance: 1,
      threshold: 1,
    });
    expect(classifyGuess("watermelon sugr", "watermelon sugar")).toMatchObject({
      kind: "close",
      distance: 1,
    });
  });

  it("classifies a guess outside the threshold as incorrect", () => {
    expect(classifyGuess("guitar", "giraffe")).toMatchObject({
      kind: "incorrect",
      threshold: 1,
    });
    expect(classifyGuess("", "giraffe")).toMatchObject({
      kind: "incorrect",
      distance: null,
    });
  });
});
