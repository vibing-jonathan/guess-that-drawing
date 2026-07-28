import {
  LOGICAL_CANVAS_HEIGHT,
  LOGICAL_CANVAS_WIDTH,
  type CanvasClientRect,
  type CanvasPoint,
  type CanvasViewport,
} from "./types";

const MIN_DISPLAY_DIMENSION = 1;

function finitePositive(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeCanvasViewport(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
): CanvasViewport {
  const safeWidth = finitePositive(cssWidth, MIN_DISPLAY_DIMENSION);
  const safeHeight = finitePositive(cssHeight, MIN_DISPLAY_DIMENSION);
  const safeDpr = finitePositive(devicePixelRatio, 1);
  const scale = Math.min(
    safeWidth / LOGICAL_CANVAS_WIDTH,
    safeHeight / LOGICAL_CANVAS_HEIGHT,
  );
  const contentWidth = LOGICAL_CANVAS_WIDTH * scale;
  const contentHeight = LOGICAL_CANVAS_HEIGHT * scale;

  return {
    cssWidth: safeWidth,
    cssHeight: safeHeight,
    devicePixelRatio: safeDpr,
    bitmapWidth: Math.max(1, Math.round(safeWidth * safeDpr)),
    bitmapHeight: Math.max(1, Math.round(safeHeight * safeDpr)),
    scale,
    offsetX: (safeWidth - contentWidth) / 2,
    offsetY: (safeHeight - contentHeight) / 2,
    contentWidth,
    contentHeight,
  };
}

export function mapClientPointToLogical(
  clientX: number,
  clientY: number,
  rect: CanvasClientRect,
  clampToCanvas = true,
): CanvasPoint {
  const viewport = computeCanvasViewport(rect.width, rect.height);
  const x = (clientX - rect.left - viewport.offsetX) / viewport.scale;
  const y = (clientY - rect.top - viewport.offsetY) / viewport.scale;

  if (!clampToCanvas) {
    return { x, y };
  }

  return {
    x: clamp(x, 0, LOGICAL_CANVAS_WIDTH),
    y: clamp(y, 0, LOGICAL_CANVAS_HEIGHT),
  };
}

export function pointsEqual(
  first: CanvasPoint | undefined,
  second: CanvasPoint | undefined,
): boolean {
  return first?.x === second?.x && first?.y === second?.y;
}
