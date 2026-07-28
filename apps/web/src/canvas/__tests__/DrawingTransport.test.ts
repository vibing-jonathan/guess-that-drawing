import { afterEach, describe, expect, it, vi } from "vitest";

import { CanvasDrawingTransport } from "../DrawingTransport";
import type { DrawingOperation } from "../types";

interface Deferred {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
  readonly reject: (reason: unknown) => void;
}

function deferred(): Deferred {
  let resolve!: () => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<void>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function stroke(chunkId: number, id = `stroke-1:${chunkId}`): DrawingOperation {
  return {
    id,
    kind: "stroke",
    turnId: "turn-1",
    strokeId: "stroke-1",
    chunkId,
    tool: "brush",
    color: "#1F2937",
    size: 12,
    points: [
      { x: chunkId, y: chunkId },
      { x: chunkId + 1, y: chunkId + 1 },
    ],
    isFinal: false,
  };
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
});

describe("CanvasDrawingTransport", () => {
  it("pipelines 30 Hz chunks through a bounded in-flight window", async () => {
    vi.useFakeTimers();
    const pending: Deferred[] = [];
    let active = 0;
    let highestActive = 0;
    const send = vi.fn(() => {
      const request = deferred();
      pending.push(request);
      active += 1;
      highestActive = Math.max(highestActive, active);
      return request.promise.finally(() => {
        active -= 1;
      });
    });
    const transport = new CanvasDrawingTransport({
      send,
      recover: vi.fn().mockResolvedValue(undefined),
      onError: vi.fn(),
      maxInFlight: 4,
      dispatchIntervalMs: 34,
    });

    for (let chunkId = 0; chunkId < 6; chunkId += 1) {
      transport.enqueue(stroke(chunkId));
    }

    await vi.advanceTimersByTimeAsync(102);
    expect(send).toHaveBeenCalledTimes(4);
    expect(transport.inFlightCount).toBe(4);
    expect(transport.queuedCount).toBe(2);
    expect(highestActive).toBe(4);

    pending[0]!.resolve();
    await flushMicrotasks();
    await vi.advanceTimersByTimeAsync(34);
    expect(send).toHaveBeenCalledTimes(5);
    expect(highestActive).toBe(4);

    transport.stop();
    for (const request of pending.slice(1)) {
      request.resolve();
    }
    await flushMicrotasks();
  });

  it("deduplicates a queued chunk by its stable operation identity", async () => {
    vi.useFakeTimers();
    const request = deferred();
    const send = vi.fn(() => request.promise);
    const transport = new CanvasDrawingTransport({
      send,
      recover: vi.fn().mockResolvedValue(undefined),
      onError: vi.fn(),
      dispatchIntervalMs: 0,
    });
    const operation = stroke(0, "stable-op-id");

    expect(transport.enqueue(operation)).toBe(true);
    expect(transport.enqueue(operation)).toBe(false);
    await vi.runOnlyPendingTimersAsync();
    expect(send).toHaveBeenCalledTimes(1);

    request.resolve();
    await flushMicrotasks();
  });

  it("drops dependent queued chunks and recovers once after emitted requests settle", async () => {
    vi.useFakeTimers();
    const pending: Deferred[] = [];
    const send = vi.fn(() => {
      const request = deferred();
      pending.push(request);
      return request.promise;
    });
    const recover = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const transport = new CanvasDrawingTransport({
      send,
      recover,
      onError,
      maxInFlight: 3,
      dispatchIntervalMs: 0,
    });

    for (let chunkId = 0; chunkId < 5; chunkId += 1) {
      transport.enqueue(stroke(chunkId));
    }
    await vi.runOnlyPendingTimersAsync();
    await flushMicrotasks();
    expect(send).toHaveBeenCalledTimes(3);

    pending[1]!.reject({
      code: "DRAWING_SEQUENCE_GAP",
      message: "Drawing chunks must arrive in order.",
    });
    await flushMicrotasks();

    expect(transport.isRecovering).toBe(true);
    expect(transport.queuedCount).toBe(0);
    expect(transport.enqueue(stroke(5))).toBe(false);
    expect(recover).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(
      "Drawing chunks must arrive in order.",
    );

    pending[0]!.resolve();
    pending[2]!.resolve();
    await flushMicrotasks();

    expect(recover).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(3);
    await flushMicrotasks();
    expect(transport.isRecovering).toBe(false);
  });
});
