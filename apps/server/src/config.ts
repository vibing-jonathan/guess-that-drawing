import { resolve } from "node:path";
import { z } from "zod";

const booleanFromEnvironment = z
  .enum(["true", "false", "1", "0"])
  .default("false")
  .transform((value) => value === "true" || value === "1");

const unsafeSessionSecrets = new Set([
  "development-only-secret-change-me",
  "replace-with-at-least-32-random-characters",
]);

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
    REDIS_URL: z.string().url().default("redis://127.0.0.1:6379"),
    REDIS_REQUIRED: booleanFromEnvironment,
    WEB_ORIGIN: z.string().default("http://localhost:5173,http://127.0.0.1:5173"),
    SESSION_SECRET: z.string().min(32).default("development-only-secret-change-me"),
    WEB_DIST_DIR: z.string().trim().min(1).default("../web/dist"),
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
      .default("info"),
    EMPTY_ROOM_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(1_800),
    ROOM_LIFETIME_SECONDS: z.coerce.number().int().min(300).max(86_400).default(28_800),
    DISCONNECTED_SEAT_SECONDS: z.coerce.number().int().min(5).max(120).default(30),
    DRAWER_PAUSE_SECONDS: z.coerce.number().int().min(5).max(60).default(20),
  })
  .superRefine((value, context) => {
    if (
      value.NODE_ENV === "production" &&
      unsafeSessionSecrets.has(value.SESSION_SECRET)
    ) {
      context.addIssue({
        code: "custom",
        path: ["SESSION_SECRET"],
        message: "SESSION_SECRET must be replaced with a unique secret in production",
      });
    }
  });

export interface ServerConfig {
  nodeEnv: "development" | "test" | "production";
  host: string;
  port: number;
  redisUrl: string;
  redisRequired: boolean;
  webOrigins: string[];
  sessionSecret: string;
  webDistDirectory: string;
  logLevel: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  emptyRoomTtlMs: number;
  roomLifetimeMs: number;
  disconnectedSeatMs: number;
  drawerPauseMs: number;
}

export function loadConfig(
  environment: NodeJS.ProcessEnv = process.env,
  currentWorkingDirectory = process.cwd(),
): ServerConfig {
  const parsed = environmentSchema.parse(environment);
  const webOrigins = parsed.WEB_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    nodeEnv: parsed.NODE_ENV,
    host: parsed.HOST,
    port: parsed.PORT,
    redisUrl: parsed.REDIS_URL,
    redisRequired: parsed.REDIS_REQUIRED,
    webOrigins,
    sessionSecret: parsed.SESSION_SECRET,
    webDistDirectory: resolve(currentWorkingDirectory, parsed.WEB_DIST_DIR),
    logLevel: parsed.LOG_LEVEL,
    emptyRoomTtlMs: parsed.EMPTY_ROOM_TTL_SECONDS * 1_000,
    roomLifetimeMs: parsed.ROOM_LIFETIME_SECONDS * 1_000,
    disconnectedSeatMs: parsed.DISCONNECTED_SEAT_SECONDS * 1_000,
    drawerPauseMs: parsed.DRAWER_PAUSE_SECONDS * 1_000,
  };
}
