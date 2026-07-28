import { describe, expect, it } from "vitest";

import { ActionHistory } from "../history";
import type { CanvasAction } from "../types";

const stroke: CanvasAction = {
  kind: "stroke",
  id: "stroke-1",
  tool: "brush",
  color: "#123456",
  size: 8,
  points: [{ x: 10, y: 20 }],
};

const clear: CanvasAction = {
  kind: "clear",
  id: "clear-1",
};

describe("ActionHistory", () => {
  it("supports undoing and redoing a clear as a normal action", () => {
    const history = new ActionHistory();
    history.commit(stroke);
    history.commit(clear);

    expect(history.current()).toEqual([stroke, clear]);
    expect(history.undo()).toBe(clear);
    expect(history.current()).toEqual([stroke]);
    expect(history.redo()).toBe(clear);
    expect(history.current()).toEqual([stroke, clear]);
  });

  it("invalidates redo after a new local action", () => {
    const history = new ActionHistory();
    history.commit(stroke);
    history.undo();
    history.commit(clear);

    expect(history.canRedo).toBe(false);
    expect(history.current()).toEqual([clear]);
  });
});
