import { describe, expect, it, vi } from "vitest";

import { CanvasEngine } from "../CanvasEngine";
import type { DrawingOperation } from "../types";
import { createMockCanvas } from "./mockCanvas";

function sequentialIds(...ids: string[]): () => string {
  let index = 0;
  return () => ids[index++] ?? `generated-${index}`;
}

describe("CanvasEngine", () => {
  it("sizes backing stores for DPR while retaining logical transforms", () => {
    const canvas = createMockCanvas(800, 600);
    const preview = createMockCanvas(800, 600);
    const engine = new CanvasEngine(canvas, {
      previewCanvas: preview,
      bindPointerEvents: false,
      getDevicePixelRatio: () => 2,
    });

    expect(canvas.width).toBe(1600);
    expect(canvas.height).toBe(1200);
    expect(preview.width).toBe(1600);
    expect(preview.height).toBe(1200);
    expect(engine.currentViewport.scale).toBe(0.5);
    expect(canvas.context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
  });

  it("keeps shape previews outside history and commits custom styles", () => {
    const canvas = createMockCanvas();
    const preview = createMockCanvas();
    const operations: DrawingOperation[] = [];
    const engine = new CanvasEngine(canvas, {
      previewCanvas: preview,
      bindPointerEvents: false,
      idFactory: sequentialIds("rectangle-1"),
      onOperation: (operation) => operations.push(operation),
    });

    engine.setTool("rectangle");
    engine.setColor("#ff3355");
    engine.setSize(24);
    engine.setShapeMode("fill");
    engine.startPointer(50, 50, 7);
    engine.movePointer(250, 200, 7);

    expect(engine.actions).toHaveLength(0);
    expect(engine.previewAction).toMatchObject({
      shape: "rectangle",
      color: "#ff3355",
      size: 24,
      shapeMode: "fill",
      start: { x: 100, y: 100 },
      end: { x: 500, y: 400 },
    });
    expect(preview.context.rect).toHaveBeenCalled();
    expect(preview.context.fill).toHaveBeenCalled();

    engine.endPointer(250, 200, 7);

    expect(engine.previewAction).toBeNull();
    expect(engine.actions).toHaveLength(1);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "shape",
      strokeId: "rectangle-1",
      shape: "rectangle",
    });
  });

  it("batches freehand points per animation frame and emits a final chunk", () => {
    const canvas = createMockCanvas();
    const operations: DrawingOperation[] = [];
    let queuedFrame: FrameRequestCallback | undefined;
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      idFactory: sequentialIds("stroke-1"),
      requestFrame: (callback) => {
        queuedFrame = callback;
        return 1;
      },
      cancelFrame: vi.fn(),
      onOperation: (operation) => operations.push(operation),
    });

    engine.startPointer(0, 0, 3);
    engine.movePointer(10, 10, 3);
    engine.movePointer(20, 20, 3);
    expect(operations).toHaveLength(0);

    queuedFrame?.(16);
    expect(operations).toHaveLength(1);
    expect(operations[0]).toMatchObject({
      kind: "stroke",
      chunkId: 0,
      isFinal: false,
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 40, y: 40 },
      ],
    });

    engine.endPointer(30, 30, 3);
    expect(operations.at(-1)).toMatchObject({
      kind: "stroke",
      chunkId: 1,
      isFinal: true,
      points: [
        { x: 40, y: 40 },
        { x: 60, y: 60 },
      ],
    });
    expect(engine.actions[0]).toMatchObject({
      kind: "stroke",
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
        { x: 40, y: 40 },
        { x: 60, y: 60 },
      ],
    });
  });

  it("splits delayed freehand batches at the shared 256-point limit", () => {
    const canvas = createMockCanvas();
    const operations: DrawingOperation[] = [];
    let queuedFrame: FrameRequestCallback | undefined;
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      idFactory: sequentialIds("long-stroke"),
      requestFrame: (callback) => {
        queuedFrame = callback;
        return 1;
      },
      onOperation: (operation) => operations.push(operation),
    });

    engine.startPointer(0, 0, 5);
    for (let index = 1; index <= 300; index += 1) {
      engine.movePointer(index * 2, index % 500, 5);
    }
    queuedFrame?.(16);

    const chunks = operations.filter(
      (operation) => operation.kind === "stroke",
    );
    expect(chunks).toHaveLength(2);
    expect(
      chunks.every(
        (operation) =>
          operation.kind === "stroke" && operation.points.length <= 256,
      ),
    ).toBe(true);
    expect(chunks.map((operation) => operation.chunkId)).toEqual([0, 1]);
  });

  it("supports erasing, undoable clear, undo, and redo", () => {
    const canvas = createMockCanvas();
    const operations: DrawingOperation[] = [];
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      idFactory: sequentialIds(
        "eraser-1",
        "clear-1",
        "undo-operation",
        "redo-operation",
      ),
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
      onOperation: (operation) => operations.push(operation),
    });

    engine.setTool("eraser");
    engine.startPointer(100, 100);
    engine.endPointer(140, 140);
    expect(canvas.context.globalCompositeOperation).toBe("destination-out");

    engine.clear();
    expect(engine.actions.map((action) => action.kind)).toEqual([
      "stroke",
      "clear",
    ]);
    expect(engine.undo()?.kind).toBe("clear");
    expect(engine.actions.map((action) => action.kind)).toEqual(["stroke"]);
    expect(engine.redo()?.kind).toBe("clear");
    expect(engine.actions.map((action) => action.kind)).toEqual([
      "stroke",
      "clear",
    ]);
    expect(operations.map((operation) => operation.kind)).toEqual([
      "stroke",
      "clear",
      "undo",
      "redo",
    ]);
  });

  it("rebuilds authoritative state from out-of-order operations", () => {
    const canvas = createMockCanvas();
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
    });
    const operations: DrawingOperation[] = [
      {
        id: "second",
        kind: "stroke",
        turnId: "turn-1",
        strokeId: "stroke-1",
        chunkId: 1,
        serverSequence: 4,
        tool: "brush",
        color: "#222222",
        size: 8,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
        isFinal: true,
      },
      {
        id: "first",
        kind: "stroke",
        turnId: "turn-1",
        strokeId: "stroke-1",
        chunkId: 0,
        serverSequence: 2,
        tool: "brush",
        color: "#222222",
        size: 8,
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 10 },
        ],
        isFinal: false,
      },
    ];

    engine.replaceAuthoritativeOperations(operations);

    expect(engine.lastServerSequence).toBe(4);
    expect(engine.sequenceGaps).toEqual([3]);
    expect(engine.actions[0]).toMatchObject({
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    });
  });

  it("merges acknowledgements without cancelling an active drawer stroke", () => {
    const canvas = createMockCanvas();
    const operations: DrawingOperation[] = [];
    let queuedFrame: FrameRequestCallback | undefined;
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
      idFactory: sequentialIds("stroke-1"),
      requestFrame: (callback) => {
        queuedFrame = callback;
        return 1;
      },
      cancelFrame: vi.fn(),
      onOperation: (operation) => operations.push(operation),
    });

    engine.startPointer(10, 10, 9);
    engine.movePointer(20, 20, 9);
    queuedFrame?.(16);
    expect(engine.pendingOperationCount).toBe(1);

    engine.mergeAuthoritativeOperations([
      { ...operations[0]!, serverSequence: 1 },
    ]);

    expect(engine.pendingOperationCount).toBe(0);
    expect(engine.movePointer(30, 30, 9)).toBe(true);
    expect(engine.endPointer(40, 40, 9)).toBe(true);
    expect(engine.actions).toHaveLength(1);
    expect(engine.actions[0]).toMatchObject({
      id: "stroke-1",
      points: [
        { x: 20, y: 20 },
        { x: 40, y: 40 },
        { x: 60, y: 60 },
        { x: 80, y: 80 },
      ],
    });

    engine.mergeAuthoritativeOperations([
      { ...operations[1]!, serverSequence: 2 },
    ]);
    expect(engine.pendingOperationCount).toBe(0);
    expect(engine.actions).toHaveLength(1);
  });

  it("keeps completed optimistic actions through routine state synchronization", () => {
    const canvas = createMockCanvas();
    const operations: DrawingOperation[] = [];
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
      idFactory: sequentialIds("line-1"),
      onOperation: (operation) => operations.push(operation),
    });

    engine.setTool("line");
    engine.startPointer(10, 10);
    engine.endPointer(50, 50);
    expect(engine.pendingOperationCount).toBe(1);
    expect(engine.actions).toHaveLength(1);

    engine.mergeAuthoritativeOperations([]);
    expect(engine.pendingOperationCount).toBe(1);
    expect(engine.actions[0]).toMatchObject({
      kind: "shape",
      id: "line-1",
    });

    engine.mergeAuthoritativeOperations([
      { ...operations[0]!, serverSequence: 7 },
    ]);
    expect(engine.pendingOperationCount).toBe(0);
    expect(engine.actions[0]).toMatchObject({
      kind: "shape",
      id: "line-1",
    });
  });

  it("uses destructive recovery only when explicitly requested", () => {
    const canvas = createMockCanvas();
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
      idFactory: sequentialIds("line-1", "stroke-2"),
      requestFrame: () => 1,
      cancelFrame: vi.fn(),
    });

    engine.setTool("line");
    engine.startPointer(10, 10);
    engine.endPointer(50, 50);
    expect(engine.pendingOperationCount).toBe(1);

    engine.setTool("brush");
    engine.startPointer(60, 60, 4);
    engine.recoverAuthoritativeOperations([], "turn-1");

    expect(engine.pendingOperationCount).toBe(0);
    expect(engine.actions).toEqual([]);
    expect(engine.movePointer(70, 70, 4)).toBe(false);
  });

  it("resets drawing and sequence state when a new turn begins", () => {
    const canvas = createMockCanvas();
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
      idFactory: sequentialIds("shape-1"),
    });

    engine.setTool("line");
    engine.startPointer(10, 10);
    engine.endPointer(20, 20);
    expect(engine.actions).toHaveLength(1);

    engine.setTurnId("turn-2");
    expect(engine.actions).toEqual([]);
    expect(engine.lastServerSequence).toBeNull();
    expect(engine.sequenceGaps).toEqual([]);
  });

  it("can reset a reused turn id after an authoritative drawing reset", () => {
    const canvas = createMockCanvas();
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      turnId: "turn-1",
      idFactory: sequentialIds("shape-1"),
    });

    engine.setTool("line");
    engine.startPointer(10, 10);
    engine.endPointer(20, 20);
    expect(engine.pendingOperationCount).toBe(1);

    engine.resetTurn("turn-1");
    expect(engine.actions).toEqual([]);
    expect(engine.pendingOperationCount).toBe(0);
  });

  it("renders each supported shape primitive", () => {
    const canvas = createMockCanvas();
    const engine = new CanvasEngine(canvas, {
      bindPointerEvents: false,
      idFactory: sequentialIds("line-1", "rectangle-1", "ellipse-1"),
    });

    engine.setTool("line");
    engine.startPointer(20, 20);
    engine.endPointer(80, 80);
    engine.setTool("rectangle");
    engine.startPointer(30, 30);
    engine.endPointer(90, 100);
    engine.setTool("ellipse");
    engine.startPointer(40, 40);
    engine.endPointer(120, 110);

    expect(engine.actions.map((action) => action.kind)).toEqual([
      "shape",
      "shape",
      "shape",
    ]);
    expect(canvas.context.lineTo).toHaveBeenCalled();
    expect(canvas.context.rect).toHaveBeenCalled();
    expect(canvas.context.ellipse).toHaveBeenCalled();
  });
});
