import type {
  CanvasPoint,
  DrawingOperation,
  ShapeMode,
} from "./types";

/**
 * Structural versions of the shared contract keep this package usable while
 * workspace declarations are being built. They intentionally mirror
 * @gtd/contracts DrawingOp and DrawingEnvelope.
 */
export interface ContractPointLike extends CanvasPoint {
  readonly pressure?: number | undefined;
}

export interface ContractDrawingStyleLike {
  readonly color: string;
  readonly size: number;
  readonly fill: boolean;
}

export type ContractDrawingOpLike =
  | {
      readonly opId: string;
      readonly kind: "stroke";
      readonly tool: "brush" | "eraser";
      readonly style: ContractDrawingStyleLike;
      readonly points: readonly ContractPointLike[];
    }
  | {
      readonly opId: string;
      readonly kind: "shape";
      readonly shape: "line" | "rectangle" | "ellipse";
      readonly style: ContractDrawingStyleLike;
      readonly start: ContractPointLike;
      readonly end: ContractPointLike;
    }
  | {
      readonly opId: string;
      readonly kind: "clear";
    }
  | {
      readonly opId: string;
      readonly kind: "undo" | "redo";
      readonly targetOpId: string;
    };

export interface ContractDrawingEnvelopeLike {
  readonly turnId: string;
  readonly strokeId: string;
  readonly chunkId: number;
  readonly serverSequence: number;
  readonly operation: ContractDrawingOpLike;
}

function shapeMode(style: ContractDrawingStyleLike): ShapeMode {
  return style.fill ? "fill" : "outline";
}

export function fromContractDrawingEnvelope(
  envelope: ContractDrawingEnvelopeLike,
): DrawingOperation {
  const metadata = {
    id: envelope.operation.opId,
    turnId: envelope.turnId,
    strokeId: envelope.strokeId,
    chunkId: envelope.chunkId,
    serverSequence: envelope.serverSequence,
  } as const;

  switch (envelope.operation.kind) {
    case "stroke":
      return {
        ...metadata,
        kind: "stroke",
        tool: envelope.operation.tool,
        color: envelope.operation.style.color,
        size: envelope.operation.style.size,
        points: envelope.operation.points,
        // Contract chunks do not need a final marker for deterministic replay.
        isFinal: false,
      };
    case "shape":
      return {
        ...metadata,
        kind: "shape",
        shape: envelope.operation.shape,
        color: envelope.operation.style.color,
        size: envelope.operation.style.size,
        shapeMode: shapeMode(envelope.operation.style),
        start: envelope.operation.start,
        end: envelope.operation.end,
      };
    case "clear":
      return {
        ...metadata,
        kind: "clear",
      };
    case "undo":
      return {
        ...metadata,
        kind: "undo",
        targetOpId: envelope.operation.targetOpId,
      };
    case "redo":
      return {
        ...metadata,
        kind: "redo",
        targetOpId: envelope.operation.targetOpId,
      };
  }
}

export function toContractDrawingOp(
  operation: DrawingOperation,
): ContractDrawingOpLike {
  switch (operation.kind) {
    case "stroke":
      return {
        opId: operation.id,
        kind: "stroke",
        tool: operation.tool,
        style: {
          color: operation.color,
          size: operation.size,
          fill: false,
        },
        points: operation.points,
      };
    case "shape":
      return {
        opId: operation.id,
        kind: "shape",
        shape: operation.shape,
        style: {
          color: operation.color,
          size: operation.size,
          fill: operation.shapeMode === "fill",
        },
        start: operation.start,
        end: operation.end,
      };
    case "clear":
      return {
        opId: operation.id,
        kind: "clear",
      };
    case "undo":
      return {
        opId: operation.id,
        kind: "undo",
        targetOpId: operation.targetOpId,
      };
    case "redo":
      return {
        opId: operation.id,
        kind: "redo",
        targetOpId: operation.targetOpId,
      };
  }
}
