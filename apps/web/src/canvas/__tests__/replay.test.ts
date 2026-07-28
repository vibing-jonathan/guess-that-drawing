import { describe, expect, it } from "vitest";

import {
  findMissingServerSequences,
  replayDrawingOperations,
} from "../replay";
import type { DrawingOperation } from "../types";

function strokeChunk(
  id: string,
  sequence: number,
  chunkId: number,
  points: readonly { x: number; y: number }[],
): DrawingOperation {
  return {
    id,
    kind: "stroke",
    turnId: "turn-1",
    strokeId: "stroke-1",
    chunkId,
    serverSequence: sequence,
    tool: "brush",
    color: "#111111",
    size: 10,
    points,
    isFinal: false,
  };
}

describe("authoritative drawing replay", () => {
  it("orders chunks by server sequence, deduplicates ids, and joins overlap", () => {
    const second = strokeChunk(
      "operation-2",
      2,
      1,
      [
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    );
    const first = strokeChunk(
      "operation-1",
      1,
      0,
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
    );

    const result = replayDrawingOperations([second, first, second], "turn-1");

    expect(result.actions).toHaveLength(1);
    expect(result.actions[0]).toMatchObject({
      kind: "stroke",
      id: "stroke-1",
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ],
    });
    expect(result.highestServerSequence).toBe(2);
    expect(result.missingServerSequences).toEqual([]);
  });

  it("reconstructs shape, clear, undo, and redo deterministically", () => {
    const operations: DrawingOperation[] = [
      {
        id: "shape-op",
        kind: "shape",
        turnId: "turn-1",
        strokeId: "shape-1",
        chunkId: 0,
        serverSequence: 1,
        shape: "ellipse",
        color: "#ff0000",
        size: 14,
        shapeMode: "fill",
        start: { x: 10, y: 20 },
        end: { x: 90, y: 120 },
      },
      {
        id: "clear-op",
        kind: "clear",
        turnId: "turn-1",
        strokeId: "clear-1",
        chunkId: 0,
        serverSequence: 2,
      },
      {
        id: "undo-op",
        kind: "undo",
        turnId: "turn-1",
        strokeId: "undo-1",
        chunkId: 0,
        serverSequence: 3,
        targetOpId: "clear-op",
      },
      {
        id: "redo-op",
        kind: "redo",
        turnId: "turn-1",
        strokeId: "redo-1",
        chunkId: 0,
        serverSequence: 4,
        targetOpId: "clear-op",
      },
    ];

    const result = replayDrawingOperations(operations, "turn-1");

    expect(result.actions.map((action) => action.id)).toEqual([
      "shape-1",
      "clear-1",
    ]);
    expect(result.actions[0]).toMatchObject({
      kind: "shape",
      shape: "ellipse",
      shapeMode: "fill",
    });
  });

  it("reports recoverable server-sequence gaps and ignores other turns", () => {
    const operations: DrawingOperation[] = [
      strokeChunk("operation-1", 7, 0, [{ x: 0, y: 0 }]),
      strokeChunk("operation-3", 10, 2, [{ x: 20, y: 20 }]),
      {
        ...strokeChunk("other-turn", 8, 0, [{ x: 1, y: 1 }]),
        turnId: "turn-2",
      },
    ];

    expect(findMissingServerSequences(operations)).toEqual([9]);
    const result = replayDrawingOperations(operations, "turn-1");
    expect(result.missingServerSequences).toEqual([8, 9]);
    expect(result.actions).toHaveLength(1);
  });
});
