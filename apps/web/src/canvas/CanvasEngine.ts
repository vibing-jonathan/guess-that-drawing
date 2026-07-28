import {
  clamp,
  computeCanvasViewport,
  mapClientPointToLogical,
  pointsEqual,
} from "./geometry";
import { ActionHistory } from "./history";
import {
  clearPreview,
  drawShape,
  drawStroke,
  renderActions,
} from "./renderer";
import { replayDrawingOperations } from "./replay";
import {
  type CanvasAction,
  type CanvasPoint,
  type CanvasViewport,
  type DrawingOperation,
  type DrawingStyle,
  type DrawingTool,
  type ShapeAction,
  type ShapeMode,
  type StrokeAction,
} from "./types";

const DEFAULT_COLOR = "#1F2937";
const DEFAULT_SIZE = 12;
const MIN_SIZE = 1;
const MAX_SIZE = 80;
const MAX_POINTS_PER_OPERATION = 256;
const MAX_COLOR_LENGTH = 32;

type FrameHandle = number | ReturnType<typeof globalThis.setTimeout>;

interface PointerSession {
  readonly pointerId: number;
  readonly actionId: string;
  readonly tool: DrawingTool;
  readonly style: DrawingStyle;
  readonly start: CanvasPoint;
  points: CanvasPoint[];
  current: CanvasPoint;
  renderedPointCount: number;
  emittedPointCount: number;
  chunkId: number;
}

export interface CanvasEngineOptions {
  readonly previewCanvas?: HTMLCanvasElement;
  readonly backgroundColor?: string;
  readonly turnId?: string;
  readonly initialTool?: DrawingTool;
  readonly initialColor?: string;
  readonly initialSize?: number;
  readonly initialShapeMode?: ShapeMode;
  readonly bindPointerEvents?: boolean;
  readonly onOperation?: (operation: DrawingOperation) => void;
  readonly onHistoryChange?: (state: CanvasHistoryState) => void;
  readonly idFactory?: () => string;
  readonly requestFrame?: (callback: FrameRequestCallback) => FrameHandle;
  readonly cancelFrame?: (handle: FrameHandle) => void;
  readonly getDevicePixelRatio?: () => number;
}

export interface CanvasHistoryState {
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly actionCount: number;
}

export interface ResizeOptions {
  readonly cssWidth?: number;
  readonly cssHeight?: number;
  readonly devicePixelRatio?: number;
}

let fallbackId = 0;

function defaultIdFactory(): string {
  if (
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
  ) {
    return globalThis.crypto.randomUUID();
  }
  fallbackId += 1;
  return `canvas-${fallbackId}`;
}

function defaultRequestFrame(callback: FrameRequestCallback): FrameHandle {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(performance.now()), 16);
}

function defaultCancelFrame(handle: FrameHandle): void {
  if (
    typeof handle === "number" &&
    typeof globalThis.cancelAnimationFrame === "function"
  ) {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout(handle);
  }
}

function defaultDpr(): number {
  return typeof globalThis.devicePixelRatio === "number"
    ? globalThis.devicePixelRatio
    : 1;
}

function normalizeColor(color: string): string {
  const normalized = color.trim();
  if (normalized.length === 0 || normalized.length > MAX_COLOR_LENGTH) {
    throw new Error(
      `Drawing color must contain between 1 and ${MAX_COLOR_LENGTH} characters.`,
    );
  }
  return normalized;
}

function normalizeSize(size: number): number {
  if (!Number.isFinite(size)) {
    throw new Error("Drawing size must be a finite number.");
  }
  return clamp(size, MIN_SIZE, MAX_SIZE);
}

function contextsFor(
  canvas: HTMLCanvasElement,
  previewCanvas?: HTMLCanvasElement,
): {
  context: CanvasRenderingContext2D;
  previewContext?: CanvasRenderingContext2D;
} {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("CanvasEngine requires a 2D canvas context.");
  }

  if (!previewCanvas) {
    return { context };
  }

  const previewContext = previewCanvas.getContext("2d");
  if (!previewContext) {
    throw new Error("CanvasEngine preview canvas requires a 2D context.");
  }

  return { context, previewContext };
}

export class CanvasEngine {
  readonly logicalWidth = 1600;
  readonly logicalHeight = 1200;

  private readonly canvas: HTMLCanvasElement;
  private readonly previewCanvas: HTMLCanvasElement | undefined;
  private readonly context: CanvasRenderingContext2D;
  private readonly previewContext: CanvasRenderingContext2D | undefined;
  private readonly history = new ActionHistory();
  private readonly onOperation: ((operation: DrawingOperation) => void) | undefined;
  private readonly onHistoryChange:
    | ((state: CanvasHistoryState) => void)
    | undefined;
  private readonly idFactory: () => string;
  private readonly requestFrame: (callback: FrameRequestCallback) => FrameHandle;
  private readonly cancelFrame: (handle: FrameHandle) => void;
  private readonly getDevicePixelRatio: () => number;
  private readonly backgroundColor: string | undefined;

  private tool: DrawingTool;
  private color: string;
  private size: number;
  private shapeMode: ShapeMode;
  private turnId: string;
  private viewport: CanvasViewport;
  private pointerSession: PointerSession | null = null;
  private frameHandle: FrameHandle | null = null;
  private authoritativeOperations = new Map<string, DrawingOperation>();
  private optimisticOperations = new Map<string, DrawingOperation>();
  private highestServerSequence: number | null = null;
  private missingServerSequences: readonly number[] = [];
  private destroyed = false;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    this.canvas.setPointerCapture?.(event.pointerId);
    this.startPointer(event.clientX, event.clientY, event.pointerId);
  };

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (this.pointerSession?.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.movePointer(event.clientX, event.clientY, event.pointerId);
  };

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerSession?.pointerId !== event.pointerId) {
      return;
    }
    event.preventDefault();
    this.endPointer(event.clientX, event.clientY, event.pointerId);
    this.canvas.releasePointerCapture?.(event.pointerId);
  };

  private readonly handlePointerCancel = (event: PointerEvent): void => {
    if (this.pointerSession?.pointerId !== event.pointerId) {
      return;
    }
    this.cancelPointer(event.pointerId);
  };

  constructor(canvas: HTMLCanvasElement, options: CanvasEngineOptions = {}) {
    const { context, previewContext } = contextsFor(
      canvas,
      options.previewCanvas,
    );
    this.canvas = canvas;
    this.previewCanvas = options.previewCanvas;
    this.context = context;
    this.previewContext = previewContext;
    this.onOperation = options.onOperation;
    this.onHistoryChange = options.onHistoryChange;
    this.idFactory = options.idFactory ?? defaultIdFactory;
    this.requestFrame = options.requestFrame ?? defaultRequestFrame;
    this.cancelFrame = options.cancelFrame ?? defaultCancelFrame;
    this.getDevicePixelRatio = options.getDevicePixelRatio ?? defaultDpr;
    this.backgroundColor = options.backgroundColor;
    this.tool = options.initialTool ?? "brush";
    this.color = normalizeColor(options.initialColor ?? DEFAULT_COLOR);
    this.size = normalizeSize(options.initialSize ?? DEFAULT_SIZE);
    this.shapeMode = options.initialShapeMode ?? "outline";
    this.turnId = options.turnId ?? "local";
    this.viewport = computeCanvasViewport(1, 1);

    if (options.bindPointerEvents !== false) {
      this.bindEvents();
    }
    this.resize();
  }

  get historyState(): CanvasHistoryState {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      actionCount: this.history.length,
    };
  }

  get currentViewport(): CanvasViewport {
    return this.viewport;
  }

  get currentTool(): DrawingTool {
    return this.tool;
  }

  get currentStyle(): DrawingStyle {
    return {
      color: this.color,
      size: this.size,
      shapeMode: this.shapeMode,
    };
  }

  get previewAction(): ShapeAction | null {
    const session = this.pointerSession;
    if (!session || session.tool === "brush" || session.tool === "eraser") {
      return null;
    }

    return {
      kind: "shape",
      id: session.actionId,
      shape: session.tool,
      color: session.style.color,
      size: session.style.size,
      shapeMode: session.style.shapeMode,
      start: session.start,
      end: session.current,
    };
  }

  get lastServerSequence(): number | null {
    return this.highestServerSequence;
  }

  get sequenceGaps(): readonly number[] {
    return this.missingServerSequences;
  }

  get pendingOperationCount(): number {
    return this.optimisticOperations.size;
  }

  get actions(): readonly CanvasAction[] {
    return this.history.current();
  }

  setTool(tool: DrawingTool): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = normalizeColor(color);
  }

  setSize(size: number): void {
    this.size = normalizeSize(size);
  }

  setShapeMode(shapeMode: ShapeMode): void {
    this.shapeMode = shapeMode;
  }

  setTurnId(turnId: string): void {
    if (turnId === this.turnId) {
      return;
    }
    this.resetTurn(turnId);
  }

  /**
   * Starts a clean turn even when the server reuses the same turn id for a
   * drawing reset. Unlike routine authoritative merges, a turn reset is
   * intentionally destructive and cancels the current pointer session.
   */
  resetTurn(turnId = this.turnId): void {
    this.cancelPointer();
    this.turnId = turnId;
    this.authoritativeOperations.clear();
    this.optimisticOperations.clear();
    this.highestServerSequence = null;
    this.missingServerSequences = [];
    this.history.reset();
    this.render();
    this.notifyHistory();
  }

  resize(options: ResizeOptions = {}): CanvasViewport {
    const rect = this.canvas.getBoundingClientRect();
    const cssWidth = options.cssWidth ?? rect.width ?? this.canvas.clientWidth;
    const cssHeight =
      options.cssHeight ?? rect.height ?? this.canvas.clientHeight;
    const devicePixelRatio =
      options.devicePixelRatio ?? this.getDevicePixelRatio();

    this.viewport = computeCanvasViewport(
      cssWidth || this.logicalWidth,
      cssHeight || this.logicalHeight,
      devicePixelRatio,
    );

    this.resizeCanvasBitmap(this.canvas);
    if (this.previewCanvas) {
      this.resizeCanvasBitmap(this.previewCanvas);
    }
    this.render();
    return this.viewport;
  }

  mapClientPoint(
    clientX: number,
    clientY: number,
    clampToCanvas = true,
  ): CanvasPoint {
    return mapClientPointToLogical(
      clientX,
      clientY,
      this.canvas.getBoundingClientRect(),
      clampToCanvas,
    );
  }

  startPointer(clientX: number, clientY: number, pointerId = 0): boolean {
    this.assertAlive();
    if (this.pointerSession) {
      return false;
    }

    this.syncDisplaySize();
    const point = this.mapClientPoint(clientX, clientY);
    this.pointerSession = {
      pointerId,
      actionId: this.idFactory(),
      tool: this.tool,
      style: this.currentStyle,
      start: point,
      points: [point],
      current: point,
      renderedPointCount: 0,
      emittedPointCount: 0,
      chunkId: 0,
    };

    if (this.tool === "brush" || this.tool === "eraser") {
      this.scheduleStrokeFlush();
    } else {
      this.renderShapePreview();
    }
    return true;
  }

  movePointer(clientX: number, clientY: number, pointerId = 0): boolean {
    const session = this.pointerSession;
    if (!session || session.pointerId !== pointerId) {
      return false;
    }

    const point = this.mapClientPoint(clientX, clientY);
    session.current = point;
    if (session.tool === "brush" || session.tool === "eraser") {
      if (!pointsEqual(session.points.at(-1), point)) {
        session.points.push(point);
      }
      this.scheduleStrokeFlush();
    } else {
      this.renderShapePreview();
    }
    return true;
  }

  endPointer(clientX: number, clientY: number, pointerId = 0): boolean {
    const session = this.pointerSession;
    if (!session || session.pointerId !== pointerId) {
      return false;
    }

    const point = this.mapClientPoint(clientX, clientY);
    session.current = point;

    if (session.tool === "brush" || session.tool === "eraser") {
      if (!pointsEqual(session.points.at(-1), point)) {
        session.points.push(point);
      }
      this.cancelScheduledFrame();
      this.flushStroke(true);
      const action: StrokeAction = {
        kind: "stroke",
        id: session.actionId,
        tool: session.tool,
        color: session.style.color,
        size: session.style.size,
        points: [...session.points],
      };
      this.pointerSession = null;
      this.history.commit(action);
      this.notifyHistory();
      return true;
    }

    const action = this.previewAction;
    this.pointerSession = null;
    this.clearShapePreview();
    if (!action) {
      return false;
    }

    this.history.commit(action);
    this.render();
    this.emitOperation({
      kind: "shape",
      id: action.id,
      turnId: this.turnId,
      strokeId: action.id,
      chunkId: 0,
      shape: action.shape,
      color: action.color,
      size: action.size,
      shapeMode: action.shapeMode,
      start: action.start,
      end: action.end,
    });
    this.notifyHistory();
    return true;
  }

  cancelPointer(pointerId?: number): boolean {
    const session = this.pointerSession;
    if (
      !session ||
      (pointerId !== undefined && session.pointerId !== pointerId)
    ) {
      return false;
    }

    this.cancelScheduledFrame();
    this.pointerSession = null;
    this.clearShapePreview();
    this.render();
    return true;
  }

  flushPending(): void {
    if (
      this.pointerSession?.tool === "brush" ||
      this.pointerSession?.tool === "eraser"
    ) {
      this.cancelScheduledFrame();
      this.flushStroke(false);
    }
  }

  clear(): void {
    this.cancelPointer();
    const actionId = this.idFactory();
    this.history.commit({ kind: "clear", id: actionId });
    this.render();
    this.emitOperation({
      kind: "clear",
      id: actionId,
      turnId: this.turnId,
      strokeId: actionId,
      chunkId: 0,
    });
    this.notifyHistory();
  }

  undo(): CanvasAction | null {
    this.cancelPointer();
    const action = this.history.undo();
    if (!action) {
      return null;
    }
    this.render();
    const operationId = this.idFactory();
    this.emitOperation({
      kind: "undo",
      id: operationId,
      turnId: this.turnId,
      strokeId: operationId,
      chunkId: 0,
      targetOpId: action.id,
    });
    this.notifyHistory();
    return action;
  }

  redo(): CanvasAction | null {
    this.cancelPointer();
    const action = this.history.redo();
    if (!action) {
      return null;
    }
    this.render();
    const operationId = this.idFactory();
    this.emitOperation({
      kind: "redo",
      id: operationId,
      turnId: this.turnId,
      strokeId: operationId,
      chunkId: 0,
      targetOpId: action.id,
    });
    this.notifyHistory();
    return action;
  }

  replaceAuthoritativeOperations(
    operations: readonly DrawingOperation[],
    turnId = this.turnId,
  ): void {
    this.recoverAuthoritativeOperations(operations, turnId);
  }

  /**
   * Applies a complete recovery payload. Callers should use
   * mergeAuthoritativeOperations for routine snapshots and live updates so
   * an active drawer stroke and queued optimistic actions remain intact.
   */
  recoverAuthoritativeOperations(
    operations: readonly DrawingOperation[],
    turnId = this.turnId,
  ): void {
    this.cancelPointer();
    this.turnId = turnId;
    this.authoritativeOperations = new Map();
    this.optimisticOperations.clear();
    for (const operation of operations) {
      if (
        operation.turnId === turnId &&
        !this.authoritativeOperations.has(operation.id)
      ) {
        this.authoritativeOperations.set(operation.id, operation);
      }
    }
    this.rebuildAuthoritativeScene();
  }

  mergeAuthoritativeOperations(
    operations: readonly DrawingOperation[],
  ): void {
    for (const operation of operations) {
      if (operation.turnId !== this.turnId) {
        continue;
      }
      this.authoritativeOperations.set(operation.id, operation);
      this.optimisticOperations.delete(operation.id);
    }

    if (this.pointerSession) {
      this.refreshAuthoritativeSequenceState();
      return;
    }
    this.rebuildAuthoritativeScene();
  }

  render(): void {
    renderActions(
      this.context,
      this.history.current(),
      this.viewport,
      this.backgroundColor,
    );

    const session = this.pointerSession;
    if (!session) {
      this.clearShapePreview();
      return;
    }

    if (session.tool === "brush" || session.tool === "eraser") {
      const pending: StrokeAction = {
        kind: "stroke",
        id: session.actionId,
        tool: session.tool,
        color: session.style.color,
        size: session.style.size,
        points: session.points,
      };
      drawStroke(this.context, pending);
      session.renderedPointCount = session.points.length;
    } else {
      this.renderShapePreview();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.cancelPointer();
    this.unbindEvents();
    this.destroyed = true;
  }

  private bindEvents(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.style.touchAction = "none";
  }

  private unbindEvents(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
  }

  private resizeCanvasBitmap(canvas: HTMLCanvasElement): void {
    if (canvas.width !== this.viewport.bitmapWidth) {
      canvas.width = this.viewport.bitmapWidth;
    }
    if (canvas.height !== this.viewport.bitmapHeight) {
      canvas.height = this.viewport.bitmapHeight;
    }
  }

  private syncDisplaySize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const expected = computeCanvasViewport(
      rect.width || this.logicalWidth,
      rect.height || this.logicalHeight,
      this.getDevicePixelRatio(),
    );
    if (
      expected.bitmapWidth !== this.viewport.bitmapWidth ||
      expected.bitmapHeight !== this.viewport.bitmapHeight ||
      expected.cssWidth !== this.viewport.cssWidth ||
      expected.cssHeight !== this.viewport.cssHeight
    ) {
      this.resize({
        cssWidth: expected.cssWidth,
        cssHeight: expected.cssHeight,
        devicePixelRatio: expected.devicePixelRatio,
      });
    }
  }

  private scheduleStrokeFlush(): void {
    if (this.frameHandle !== null) {
      return;
    }
    this.frameHandle = this.requestFrame(() => {
      this.frameHandle = null;
      this.flushStroke(false);
    });
  }

  private cancelScheduledFrame(): void {
    if (this.frameHandle === null) {
      return;
    }
    this.cancelFrame(this.frameHandle);
    this.frameHandle = null;
  }

  private flushStroke(isFinal: boolean): void {
    const session = this.pointerSession;
    if (
      !session ||
      (session.tool !== "brush" && session.tool !== "eraser")
    ) {
      return;
    }

    const renderStart = Math.max(0, session.renderedPointCount - 1);
    if (
      session.points.length > session.renderedPointCount ||
      session.renderedPointCount === 0
    ) {
      const renderAction: StrokeAction = {
        kind: "stroke",
        id: session.actionId,
        tool: session.tool,
        color: session.style.color,
        size: session.style.size,
        points: session.points,
      };
      drawStroke(this.context, renderAction, renderStart);
      session.renderedPointCount = session.points.length;
    }

    const hasNewPoints = session.points.length > session.emittedPointCount;
    if (!hasNewPoints) {
      return;
    }

    let emissionStart =
      session.emittedPointCount === 0
        ? 0
        : Math.max(0, session.emittedPointCount - 1);
    while (emissionStart < session.points.length) {
      const emissionEnd = Math.min(
        session.points.length,
        emissionStart + MAX_POINTS_PER_OPERATION,
      );
      const points = session.points.slice(emissionStart, emissionEnd);
      const reachesEnd = emissionEnd === session.points.length;

      this.emitOperation({
        kind: "stroke",
        id:
          session.chunkId === 0
            ? session.actionId
            : `${session.actionId}:${session.chunkId}`,
        turnId: this.turnId,
        strokeId: session.actionId,
        chunkId: session.chunkId,
        tool: session.tool,
        color: session.style.color,
        size: session.style.size,
        points,
        isFinal: isFinal && reachesEnd,
      });
      session.emittedPointCount = emissionEnd;
      session.chunkId += 1;

      if (reachesEnd) {
        break;
      }
      // Keep one point of overlap so independently delivered chunks connect.
      emissionStart = emissionEnd - 1;
    }
  }

  private renderShapePreview(): void {
    const preview = this.previewAction;
    if (!preview) {
      return;
    }

    if (this.previewContext) {
      clearPreview(this.previewContext, this.viewport);
      drawShape(this.previewContext, preview);
      return;
    }

    renderActions(
      this.context,
      this.history.current(),
      this.viewport,
      this.backgroundColor,
    );
    drawShape(this.context, preview);
  }

  private clearShapePreview(): void {
    if (this.previewContext) {
      clearPreview(this.previewContext, this.viewport);
    }
  }

  private emitOperation(operation: DrawingOperation): void {
    this.optimisticOperations.set(operation.id, operation);
    this.onOperation?.(operation);
  }

  private notifyHistory(): void {
    this.onHistoryChange?.(this.historyState);
  }

  private rebuildAuthoritativeScene(): void {
    const replayed = replayDrawingOperations(
      [
        ...this.authoritativeOperations.values(),
        ...this.optimisticOperations.values(),
      ],
      this.turnId,
    );
    this.history.replace(replayed.actions, replayed.redoActions);
    this.refreshAuthoritativeSequenceState();
    this.render();
    this.notifyHistory();
  }

  private refreshAuthoritativeSequenceState(): void {
    const replayed = replayDrawingOperations(
      [...this.authoritativeOperations.values()],
      this.turnId,
    );
    this.highestServerSequence = replayed.highestServerSequence;
    this.missingServerSequences = replayed.missingServerSequences;
  }

  private assertAlive(): void {
    if (this.destroyed) {
      throw new Error("CanvasEngine has been destroyed.");
    }
  }
}
