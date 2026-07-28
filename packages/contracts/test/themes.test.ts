import { describe, expect, it } from "vitest";

import {
  PRESET_THEMES,
  THEME_METADATA,
  VALIDATION_LIMITS,
  getPresetTheme,
  isPresetThemeId,
  normalizeGuess,
  validateCustomTheme,
} from "../src/index.js";

const customWords = Array.from(
  { length: VALIDATION_LIMITS.customThemeWords.min },
  (_, index) => `drawing word ${index + 1}`,
);

describe("preset themes", () => {
  it("provides at least six sufficiently large themes", () => {
    const themes = Object.values(PRESET_THEMES);
    expect(themes.length).toBeGreaterThanOrEqual(6);

    for (const theme of themes) {
      expect(theme.words.length).toBeGreaterThanOrEqual(100);
      expect(theme.metadata.wordCount).toBe(theme.words.length);
      expect(theme.metadata.isCustom).toBe(false);
    }
  });

  it("contains unique, valid words after guess normalization", () => {
    for (const theme of Object.values(PRESET_THEMES)) {
      const normalized = theme.words.map(normalizeGuess);
      expect(new Set(normalized).size, theme.metadata.name).toBe(
        normalized.length,
      );
      for (const word of theme.words) {
        expect(word.trim().length).toBeGreaterThanOrEqual(
          VALIDATION_LIMITS.themeWord.min,
        );
        expect(word.length).toBeLessThanOrEqual(
          VALIDATION_LIMITS.themeWord.max,
        );
      }
    }
  });

  it("exposes matching public metadata and safe lookup helpers", () => {
    expect(THEME_METADATA).toHaveLength(Object.keys(PRESET_THEMES).length);
    expect(isPresetThemeId("general")).toBe(true);
    expect(isPresetThemeId("missing")).toBe(false);
    expect(getPresetTheme("animals")?.metadata.name).toBe("Animals");
    expect(getPresetTheme("missing")).toBeUndefined();
  });
});

describe("custom theme validation", () => {
  it("trims valid themes and preserves their optional id", () => {
    const result = validateCustomTheme({
      id: "my-theme",
      name: "  Silly   things ",
      words: customWords.map((word) => ` ${word} `),
    });

    expect(result).toEqual({
      success: true,
      data: {
        id: "my-theme",
        name: "Silly things",
        words: customWords,
      },
    });
  });

  it("rejects normalized duplicates", () => {
    const result = validateCustomTheme({
      name: "Desserts",
      words: [
        ...customWords.slice(0, -2),
        "Crème brûlée",
        "creme-brulee",
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.map((issue) => issue.code)).toContain(
        "DUPLICATE_WORD",
      );
      expect(result.issues.map((issue) => issue.code)).toContain(
        "TOO_FEW_UNIQUE_WORDS",
      );
    }
  });

  it("rejects too few words and malformed fields", () => {
    const tooFew = validateCustomTheme({
      name: "Small",
      words: ["one", "two"],
    });
    expect(tooFew.success).toBe(false);

    const malformed = validateCustomTheme({
      name: "",
      words: customWords,
    });
    expect(malformed.success).toBe(false);
    if (!malformed.success) {
      expect(malformed.issues[0]?.code).toBe("INVALID_STRUCTURE");
    }
  });
});
