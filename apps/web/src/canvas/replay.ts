import { pointsEqual } from "./geometry";
import type {
  CanvasAction,
  CanvasPoint,
  DrawingOperation,
  ReplayResult,
  StrokeAction,
} from "./types";

interface IndexedOperation {
  readonly operation: DrawingOperation;
  readonly inputIndex: number;
}

export function sortDrawingOperations(
  operations: readonly DrawingOperation[],
): readonly DrawingOperation[] {
  return operations
    .map((operation, inputIndex): IndexedOperation => ({
      operation,
      inputIndex,
    }))
    .sort((first, second) => {
      const firstSequence = first.operation.serverSequence;
      const secondSequence = second.operation.serverSequence;

      if (firstSequence !== undefined && secondSequence !== undefined) {
        return (
          firstSequence - secondSequence ||
          first.operation.id.localeCompare(second.operation.id)
        );
      }
      if (firstSequence !== undefined) {
        return -1;
      }
      if (secondSequence !== undefined) {
        return 1;
      }

      const strokeComparison = first.operation.strokeId.localeCompare(
        second.operation.strokeId,
      );
      if (
        strokeComparison !== 0 &&
        first.operation.kind === "stroke" &&
        second.operation.kind === "stroke"
      ) {
        return first.inputIndex - second.inputIndex;
      }

      if (
        first.operation.kind === "stroke" &&
        second.operation.kind === "stroke" &&
        first.operation.strokeId === second.operation.strokeId
      ) {
        return (
          first.operation.chunkId - second.operation.chunkId ||
          first.inputIndex - second.inputIndex
        );
      }

      return first.inputIndex - second.inputIndex;
    })
    .map(({ operation }) => operation);
}

function appendUniquePoints(
  existing: readonly CanvasPoint[],
  incoming: readonly CanvasPoint[],
): readonly CanvasPoint[] {
  if (existing.length === 0) {
    return [...incoming];
  }
  if (incoming.length === 0) {
    return existing;
  }

  const startIndex = pointsEqual(existing.at(-1), incoming[0]) ? 1 : 0;
  return [...existing, ...incoming.slice(startIndex)];
}

function removeAction(
  actions: CanvasAction[],
  targetId: string,
): CanvasAction | null {
  let index = -1;
  for (let candidate = actions.length - 1; candidate >= 0; candidate -= 1) {
    if (actions[candidate]?.id === targetId) {
      index = candidate;
      break;
    }
  }
  if (index < 0) {
    return null;
  }

  return actions.splice(index, 1)[0] ?? null;
}

export function findMissingServerSequences(
  operations: readonly DrawingOperation[],
): readonly number[] {
  const sequences = [
    ...new Set(
      operations.flatMap((operation) =>
        operation.serverSequence === undefined
          ? []
          : [operation.serverSequence],
      ),
    ),
  ].sort((first, second) => first - second);

  if (sequences.length < 2) {
    return [];
  }

  const missing: number[] = [];
  const first = sequences[0];
  const last = sequences.at(-1);
  if (first === undefined || last === undefined) {
    return missing;
  }

  const present = new Set(sequences);
  for (let sequence = first; sequence <= last; sequence += 1) {
    if (!present.has(sequence)) {
      missing.push(sequence);
    }
  }

  return missing;
}

export function replayDrawingOperations(
  operations: readonly DrawingOperation[],
  turnId?: string,
): ReplayResult {
  const filtered =
    turnId === undefined
      ? operations
      : operations.filter((operation) => operation.turnId === turnId);
  const unique = new Map<string, DrawingOperation>();
  for (const operation of filtered) {
    if (!unique.has(operation.id)) {
      unique.set(operation.id, operation);
    }
  }

  const ordered = sortDrawingOperations([...unique.values()]);
  const actions: CanvasAction[] = [];
  const redoActions: CanvasAction[] = [];
  const actionById = new Map<string, CanvasAction>();
  const operationToActionId = new Map<string, string>();

  for (const operation of ordered) {
    switch (operation.kind) {
      case "stroke": {
        operationToActionId.set(operation.id, operation.strokeId);
        const existing = actionById.get(operation.strokeId);
        if (existing?.kind === "stroke") {
          const merged: StrokeAction = {
            ...existing,
            points: appendUniquePoints(existing.points, operation.points),
          };
          actionById.set(operation.strokeId, merged);
          const activeIndex = actions.findIndex(
            (action) => action.id === operation.strokeId,
          );
          if (activeIndex >= 0) {
            actions[activeIndex] = merged;
          }
          const redoIndex = redoActions.findIndex(
            (action) => action.id === operation.strokeId,
          );
          if (redoIndex >= 0) {
            redoActions[redoIndex] = merged;
          }
          break;
        }

        const stroke: StrokeAction = {
          kind: "stroke",
          id: operation.strokeId,
          tool: operation.tool,
          color: operation.color,
          size: operation.size,
          points: [...operation.points],
        };
        actionById.set(operation.strokeId, stroke);
        actions.push(stroke);
        redoActions.length = 0;
        break;
      }

      case "shape": {
        operationToActionId.set(operation.id, operation.strokeId);
        if (actionById.has(operation.strokeId)) {
          break;
        }
        const shape: CanvasAction = {
          kind: "shape",
          id: operation.strokeId,
          shape: operation.shape,
          color: operation.color,
          size: operation.size,
          shapeMode: operation.shapeMode,
          start: operation.start,
          end: operation.end,
        };
        actionById.set(operation.strokeId, shape);
        actions.push(shape);
        redoActions.length = 0;
        break;
      }

      case "clear": {
        operationToActionId.set(operation.id, operation.strokeId);
        if (actionById.has(operation.strokeId)) {
          break;
        }
        const clear: CanvasAction = {
          kind: "clear",
          id: operation.strokeId,
        };
        actionById.set(operation.strokeId, clear);
        actions.push(clear);
        redoActions.length = 0;
        break;
      }

      case "undo": {
        const targetActionId =
          operationToActionId.get(operation.targetOpId) ??
          operation.targetOpId;
        const undone = removeAction(actions, targetActionId);
        if (undone) {
          redoActions.push(undone);
        }
        break;
      }

      case "redo": {
        const targetActionId =
          operationToActionId.get(operation.targetOpId) ??
          operation.targetOpId;
        const redone = removeAction(redoActions, targetActionId);
        if (redone) {
          actions.push(redone);
        }
        break;
      }
    }
  }

  const serverSequences = ordered.flatMap((operation) =>
    operation.serverSequence === undefined ? [] : [operation.serverSequence],
  );

  return {
    actions,
    redoActions,
    highestServerSequence:
      serverSequences.length === 0 ? null : Math.max(...serverSequences),
    missingServerSequences: findMissingServerSequences(ordered),
  };
}
