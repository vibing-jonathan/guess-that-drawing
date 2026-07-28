import { vi, type Mock } from "vitest";

export interface MockContext extends CanvasRenderingContext2D {
  readonly calls: string[];
}

export interface MockCanvas extends HTMLCanvasElement {
  readonly context: MockContext;
  setRect(width: number, height: number, left?: number, top?: number): void;
}

export function createMockCanvas(
  initialWidth = 800,
  initialHeight = 600,
): MockCanvas {
  let rect = {
    left: 0,
    top: 0,
    width: initialWidth,
    height: initialHeight,
  };
  const calls: string[] = [];
  const record = (name: string): Mock =>
    vi.fn((...args: unknown[]) => {
      calls.push(`${name}:${args.join(",")}`);
    });

  const context = {
    calls,
    save: record("save"),
    restore: record("restore"),
    setTransform: record("setTransform"),
    clearRect: record("clearRect"),
    fillRect: record("fillRect"),
    beginPath: record("beginPath"),
    closePath: record("closePath"),
    moveTo: record("moveTo"),
    lineTo: record("lineTo"),
    stroke: record("stroke"),
    fill: record("fill"),
    arc: record("arc"),
    rect: record("rect"),
    ellipse: record("ellipse"),
    clip: record("clip"),
    globalCompositeOperation: "source-over",
    strokeStyle: "#000000",
    fillStyle: "#000000",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
  } as unknown as MockContext;

  const canvas = {
    width: initialWidth,
    height: initialHeight,
    clientWidth: initialWidth,
    clientHeight: initialHeight,
    style: {},
    context,
    getContext: vi.fn((kind: string) => (kind === "2d" ? context : null)),
    getBoundingClientRect: vi.fn(() => ({
      ...rect,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      x: rect.left,
      y: rect.top,
      toJSON: () => ({}),
    })),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    setRect(width: number, height: number, left = 0, top = 0) {
      rect = { width, height, left, top };
      Object.assign(this, {
        clientWidth: width,
        clientHeight: height,
      });
    },
  } as unknown as MockCanvas;

  Object.assign(context, { canvas });
  return canvas;
}
