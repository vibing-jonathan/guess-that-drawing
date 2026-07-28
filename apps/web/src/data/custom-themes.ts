import {
  VALIDATION_LIMITS,
  validateCustomTheme,
  type CustomThemeInput,
} from "@gtd/contracts";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type StoredCustomTheme = CustomThemeInput & {
  id: string;
  createdAt: number;
  updatedAt: number;
};

interface GuessThatDrawingDatabase extends DBSchema {
  themes: {
    key: string;
    value: StoredCustomTheme;
    indexes: {
      "by-updated-at": number;
    };
  };
}

let databasePromise: Promise<IDBPDatabase<GuessThatDrawingDatabase>> | null =
  null;

function database(): Promise<IDBPDatabase<GuessThatDrawingDatabase>> {
  databasePromise ??= openDB<GuessThatDrawingDatabase>(
    "guess-that-drawing",
    1,
    {
      upgrade(db) {
        const themes = db.createObjectStore("themes", { keyPath: "id" });
        themes.createIndex("by-updated-at", "updatedAt");
      },
    },
  );

  return databasePromise;
}

function themeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `theme-${Date.now()}`;
}

export async function listCustomThemes(): Promise<StoredCustomTheme[]> {
  const db = await database();
  const values = await db.getAllFromIndex("themes", "by-updated-at");
  return values.reverse();
}

export async function getCustomTheme(
  id: string,
): Promise<StoredCustomTheme | undefined> {
  return (await database()).get("themes", id);
}

export async function saveCustomTheme(
  input: CustomThemeInput,
): Promise<StoredCustomTheme> {
  const validation = validateCustomTheme(input);
  if (!validation.success) {
    const message = validation.issues.map((issue) => issue.message).join(" ");
    throw new Error(message || "The custom theme is invalid.");
  }

  const db = await database();
  const now = Date.now();
  const id = validation.data.id ?? themeId();
  const existing = await db.get("themes", id);
  const stored: StoredCustomTheme = {
    ...validation.data,
    id,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await db.put("themes", stored);
  return stored;
}

export async function deleteCustomTheme(id: string): Promise<void> {
  await (await database()).delete("themes", id);
}

export function createCustomThemeDraft(): CustomThemeInput {
  return {
    name: "",
    words: Array.from(
      { length: VALIDATION_LIMITS.customThemeWords.min },
      () => "",
    ),
  };
}
