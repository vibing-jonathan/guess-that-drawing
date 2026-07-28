import { describe, expect, it } from "vitest";

import {
  fromContractDrawingEnvelope,
  toContractDrawingOp,
} from "../contractAdapter";

describe("shared contract adapter", () => {
  it("maps a contract envelope into deterministic renderer metadata", () => {
    const operation = fromContractDrawingEnvelope({
      turnId: "turn-1",
      strokeId: "stroke-1",
      chunkId: 4,
      serverSequence: 18,
      operation: {
        opId: "operation-4",
        kind: "shape",
        shape: "rectangle",
        style: { color: "#abcdef", size: 20, fill: true },
        start: { x: 10, y: 10 },
        end: { x: 30, y: 40 },
      },
    });

    expect(operation).toMatchObject({
      id: "operation-4",
      turnId: "turn-1",
      strokeId: "stroke-1",
      chunkId: 4,
      serverSequence: 18,
      kind: "shape",
      shapeMode: "fill",
    });
  });

  it("maps local operations to the shared DrawingOp shape", () => {
    const operation = toContractDrawingOp({
      id: "shape-op",
      turnId: "turn-1",
      strokeId: "shape-1",
      chunkId: 0,
      kind: "shape",
      shape: "ellipse",
      color: "#123456",
      size: 16,
      shapeMode: "outline",
      start: { x: 2, y: 4 },
      end: { x: 8, y: 12 },
    });

    expect(operation).toEqual({
      opId: "shape-op",
      kind: "shape",
      shape: "ellipse",
      style: { color: "#123456", size: 16, fill: false },
      start: { x: 2, y: 4 },
      end: { x: 8, y: 12 },
    });
  });
});
