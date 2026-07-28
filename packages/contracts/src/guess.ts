import type { GuessKind } from "./schemas.js";

/**
 * Produces the canonical form used for both exact and close-guess matching.
 * Unicode compatibility normalization is intentionally applied before
 * stripping combining marks so variants such as full-width characters and
 * ligatures compare consistently.
 */
export function normalizeGuess(input: string): string {
  return input
    .normalize("NFKD")
    .toLocaleLowerCase("en-US")
    .replace(/\p{M}+/gu, "")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/**
 * True Damerau–Levenshtein distance, including adjacent transposition.
 */
export function damerauLevenshteinDistance(
  leftInput: string,
  rightInput: string,
): number {
  const left = Array.from(leftInput);
  const right = Array.from(rightInput);
  const leftLength = left.length;
  const rightLength = right.length;
  const maximumDistance = leftLength + rightLength;
  const matrix: number[][] = Array.from(
    { length: leftLength + 2 },
    () => Array<number>(rightLength + 2).fill(0),
  );
  const lastSeen = new Map<string, number>();

  matrix[0]![0] = maximumDistance;
  for (let i = 0; i <= leftLength; i += 1) {
    matrix[i + 1]![0] = maximumDistance;
    matrix[i + 1]![1] = i;
  }
  for (let j = 0; j <= rightLength; j += 1) {
    matrix[0]![j + 1] = maximumDistance;
    matrix[1]![j + 1] = j;
  }

  for (let i = 1; i <= leftLength; i += 1) {
    let lastMatchingColumn = 0;
    for (let j = 1; j <= rightLength; j += 1) {
      const previousMatchingRow = lastSeen.get(right[j - 1]!) ?? 0;
      const previousMatchingColumn = lastMatchingColumn;
      let substitutionCost = 1;

      if (left[i - 1] === right[j - 1]) {
        substitutionCost = 0;
        lastMatchingColumn = j;
      }

      matrix[i + 1]![j + 1] = Math.min(
        matrix[i]![j]! + substitutionCost,
        matrix[i + 1]![j]! + 1,
        matrix[i]![j + 1]! + 1,
        matrix[previousMatchingRow]![previousMatchingColumn]! +
          (i - previousMatchingRow - 1) +
          1 +
          (j - previousMatchingColumn - 1),
      );
    }
    lastSeen.set(left[i - 1]!, i);
  }

  return matrix[leftLength + 1]![rightLength + 1]!;
}

export function closeGuessThreshold(answerLength: number): number {
  if (!Number.isFinite(answerLength) || answerLength < 4) {
    return 0;
  }
  return Math.min(3, Math.max(1, Math.floor(answerLength * 0.2)));
}

export type GuessClassification = {
  kind: GuessKind;
  normalizedGuess: string;
  normalizedAnswer: string;
  distance: number | null;
  threshold: number;
};

export function classifyGuess(
  guess: string,
  answer: string,
): GuessClassification {
  const normalizedGuess = normalizeGuess(guess);
  const normalizedAnswer = normalizeGuess(answer);

  if (normalizedGuess === normalizedAnswer && normalizedAnswer.length > 0) {
    return {
      kind: "correct",
      normalizedGuess,
      normalizedAnswer,
      distance: 0,
      threshold: closeGuessThreshold(Array.from(normalizedAnswer).length),
    };
  }

  const answerLength = Array.from(normalizedAnswer).length;
  const threshold = closeGuessThreshold(answerLength);
  if (threshold === 0 || normalizedGuess.length === 0) {
    return {
      kind: "incorrect",
      normalizedGuess,
      normalizedAnswer,
      distance: null,
      threshold,
    };
  }

  const distance = damerauLevenshteinDistance(
    normalizedGuess,
    normalizedAnswer,
  );
  return {
    kind: distance <= threshold ? "close" : "incorrect",
    normalizedGuess,
    normalizedAnswer,
    distance,
    threshold,
  };
}

export function isAnswerEquivalent(message: string, answer: string): boolean {
  return normalizeGuess(message) === normalizeGuess(answer);
}
