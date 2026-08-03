import { act, render, renderHook, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const audio = vi.hoisted(() => ({
  playGameSound: vi.fn(),
}));

vi.mock("./game-audio", () => audio);

import { roomStore } from "../state/room-store";
import { makeEstablished, makeSnapshot } from "../state/__tests__/fixtures";
import { ChatPanel, Timer, useCountdown } from "./game-components";

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

describe("Timer game cues", () => {
  afterEach(() => {
    audio.playGameSound.mockClear();
  });

  it("ticks through the final five seconds and accents the last second", () => {
    const rendered = render(<Timer seconds={6} total={60} />);

    rendered.rerender(<Timer seconds={5} total={60} />);
    rendered.rerender(<Timer seconds={4} total={60} />);
    rendered.rerender(<Timer seconds={1} total={60} />);

    expect(audio.playGameSound).toHaveBeenNthCalledWith(1, "timerTick");
    expect(audio.playGameSound).toHaveBeenNthCalledWith(2, "timerTick");
    expect(audio.playGameSound).toHaveBeenNthCalledWith(3, "timerFinal");
  });

  it("stays silent for a duplicate timer on the same screen", () => {
    const rendered = render(
      <Timer seconds={6} total={60} audible={false} />,
    );

    rendered.rerender(
      <Timer seconds={5} total={60} audible={false} />,
    );

    expect(audio.playGameSound).not.toHaveBeenCalled();
  });
});
