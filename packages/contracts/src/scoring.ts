import { SCORE_RULES } from "./constants.js";

function assertFiniteNonNegative(name: string, value: number): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${name} must be a finite, non-negative number`);
  }
}

export function calculateGuesserScore(
  remainingTimeSeconds: number,
  turnTimeSeconds: number,
  placement: number,
): number {
  assertFiniteNonNegative("remainingTimeSeconds", remainingTimeSeconds);
  if (!Number.isFinite(turnTimeSeconds) || turnTimeSeconds <= 0) {
    throw new RangeError("turnTimeSeconds must be a finite number above zero");
  }
  if (!Number.isInteger(placement) || placement < 1) {
    throw new RangeError("placement must be a positive integer");
  }

  const clampedRemaining = Math.min(remainingTimeSeconds, turnTimeSeconds);
  const speedScore = Math.round(
    SCORE_RULES.speedPool * (clampedRemaining / turnTimeSeconds),
  );
  const placementBonus = SCORE_RULES.placementBonuses[placement - 1] ?? 0;

  return SCORE_RULES.baseCorrect + speedScore + placementBonus;
}

export function calculateDrawerScore(correctGuessers: number): number {
  if (!Number.isInteger(correctGuessers) || correctGuessers < 0) {
    throw new RangeError("correctGuessers must be a non-negative integer");
  }

  return Math.min(
    SCORE_RULES.drawerMaximum,
    SCORE_RULES.drawerPerCorrectGuesser * correctGuessers,
  );
}
