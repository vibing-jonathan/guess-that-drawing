import {
  calculateDrawerScore,
  calculateGuesserScore,
  classifyGuess,
  generateRoomCode,
  getPresetTheme,
  normalizeGuess,
  normalizeRoomCode,
  validateCustomTheme,
} from "@gtd/contracts";
import type { EngineRules } from "./engine.js";

export const contractRules: EngineRules = {
  generateRoomCode,
  normalizeRoomCode,
  normalizeText: normalizeGuess,
  classifyGuess,
  calculateGuesserScore,
  calculateDrawerScore,
  getTheme(id) {
    const theme = getPresetTheme(id);
    return theme
      ? {
          id: theme.metadata.id,
          name: theme.metadata.name,
          words: theme.words,
        }
      : null;
  },
  validateCustomTheme(theme) {
    const result = validateCustomTheme(theme);
    return result.success
      ? {
          valid: true,
          normalizedWords: result.data.words,
          errors: [],
        }
      : {
          valid: false,
          normalizedWords: [],
          errors: result.issues.map((issue) => issue.message),
        };
  },
};
