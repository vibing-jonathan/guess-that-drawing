import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { roomStore } from "../state/room-store";
import { makeEstablished, makeSnapshot } from "../state/__tests__/fixtures";
import { ChatPanel, useCountdown } from "./game-components";

describe("ChatPanel", () => {
  afterEach(() => {
    roomStore.getState().reset();
  });

  it("subscribes to correct guesses without creating an unstable store snapshot", () => {
    const room = makeSnapshot();
    roomStore.getState().establishSession(makeEstablished(room));

    render(<ChatPanel room={room} isDrawer={false} />);

    act(() => {
      roomStore.getState().applyCorrectGuess({
        revision: 2,
        guess: {
          turnId: "turn-1",
          playerId: "player-1",
          playerName: "Maya",
          placement: 1,
          guessedAt: 12_000,
        },
      });
    });

    expect(screen.getByText("Maya")).toBeInTheDocument();
    expect(screen.getByText("guessed the word.")).toBeInTheDocument();
  });
});

describe("useCountdown", () => {
  afterEach(() => {
    roomStore.getState().reset();
    vi.useRealTimers();
  });

  it("uses the synchronized server clock when the device clock is skewed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const room = makeSnapshot();
    room.serverTime = 90_000;
    roomStore.getState().establishSession(makeEstablished(room));

    const { result } = renderHook(() => useCountdown(95_000));

    expect(result.current).toBe(5);
  });
});
