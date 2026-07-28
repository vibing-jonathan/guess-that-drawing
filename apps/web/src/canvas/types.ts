export const LOGICAL_CANVAS_WIDTH = 1600;
export const LOGICAL_CANVAS_HEIGHT = 1200;

export interface CanvasPoint {
  readonly x: number;
  readonly y: number;
}

export type FreehandTool = "brush" | "eraser";
export type ShapeTool = "line" | "rectangle" | "ellipse";
export type DrawingTool = FreehandTool | ShapeTool;
export type ShapeMode = "outline" | "fill";

export interface DrawingStyle {
  readonly color: string;
  readonly size: number;
  readonly shapeMode: ShapeMode;
}

export interface StrokeAction {
  readonly kind: "stroke";
  readonly id: string;
  readonly tool: FreehandTool;
  readonly color: string;
  readonly size: number;
  readonly points: readonly CanvasPoint[];
}

export interface ShapeAction {
  readonly kind: "shape";
  readonly id: string;
  readonly shape: ShapeTool;
  readonly color: string;
  readonly size: number;
  readonly shapeMode: ShapeMode;
  readonly start: CanvasPoint;
  readonly end: CanvasPoint;
}

export interface ClearAction {
  readonly kind: "clear";
  readonly id: string;
}

export type CanvasAction = StrokeAction | ShapeAction | ClearAction;

export interface DrawingOperationBase {
  /**
   * Globally unique idempotency id for this operation or stroke chunk.
   */
  readonly id: string;
  readonly turnId: string;
  /**
   * Stable id shared by all chunks belonging to one user action.
   */
  readonly strokeId: string;
  /**
   * Zero-based chunk number within a stroke. Non-stroke operations use 0.
   */
  readonly chunkId: number;
  /**
   * Monotonic sequence assigned by the authoritative server.
   */
  readonly serverSequence?: number;
}

export interface StrokeDrawingOperation extends DrawingOperationBase {
  readonly kind: "stroke";
  readonly tool: FreehandTool;
  readonly color: string;
  readonly size: number;
  readonly points: readonly CanvasPoint[];
  readonly isFinal: boolean;
}

export interface ShapeDrawingOperation extends DrawingOperationBase {
  readonly kind: "shape";
  readonly shape: ShapeTool;
  readonly color: string;
  readonly size: number;
  readonly shapeMode: ShapeMode;
  readonly start: CanvasPoint;
  readonly end: CanvasPoint;
}

export interface ClearDrawingOperation extends DrawingOperationBase {
  readonly kind: "clear";
}

export interface UndoDrawingOperation extends DrawingOperationBase {
  readonly kind: "undo";
  readonly targetOpId: string;
}

export interface RedoDrawingOperation extends DrawingOperationBase {
  readonly kind: "redo";
  readonly targetOpId: string;
}

/**
 * Framework-independent wire shape used by the renderer. The socket layer can
 * adapt a shared-contract DrawingOp to this structure without coupling canvas
 * rendering to room state.
 */
export type DrawingOperation =
  | StrokeDrawingOperation
  | ShapeDrawingOperation
  | ClearDrawingOperation
  | UndoDrawingOperation
  | RedoDrawingOperation;

export interface CanvasViewport {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly devicePixelRatio: number;
  readonly bitmapWidth: number;
  readonly bitmapHeight: number;
  /**
   * CSS pixels per logical canvas unit.
   */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly contentWidth: number;
  readonly contentHeight: number;
}

export interface CanvasClientRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ReplayResult {
  readonly actions: readonly CanvasAction[];
  readonly redoActions: readonly CanvasAction[];
  readonly highestServerSequence: number | null;
  readonly missingServerSequences: readonly number[];
}
