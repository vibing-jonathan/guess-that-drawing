import type { DrawingOperation } from "./types";

const DEFAULT_MAX_IN_FLIGHT = 4;
const DEFAULT_DISPATCH_INTERVAL_MS = 34;

type TimerHandle = ReturnType<typeof globalThis.setTimeout>;

export interface CanvasDrawingTransportOptions {
  readonly send: (operation: DrawingOperation) => Promise<unknown>;
  readonly recover: () => Promise<unknown>;
  readonly onError: (message: string | null) => void;
  readonly maxInFlight?: number;
  readonly dispatchIntervalMs?: number;
  readonly now?: () => number;
  readonly schedule?: (callback: () => void, delay: number) => TimerHandle;
  readonly cancelScheduled?: (handle: TimerHandle) => void;
}

interface QueueItem {
  readonly key: string;
  readonly operation: DrawingOperation;
}

function queueKey(operation: DrawingOperation): string {
  return JSON.stringify([
    operation.turnId,
    operation.strokeId,
    operation.chunkId,
    operation.id,
  ]);
}

function errorDetails(caught: unknown): {
  readonly code?: string;
  readonly message?: string;
} {
  if (!caught || typeof caught !== "object") {
    return {};
  }
  const issue = caught as { code?: unknown; message?: unknown };
  return {
    ...(typeof issue.code === "string" ? { code: issue.code } : {}),
    ...(typeof issue.message === "string"
      ? { message: issue.message }
      : {}),
  };
}

/**
 * A small, bounded drawing pipeline.
 *
 * Socket.IO preserves emission order, while the in-flight window prevents a
 * slow acknowledgement round trip from reducing a 30 Hz drawing stream to
 * one request per RTT. Each operation is dispatched only once and is keyed by
 * its stable turn/stroke/chunk/op identity.
 *
 * Any non-idempotent rejection invalidates queued sequence dependencies. The
 * transport stops dispatching, lets already-emitted requests settle, then
 * performs exactly one authoritative recovery before accepting more work.
 */
export class CanvasDrawingTransport {
  private readonly send: (operation: DrawingOperation) => Promise<unknown>;
  private readonly recover: () => Promise<unknown>;
  private readonly onError: (message: string | null) => void;
  private readonly maxInFlight: number;
  private readonly dispatchIntervalMs: number;
  private readonly now: () => number;
  private readonly scheduleCallback: (
    callback: () => void,
    delay: number,
  ) => TimerHandle;
  private readonly cancelScheduledCallback: (handle: TimerHandle) => void;

  private readonly queue: QueueItem[] = [];
  private readonly activeKeys = new Set<string>();
  private readonly inFlight = new Map<string, Promise<unknown>>();
  private lastDispatchedAt: number | null = null;
  private timer: TimerHandle | null = null;
  private stopped = false;
  private recovering = false;
  private recoveryStarted = false;

  constructor(options: CanvasDrawingTransportOptions) {
    this.send = options.send;
    this.recover = options.recover;
    this.onError = options.onError;
    this.maxInFlight = Math.max(
      1,
      Math.floor(options.maxInFlight ?? DEFAULT_MAX_IN_FLIGHT),
    );
    this.dispatchIntervalMs = Math.max(
      0,
      options.dispatchIntervalMs ?? DEFAULT_DISPATCH_INTERVAL_MS,
    );
    this.now = options.now ?? (() => performance.now());
    this.scheduleCallback =
      options.schedule ??
      ((callback, delay) => globalThis.setTimeout(callback, delay));
    this.cancelScheduledCallback =
      options.cancelScheduled ??
      ((handle) => globalThis.clearTimeout(handle));
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  get inFlightCount(): number {
    return this.inFlight.size;
  }

  get isRecovering(): boolean {
    return this.recovering;
  }

  enqueue(operation: DrawingOperation): boolean {
    if (this.stopped || this.recovering) {
      return false;
    }
    const key = queueKey(operation);
    if (this.activeKeys.has(key)) {
      return false;
    }
    this.activeKeys.add(key);
    this.queue.push({ key, operation });
    this.schedulePump();
    return true;
  }

  stop(): void {
    if (this.stopped) {
      return;
    }
    this.stopped = true;
    this.clearTimer();
    for (const item of this.queue) {
      this.activeKeys.delete(item.key);
    }
    this.queue.length = 0;
  }

  private schedulePump(delay?: number): void {
    if (
      this.stopped ||
      this.recovering ||
      this.timer !== null ||
      this.queue.length === 0 ||
      this.inFlight.size >= this.maxInFlight
    ) {
      return;
    }
    const wait = delay ?? this.nextDispatchDelay();
    this.timer = this.scheduleCallback(() => {
      this.timer = null;
      this.pump();
    }, wait);
  }

  private nextDispatchDelay(): number {
    if (this.lastDispatchedAt === null) {
      return 0;
    }
    return Math.max(
      0,
      this.dispatchIntervalMs - (this.now() - this.lastDispatchedAt),
    );
  }

  private pump(): void {
    if (
      this.stopped ||
      this.recovering ||
      this.queue.length === 0 ||
      this.inFlight.size >= this.maxInFlight
    ) {
      return;
    }

    const wait = this.nextDispatchDelay();
    if (wait > 0) {
      this.schedulePump(wait);
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }
    this.lastDispatchedAt = this.now();
    this.dispatch(item);

    if (
      this.dispatchIntervalMs === 0 &&
      this.queue.length > 0 &&
      this.inFlight.size < this.maxInFlight
    ) {
      this.pump();
      return;
    }
    this.schedulePump(this.dispatchIntervalMs);
  }

  private dispatch(item: QueueItem): void {
    const request = Promise.resolve().then(() => this.send(item.operation));
    this.inFlight.set(item.key, request);
    void request.then(
      () => this.settle(item, null),
      (caught: unknown) => this.settle(item, caught),
    );
  }

  private settle(item: QueueItem, caught: unknown): void {
    this.inFlight.delete(item.key);
    this.activeKeys.delete(item.key);

    if (this.stopped) {
      return;
    }

    if (caught !== null) {
      const issue = errorDetails(caught);
      if (issue.code !== "DUPLICATE_EVENT") {
        this.beginRecovery(
          issue.message ??
            "A drawing update could not be synchronized. The canvas was resynced.",
        );
      }
    } else if (!this.recovering) {
      this.onError(null);
    }

    if (this.recovering) {
      this.startRecoveryWhenSettled();
      return;
    }
    this.schedulePump();
  }

  private beginRecovery(message: string): void {
    if (this.recovering) {
      return;
    }
    this.recovering = true;
    this.clearTimer();
    for (const item of this.queue) {
      this.activeKeys.delete(item.key);
    }
    this.queue.length = 0;
    this.onError(message);
  }

  private startRecoveryWhenSettled(): void {
    if (
      this.stopped ||
      !this.recovering ||
      this.recoveryStarted ||
      this.inFlight.size > 0
    ) {
      return;
    }
    this.recoveryStarted = true;
    void Promise.resolve()
      .then(() => this.recover())
      .catch(() => {
        // Preserve the original transport error. Connection state owns
        // recovery-request failures and offers the user another retry.
      })
      .finally(() => {
        this.recoveryStarted = false;
        this.recovering = false;
        this.lastDispatchedAt = null;
      });
  }

  private clearTimer(): void {
    if (this.timer === null) {
      return;
    }
    this.cancelScheduledCallback(this.timer);
    this.timer = null;
  }
}
