import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  playGameSound: vi.fn(),
}));

vi.mock("./game-audio", () => ({
  isGameSoundEnabled: () => true,
  playGameSound: audio.playGameSound,
  setGameSoundEnabled: vi.fn(),
  subscribeGameSound: () => () => undefined,
  unlockGameAudio: vi.fn().mockResolvedValue(true),
}));

import {
  makeEstablished,
  makePlayer,
  makeSnapshot,
} from "../state/__tests__/fixtures";
import { roomStore } from "../state/room-store";
import { GameFeel } from "./game-feel";

afterEach(() => {
  cleanup();
  roomStore.getState().reset();
  audio.playGameSound.mockClear();
});

describe("GameFeel", () => {
  it("celebrates a room that was created successfully", () => {
    render(<GameFeel />);

    act(() => roomStore.getState().setSessionStatus("creating"));
    act(() => {
      roomStore
        .getState()
        .establishSession(makeEstablished(makeSnapshot({ phase: "lobby" })));
    });

    expect(audio.playGameSound).toHaveBeenCalledWith("roomReady");
    expect(screen.getByText("Room ready!")).toBeInTheDocument();
  });

  it("announces players joining and disconnecting", () => {
    roomStore
      .getState()
      .establishSession(makeEstablished(makeSnapshot({ phase: "lobby" })));
    render(<GameFeel />);

    act(() => {
      roomStore.getState().applyPlayerJoined({
        revision: 2,
        player: makePlayer("player-3", {
          name: "Priya",
          joinOrder: 2,
          isHost: false,
        }),
      });
    });

    expect(audio.playGameSound).toHaveBeenCalledWith("join");
    expect(screen.getByText("Priya joined!")).toBeInTheDocument();

    act(() => {
      roomStore.getState().applyPlayerLeft({
        revision: 3,
        playerId: "player-3",
        reason: "disconnected",
        reconnectDeadline: 50_000,
      });
    });

    expect(audio.playGameSound).toHaveBeenCalledWith("leave");
    expect(screen.getByText("Priya dropped out")).toBeInTheDocument();
  });

  it("gives a close guess its own cue and moment", () => {
    roomStore.getState().establishSession(makeEstablished(makeSnapshot()));
    render(<GameFeel />);

    act(() => {
      roomStore.getState().applyGuessFeedback({
        revision: 2,
        feedbackId: "feedback-1",
        feedback: {
          kind: "close",
          turnId: "turn-1",
          message: "One letter away.",
          scoreDelta: 0,
          placement: null,
        },
      });
    });

    expect(audio.playGameSound).toHaveBeenCalledWith("close");
    expect(screen.getByText("So close!")).toBeInTheDocument();
  });
});
