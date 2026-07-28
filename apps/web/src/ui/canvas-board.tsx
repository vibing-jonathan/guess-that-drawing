import type { DrawingEnvelope, DrawingOp } from "@gtd/contracts";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  CanvasDrawingTransport,
  CanvasEngine,
  fromContractDrawingEnvelope,
  toContractDrawingOp,
  type CanvasHistoryState,
  type DrawingTool,
  type ShapeMode,
} from "../canvas";
import {
  roomController,
  subscribeToDrawingRuntime,
} from "../realtime/runtime";
import { Banner, Button, Icon, IconButton } from "./primitives";

const COLORS = [
  ["#1F2937", "Ink"],
  ["#1D4ED8", "Cobalt blue"],
  ["#D85272", "Coral red"],
  ["#168278", "Teal green"],
  ["#F5BE24", "Pencil yellow"],
] as const;

const TOOLS: readonly [DrawingTool, "brush" | "eraser" | "line" | "rectangle" | "ellipse", string][] =
  [
    ["brush", "brush", "Brush"],
    ["eraser", "eraser", "Eraser"],
    ["line", "line", "Line"],
    ["rectangle", "rectangle", "Rectangle"],
    ["ellipse", "ellipse", "Ellipse"],
  ];

export function CanvasBoard({
  turnId,
  editable,
  disabled,
  initialOperations,
}: {
  turnId: string;
  editable: boolean;
  disabled: boolean;
  initialOperations: readonly DrawingEnvelope[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<CanvasEngine | null>(null);
  const [tool, setTool] = useState<DrawingTool>("brush");
  const [color, setColor] = useState("#1F2937");
  const [size, setSize] = useState(12);
  const [shapeMode, setShapeMode] = useState<ShapeMode>("outline");
  const [history, setHistory] = useState<CanvasHistoryState>({
    canUndo: false,
    canRedo: false,
    actionCount: 0,
  });
  const [transportError, setTransportError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const previewCanvas = previewRef.current;
    if (!canvas || !previewCanvas) return;
    const transport = new CanvasDrawingTransport({
      send: (operation) =>
        roomController.sendDrawingBatch({
          turnId: operation.turnId,
          strokeId: operation.strokeId,
          chunkId: operation.chunkId,
          operations: [
            toContractDrawingOp(operation) as DrawingOp,
          ],
        }),
      recover: () => roomController.requestSnapshot(),
      onError: setTransportError,
    });
    const requestThirtyHertzFrame = (callback: FrameRequestCallback) =>
      window.setTimeout(() => callback(performance.now()), 34);
    const cancelThirtyHertzFrame = (
      handle: number | ReturnType<typeof globalThis.setTimeout>,
    ) => window.clearTimeout(handle);
    const engine = new CanvasEngine(canvas, {
      previewCanvas,
      turnId,
      bindPointerEvents: editable && !disabled,
      initialTool: tool,
      initialColor: color,
      initialSize: size,
      initialShapeMode: shapeMode,
      requestFrame: requestThirtyHertzFrame,
      cancelFrame: cancelThirtyHertzFrame,
      onOperation: (operation) => transport.enqueue(operation),
      onHistoryChange: setHistory,
    });
    engineRef.current = engine;
    if (initialOperations.length) {
      engine.replaceAuthoritativeOperations(
        initialOperations.map(fromContractDrawingEnvelope),
        turnId,
      );
    }
    const unsubscribe = subscribeToDrawingRuntime({
      onEnvelopes: (envelopes) => {
        const relevant = envelopes
          .filter((envelope) => envelope.turnId === turnId)
          .map(fromContractDrawingEnvelope);
        if (relevant.length) {
          // Live events, replay fragments, and ordinary room snapshots are
          // append-only synchronization. A destructive replacement here
          // would cancel the drawer's active pointer and discard operations
          // that are still inside the bounded transport window.
          engine.mergeAuthoritativeOperations(relevant);
        }
      },
      onReset: (resetTurnId) => {
        if (resetTurnId === turnId) {
          engine.resetTurn(turnId);
        }
      },
    });
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(() => engine.resize());
    observer?.observe(canvas);
    return () => {
      unsubscribe();
      observer?.disconnect();
      transport.stop();
      engine.destroy();
      engineRef.current = null;
    };
    // A new turn/permission state intentionally creates a fresh imperative
    // engine and event binding; tool values are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [disabled, editable, turnId]);

  useEffect(() => engineRef.current?.setTool(tool), [tool]);
  useEffect(() => engineRef.current?.setColor(color), [color]);
  useEffect(() => engineRef.current?.setSize(size), [size]);
  useEffect(
    () => engineRef.current?.setShapeMode(shapeMode),
    [shapeMode],
  );

  return (
    <>
      {transportError ? (
        <Banner
          tone="warning"
          icon="wifiOff"
          title="Some strokes needed a resync"
          role="alert"
        >
          {transportError}
        </Banner>
      ) : null}
      <figure
        className={`drawing-canvas ${disabled ? "drawing-canvas--dimmed" : ""}`}
        aria-label={
          editable
            ? "Drawing canvas. Use the drawing toolbar, then draw with a pointer or touch."
            : "Live room drawing canvas."
        }
      >
        <div className="canvas-stack">
          <canvas
            ref={canvasRef}
            className="canvas-stack__main"
            data-testid="drawing-canvas-main"
            aria-label={editable ? "Editable drawing surface" : "Live drawing"}
          />
          <canvas
            ref={previewRef}
            className="canvas-stack__preview"
            data-testid="drawing-canvas-preview"
            aria-hidden="true"
          />
        </div>
        <figcaption className="sr-only">
          The canvas uses a fixed 1600 by 1200 coordinate space and scales to
          the available viewport.
        </figcaption>
      </figure>
      {editable ? (
        <section
          className="drawing-tools"
          aria-labelledby="drawing-tools-title"
        >
          <div className="drawing-tools__title">
            <strong id="drawing-tools-title">Drawing tools</strong>
            <span className="muted">1600 × 1200 canvas</span>
          </div>
          <div
            className="tool-row tool-row--primary"
            role="toolbar"
            aria-label="Drawing tool selection"
          >
            {TOOLS.map(([value, icon, label]) => (
              <IconButton
                key={value}
                icon={icon}
                label={label}
                selected={tool === value}
                disabled={disabled}
                onClick={() => setTool(value)}
              />
            ))}
          </div>
          <div
            className="tool-row tool-row--mode"
            role="group"
            aria-label="Outline or fill"
          >
            {(["outline", "fill"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                className={`tool-choice ${shapeMode === mode ? "is-selected" : ""}`}
                aria-pressed={shapeMode === mode}
                disabled={disabled}
                onClick={() => setShapeMode(mode)}
              >
                <Icon
                  name={mode === "outline" ? "rectangle" : "circle"}
                  size={20}
                />
                {mode === "outline" ? "Outline" : "Fill"}
              </button>
            ))}
          </div>
          <fieldset className="swatch-fieldset" disabled={disabled}>
            <legend>Stroke color</legend>
            <div
              className="swatch-row"
              role="radiogroup"
              aria-label="Stroke color"
            >
              {COLORS.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  className={`swatch ${color === value ? "is-selected" : ""}`}
                  style={{ "--swatch": value } as CSSProperties}
                  role="radio"
                  aria-checked={color === value}
                  aria-label={label}
                  onClick={() => setColor(value)}
                >
                  {color === value ? <Icon name="check" size={18} /> : null}
                </button>
              ))}
              <label className="custom-color">
                <span className="sr-only">Custom stroke color</span>
                <Icon name="palette" size={20} />
                <input
                  type="color"
                  value={color}
                  disabled={disabled}
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
            </div>
          </fieldset>
          <label className="size-control">
            <span>
              Brush size <strong className="numeric">{size}px</strong>
            </span>
            <input
              type="range"
              min={1}
              max={80}
              value={size}
              disabled={disabled}
              onChange={(event) => setSize(Number(event.target.value))}
            />
          </label>
          <div
            className="tool-row tool-row--history"
            role="toolbar"
            aria-label="Drawing history"
          >
            <IconButton
              icon="undo"
              label="Undo last drawing action"
              disabled={disabled || !history.canUndo}
              onClick={() => engineRef.current?.undo()}
            />
            <IconButton
              icon="redo"
              label="Redo drawing action"
              disabled={disabled || !history.canRedo}
              onClick={() => engineRef.current?.redo()}
            />
            <Button
              variant="danger-quiet"
              icon="trash"
              aria-label="Clear canvas"
              disabled={disabled || history.actionCount === 0}
              onClick={() => engineRef.current?.clear()}
            >
              Clear
            </Button>
          </div>
        </section>
      ) : null}
    </>
  );
}
