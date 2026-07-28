import { existsSync } from "node:fs";
import { join } from "node:path";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import fastifyStatic from "@fastify/static";
import {
  THEME_METADATA,
  type HealthResponse,
  type ThemesResponse,
} from "@gtd/contracts";
import Fastify, { type FastifyInstance } from "fastify";
import type { ServerConfig } from "./config.js";
import { GameEngine } from "./engine.js";
import type { GamePersistence } from "./persistence.js";
import { contractRules } from "./rules.js";
import {
  createSocketServer,
  registerSocketHandlers,
  SocketIoTransport,
  type GameSocketServer,
} from "./socket.js";

export interface GameApplication {
  app: FastifyInstance;
  io: GameSocketServer;
  engine: GameEngine;
  close(): Promise<void>;
  announceShutdown(): void;
}

export async function buildApplication(options: {
  config: ServerConfig;
  persistence: GamePersistence;
}): Promise<GameApplication> {
  const { config, persistence } = options;
  const app = Fastify({
    trustProxy: true,
    logger:
      config.logLevel === "silent"
        ? false
        : {
            level: config.logLevel,
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "request.headers.authorization",
                "request.headers.cookie",
                "*.reconnectToken",
                "*.answer",
                "*.wordChoices",
                "*.text",
              ],
              censor: "[redacted]",
            },
    },
    bodyLimit: 256 * 1_024,
  });

  await app.register(cors, {
    credentials: true,
    origin(origin, callback) {
      if (!origin || config.webOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed"), false);
    },
  });

  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", ...config.webOrigins],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        workerSrc: ["'self'", "blob:"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: "no-referrer" },
  });

  const io = createSocketServer(app.server, config.webOrigins);
  const engine = new GameEngine({
    persistence,
    rules: contractRules,
    config: {
      sessionSecret: config.sessionSecret,
      roomLifetimeMs: config.roomLifetimeMs,
      emptyRoomTtlMs: config.emptyRoomTtlMs,
      disconnectedSeatMs: config.disconnectedSeatMs,
      drawerPauseMs: config.drawerPauseMs,
    },
    transport: new SocketIoTransport(io),
  });
  registerSocketHandlers(io, engine);

  app.get("/healthz", async (): Promise<HealthResponse> => {
    const persistenceReady = await persistence.isReady();
    const redisUp = persistence.kind === "redis" && persistenceReady;
    return {
      status: persistenceReady ? (redisUp ? "ok" : "degraded") : "degraded",
      redis: redisUp ? "up" : "down",
      uptimeSeconds: process.uptime(),
    };
  });

  app.get("/readyz", async (_request, reply) => {
    const engineReady = await engine.isReady();
    const ready =
      engineReady && (config.nodeEnv !== "production" || persistence.kind === "redis");
    return reply.code(ready ? 200 : 503).send({
      status: ready ? "ok" : "degraded",
      persistence: persistence.kind,
    });
  });

  app.get("/api/themes", async (): Promise<ThemesResponse> => ({
    themes: [...THEME_METADATA],
  }));

  const webIndexPath = join(config.webDistDirectory, "index.html");
  const hasWebBuild = existsSync(webIndexPath);
  if (hasWebBuild) {
    await app.register(fastifyStatic, {
      root: config.webDistDirectory,
      prefix: "/",
      wildcard: false,
    });
  }

  app.setNotFoundHandler(async (request, reply) => {
    if (
      hasWebBuild &&
      request.method === "GET" &&
      !request.url.startsWith("/api/") &&
      request.headers.accept?.includes("text/html")
    ) {
      return reply
        .header("cache-control", "no-store")
        .type("text/html; charset=utf-8")
        .sendFile("index.html");
    }
    return reply.code(404).send({
      error: "Not Found",
      message: "The requested resource does not exist.",
    });
  });

  let closed = false;
  let ioClosed = false;
  const closeSockets = async () => {
    if (ioClosed) {
      return;
    }
    ioClosed = true;
    await new Promise<void>((resolve) => {
      io.close(() => resolve());
    });
  };
  app.addHook("onClose", async () => {
    if (closed) {
      return;
    }
    closed = true;
    await engine.stop();
    await persistence.close();
  });

  await engine.start();
  await app.ready();

  return {
    app,
    io,
    engine,
    async close() {
      // Fastify waits for upgraded connections. Close Socket.IO first so its
      // WebSocket clients cannot deadlock the HTTP server's close lifecycle.
      await closeSockets();
      await app.close();
    },
    announceShutdown() {
      io.emit("server:shutdown", {
        message: "The game server is restarting. Reconnection will be attempted.",
      });
    },
  };
}
