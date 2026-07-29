import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { roomStore } from "../state/room-store";
import {
  makeEstablished,
  makeSnapshot,
} from "../state/__tests__/fixtures";

const controller = vi.hoisted(() => ({
  resumeRoom: vi.fn(() => Promise.resolve()),
  selectWord: vi.fn(() => Promise.resolve()),
}));

vi.mock("../realtime/runtime", () => ({
  roomController: controller,
}));

vi.mock("./canvas-board", () => ({
  CanvasBoard: ({ editable }: { editable: boolean }) => (
    <canvas
      data-testid="drawing-canvas-main"
      aria-label={editable ? "Editable drawing surface" : "Live drawing"}
    />
  ),
}));

import { RoomScreen } from "./game-screens";

const wordChoices = ["Elephant", "Bicycle", "Rainbow"] as const;

function renderRoom(
  options: Parameters<typeof makeSnapshot>[0],
): ReturnType<typeof render> {
  const snapshot = makeSnapshot(options);
  roomStore.getState().establishSession(makeEstablished(snapshot));
  return render(
    <MemoryRouter initialEntries={[`/room/${snapshot.code}`]}>
      <Routes>
        <Route path="/room/:code" element={<RoomScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  roomStore.getState().reset();
  vi.clearAllMocks();
});

describe("room word selection", () => {
  it("keeps a guesser in the live game without a choosing dialog", () => {
    renderRoom({
      phase: "selecting",
      selfPlayerId: "player-2",
      drawerId: "player-1",
    });

    expect(
      screen.getByRole("main", { name: "Word selection game room" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Players" }),
    ).toBeInTheDocument();
    expect(screen.getByTestId("drawing-canvas-main")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Guesses & chat" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(
      screen.queryByText("The drawer is choosing", { exact: true }),
    ).not.toBeInTheDocument();
  });

  it("shows the drawer private word choices in a dialog over the live game", () => {
    renderRoom({
      phase: "selecting",
      selfPlayerId: "player-1",
      drawerId: "player-1",
      privateRound: {
        turnId: "turn-1",
        answer: null,
        wordChoices: [...wordChoices],
      },
    });

    const dialog = screen.getByRole("dialog", { name: "Choose a word" });
    expect(screen.getByTestId("drawing-canvas-main")).toBeInTheDocument();
    expect(
      within(dialog).getByRole("radiogroup", { name: "Word choices" }),
    ).toBeInTheDocument();
    expect(within(dialog).getAllByRole("radio")).toHaveLength(3);
    expect(
      within(dialog).getByRole("button", { name: "Draw selected word" }),
    ).toBeDisabled();
  });

  it("submits the selected word for the current turn", async () => {
    renderRoom({
      phase: "selecting",
      selfPlayerId: "player-1",
      drawerId: "player-1",
      privateRound: {
        turnId: "turn-1",
        answer: null,
        wordChoices: [...wordChoices],
      },
    });

    fireEvent.click(screen.getByTestId("word-choice-1"));
    fireEvent.click(
      screen.getByRole("button", { name: "Draw selected word" }),
    );

    await waitFor(() => {
      expect(controller.selectWord).toHaveBeenCalledWith("turn-1", 1);
    });
  });
});
