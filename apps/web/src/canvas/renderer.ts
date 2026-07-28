import {
  LOGICAL_CANVAS_HEIGHT,
  LOGICAL_CANVAS_WIDTH,
  type CanvasAction,
  type CanvasPoint,
  type CanvasViewport,
  type ShapeAction,
  type StrokeAction,
} from "./types";

function resetBitmap(context: CanvasRenderingContext2D): void {
  context.save();
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.restore();
}

export function applyLogicalTransform(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
): void {
  const scale = viewport.scale * viewport.devicePixelRatio;
  context.setTransform(
    scale,
    0,
    0,
    scale,
    viewport.offsetX * viewport.devicePixelRatio,
    viewport.offsetY * viewport.devicePixelRatio,
  );
}

function clearLogicalCanvas(
  context: CanvasRenderingContext2D,
  backgroundColor?: string,
): void {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.clearRect(
    0,
    0,
    LOGICAL_CANVAS_WIDTH,
    LOGICAL_CANVAS_HEIGHT,
  );
  if (backgroundColor !== undefined) {
    context.fillStyle = backgroundColor;
    context.fillRect(
      0,
      0,
      LOGICAL_CANVAS_WIDTH,
      LOGICAL_CANVAS_HEIGHT,
    );
  }
  context.restore();
}

function drawDot(
  context: CanvasRenderingContext2D,
  point: CanvasPoint,
  radius: number,
): void {
  context.beginPath();
  context.arc(point.x, point.y, Math.max(0.5, radius), 0, Math.PI * 2);
  context.fill();
}

export function drawStroke(
  context: CanvasRenderingContext2D,
  action: StrokeAction,
  fromPointIndex = 0,
): void {
  if (action.points.length === 0) {
    return;
  }

  context.save();
  context.globalCompositeOperation =
    action.tool === "eraser" ? "destination-out" : "source-over";
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = action.size;
  context.lineCap = "round";
  context.lineJoin = "round";

  const safeStart = Math.max(0, Math.min(fromPointIndex, action.points.length - 1));
  const points = action.points.slice(safeStart);
  if (points.length === 1) {
    const point = points[0];
    if (point) {
      drawDot(context, point, action.size / 2);
    }
    context.restore();
    return;
  }

  const first = points[0];
  if (!first) {
    context.restore();
    return;
  }
  context.beginPath();
  context.moveTo(first.x, first.y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
  context.restore();
}

export function drawShape(
  context: CanvasRenderingContext2D,
  action: ShapeAction,
): void {
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = action.color;
  context.fillStyle = action.color;
  context.lineWidth = action.size;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();

  const width = action.end.x - action.start.x;
  const height = action.end.y - action.start.y;

  switch (action.shape) {
    case "line":
      context.moveTo(action.start.x, action.start.y);
      context.lineTo(action.end.x, action.end.y);
      context.stroke();
      context.restore();
      return;
    case "rectangle":
      context.rect(action.start.x, action.start.y, width, height);
      break;
    case "ellipse":
      context.ellipse(
        action.start.x + width / 2,
        action.start.y + height / 2,
        Math.abs(width / 2),
        Math.abs(height / 2),
        0,
        0,
        Math.PI * 2,
      );
      break;
  }

  if (action.shapeMode === "fill") {
    context.fill();
  } else {
    context.stroke();
  }
  context.restore();
}

export function drawAction(
  context: CanvasRenderingContext2D,
  action: CanvasAction,
  backgroundColor?: string,
): void {
  switch (action.kind) {
    case "stroke":
      drawStroke(context, action);
      break;
    case "shape":
      drawShape(context, action);
      break;
    case "clear":
      clearLogicalCanvas(context, backgroundColor);
      break;
  }
}

export function renderActions(
  context: CanvasRenderingContext2D,
  actions: readonly CanvasAction[],
  viewport: CanvasViewport,
  backgroundColor?: string,
): void {
  resetBitmap(context);
  applyLogicalTransform(context, viewport);
  clearLogicalCanvas(context, backgroundColor);

  context.save();
  context.beginPath();
  context.rect(0, 0, LOGICAL_CANVAS_WIDTH, LOGICAL_CANVAS_HEIGHT);
  context.clip();
  for (const action of actions) {
    drawAction(context, action, backgroundColor);
  }
  context.restore();
}

export function clearPreview(
  context: CanvasRenderingContext2D,
  viewport: CanvasViewport,
): void {
  resetBitmap(context);
  applyLogicalTransform(context, viewport);
}
