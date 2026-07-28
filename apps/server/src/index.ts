import { resolve } from "node:path";
import { buildApplication } from "./app.js";
import { loadConfig } from "./config.js";
import { createGamePersistence } from "./persistence.js";

function loadEnvironmentFile(): void {
  try {
    const invocationDirectory = process.env.INIT_CWD ?? process.cwd();
    process.loadEnvFile(resolve(invocationDirectory, ".env"));
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    ) {
      throw error;
    }
  }
}

async function main(): Promise<void> {
  loadEnvironmentFile();
  const config = loadConfig();
  const persistence = await createGamePersistence({
    redisUrl: config.redisUrl,
    redisRequired: config.redisRequired,
  });
  const runtime = await buildApplication({ config, persistence });

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    const forceExit = setTimeout(() => {
      runtime.app.log.error("graceful shutdown timed out");
      process.exit(1);
    }, 10_000);
    forceExit.unref();
    const shutdownErrors: unknown[] = [];
    let closeSucceeded = false;
    try {
      runtime.app.log.info({ signal }, "graceful shutdown started");
      runtime.announceShutdown();
    } catch (error) {
      shutdownErrors.push(error);
    } finally {
      try {
        await runtime.close();
        closeSucceeded = true;
      } catch (error) {
        shutdownErrors.push(error);
      }
      if (closeSucceeded) {
        clearTimeout(forceExit);
      }
      if (shutdownErrors.length > 0) {
        runtime.app.log.error(
          { errors: shutdownErrors },
          "graceful shutdown failed",
        );
        process.exitCode = 1;
      } else {
        process.exitCode = 0;
      }
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await runtime.app.listen({
    host: config.host,
    port: config.port,
  });
}

void main().catch((error: unknown) => {
  // Startup errors are intentionally concise; event payloads, chat, and answers
  // are never included in application logs.
  const message = error instanceof Error ? error.message : "Unknown startup error";
  process.stderr.write(`Server failed to start: ${message}\n`);
  process.exitCode = 1;
});
