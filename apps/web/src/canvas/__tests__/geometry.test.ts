import { describe, expect, it } from "vitest";

import {
  computeCanvasViewport,
  mapClientPointToLogical,
} from "../geometry";

describe("canvas coordinate transforms", () => {
  it("letterboxes a fixed 1600x1200 surface and accounts for DPR", () => {
    const viewport = computeCanvasViewport(1000, 1000, 2);

    expect(viewport).toMatchObject({
      cssWidth: 1000,
      cssHeight: 1000,
      bitmapWidth: 2000,
      bitmapHeight: 2000,
      scale: 0.625,
      offsetX: 0,
      offsetY: 125,
      contentWidth: 1000,
      contentHeight: 750,
    });
  });

  it("maps client coordinates into logical coordinates and clamps gutters", () => {
    const rect = { left: 20, top: 30, width: 1000, height: 1000 };

    expect(mapClientPointToLogical(520, 530, rect)).toEqual({
      x: 800,
      y: 600,
    });
    expect(mapClientPointToLogical(520, 40, rect)).toEqual({
      x: 800,
      y: 0,
    });
    expect(mapClientPointToLogical(520, 40, rect, false).y).toBe(-184);
  });

  it("keeps a logical point stable across responsive orientation changes", () => {
    const logicalPoint = { x: 431, y: 877 };
    const displays = [
      { left: 0, top: 0, width: 800, height: 600 },
      { left: 13, top: 27, width: 390, height: 844 },
      { left: 8, top: 12, width: 1024, height: 500 },
    ];

    for (const rect of displays) {
      const viewport = computeCanvasViewport(rect.width, rect.height);
      const clientX =
        rect.left + viewport.offsetX + logicalPoint.x * viewport.scale;
      const clientY =
        rect.top + viewport.offsetY + logicalPoint.y * viewport.scale;

      const mapped = mapClientPointToLogical(clientX, clientY, rect);
      expect(mapped.x).toBeCloseTo(logicalPoint.x, 8);
      expect(mapped.y).toBeCloseTo(logicalPoint.y, 8);
    }
  });
});
