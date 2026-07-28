import { RoomRealtimeController } from "./controller";
import type { DrawingEnvelope, PlayerRoomSnapshot } from "@gtd/contracts";
import {
  clearRoomSession,
  loadRoomSession,
  saveRoomSession,
} from "../data/local-profile";
import { roomStore } from "../state/room-store";

export interface DrawingRuntimeSubscriber {
  onSnapshot?: (snapshot: PlayerRoomSnapshot) => void;
  onEnvelopes?: (
    envelopes: readonly DrawingEnvelope[],
    source: "live" | "replay" | "snapshot",
  ) => void;
  onReset?: (turnId: string, throughSequence: number) => void;
}

const drawingSubscribers = new Set<DrawingRuntimeSubscriber>();

export function subscribeToDrawingRuntime(
  subscriber: DrawingRuntimeSubscriber,
): () => void {
  drawingSubscribers.add(subscriber);
  return () => drawingSubscribers.delete(subscriber);
}

export const roomController = new RoomRealtimeController({
  store: roomStore,
  persistence: {
    load: (roomCode) => loadRoomSession(roomCode),
    save: ({ roomCode, credentials }) =>
      saveRoomSession(roomCode, credentials),
    clear: (roomCode) => clearRoomSession(roomCode),
  },
  onSnapshot: (snapshot) => {
    for (const subscriber of drawingSubscribers) {
      subscriber.onSnapshot?.(snapshot);
    }
  },
  onDrawingEnvelopes: (envelopes, source) => {
    for (const subscriber of drawingSubscribers) {
      subscriber.onEnvelopes?.(envelopes, source);
    }
  },
  onDrawingReset: (turnId, throughSequence) => {
    for (const subscriber of drawingSubscribers) {
      subscriber.onReset?.(turnId, throughSequence);
    }
  },
});
