import type { CanvasAction } from "./types";

export class ActionHistory {
  private actions: CanvasAction[] = [];
  private redoActions: CanvasAction[] = [];

  get canUndo(): boolean {
    return this.actions.length > 0;
  }

  get canRedo(): boolean {
    return this.redoActions.length > 0;
  }

  get length(): number {
    return this.actions.length;
  }

  current(): readonly CanvasAction[] {
    return this.actions;
  }

  redoStack(): readonly CanvasAction[] {
    return this.redoActions;
  }

  commit(action: CanvasAction): void {
    this.actions.push(action);
    this.redoActions = [];
  }

  undo(): CanvasAction | null {
    const action = this.actions.pop();
    if (!action) {
      return null;
    }

    this.redoActions.push(action);
    return action;
  }

  redo(): CanvasAction | null {
    const action = this.redoActions.pop();
    if (!action) {
      return null;
    }

    this.actions.push(action);
    return action;
  }

  replace(
    actions: readonly CanvasAction[],
    redoActions: readonly CanvasAction[] = [],
  ): void {
    this.actions = [...actions];
    this.redoActions = [...redoActions];
  }

  reset(): void {
    this.actions = [];
    this.redoActions = [];
  }
}
