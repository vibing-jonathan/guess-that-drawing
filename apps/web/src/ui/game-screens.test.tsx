import type {
  PhoneStoryEntry,
  PlayerRoomSnapshot,
} from "@gtd/contracts";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { roomStore } from "../state/room-store";
import {
  makeEstablished,
  makePhoneDrawingEnvelope,
  makePhonePhaseSnapshot,
  makeSnapshot,
} from "../state/__tests__/fixtures";

const controller = vi.hoisted(() => ({
  resumeRoom: vi.fn(() => Promise.resolve()),
  selectWord: vi.fn(() => Promise.resolve()),
  submitPhoneText: vi.fn(() => Promise.resolve()),
  sendPhoneDrawingBatch: vi.fn(() => Promise.resolve()),
  submitPhoneDrawing: vi.fn(() => Promise.resolve()),
  navigatePhoneSummary: vi.fn(() => Promise.resolve()),
  requestSnapshot: vi.fn(() => Promise.resolve()),
  startMatch: vi.fn(() => Promise.resolve()),
  leaveRoom: vi.fn(() => Promise.resolve()),
}));

vi.mock("../realtime/runtime", () => ({
  roomController: controller,
}));

vi.mock("./canvas-board", () => ({
  CanvasBoard: ({
    editable,
    initialOperations = [],
    recover,
    subscribeToRoomDrawing = true,
  }: {
    editable: boolean;
    initialOperations?: readonly unknown[];
    recover?: () => void;
    subscribeToRoomDrawing?: boolean;
  }) => (
    <div
      data-testid={editable ? "editable-canvas" : "readonly-canvas"}
      data-operation-count={initialOperations.length}
      data-room-subscription={String(subscribeToRoomDrawing)}
    >
      <canvas
        data-testid="drawing-canvas-main"
        aria-label={editable ? "Editable drawing surface" : "Live drawing"}
      />
      {recover ? (
        <button type="button" onClick={recover}>
          Recover private canvas
        </button>
      ) : null}
    </div>
  ),
}));

import { RoomScreen } from "./game-screens";

const wordChoices = ["Elephant", "Bicycle", "Rainbow"] as const;

function renderRoom(
  options: Parameters<typeof makeSnapshot>[0],
): ReturnType<typeof render> {
  const snapshot = makeSnapshot(options);
  return renderSnapshot(snapshot);
}

function renderSnapshot(
  snapshot: PlayerRoomSnapshot,
): ReturnType<typeof render> {
  roomStore.getState().establishSession(makeEstablished(snapshot));
  roomStore.getState().setConnection("connected");
  return renderStoredRoom(snapshot.code);
}

function renderStoredRoom(code = "ABC234"): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={[`/room/${code}`]}>
      <Routes>
        <Route path="/room/:code" element={<RoomScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function makeProSnapshot(
  options: Parameters<typeof makeSnapshot>[0] = {},
): PlayerRoomSnapshot {
  const snapshot = makeSnapshot(options);
  return {
    ...snapshot,
    mode: "pro",
    settings: {
      ...snapshot.settings,
      mode: "pro",
    },
  };
}

function makePhoneSummarySnapshot({
  selfPlayerId = "player-1",
  last = false,
}: {
  selfPlayerId?: string;
  last?: boolean;
} = {}): PlayerRoomSnapshot {
  const active = makePhonePhaseSnapshot("phone-writing");
  const authors = active.players.map((player) => ({
    playerId: player.id,
    playerName: player.name,
  }));
  const entries: PhoneStoryEntry[] = [
    {
      id: "story-entry-1",
      phase: "phone-writing",
      kind: "text",
      author: authors[0]!,
      text: "A lighthouse on wheels",
    },
    {
      id: "story-entry-2",
      phase: "phone-drawing-1",
      kind: "drawing",
      author: authors[1]!,
      envelopes: [makePhoneDrawingEnvelope(1, "story-entry-2")],
    },
    {
      id: "story-entry-3",
      phase: "phone-guessing",
      kind: "text",
      author: authors[2]!,
      text: "A rolling birthday cake",
    },
    {
      id: "story-entry-4",
      phase: "phone-drawing-2",
      kind: "drawing",
      author: authors[3]!,
      envelopes: [makePhoneDrawingEnvelope(1, "story-entry-4")],
    },
  ];
  return {
    ...active,
    phase: "phone-summary",
    selfPlayerId,
    phone: {
      matchId: active.phone.matchId,
      phase: "phone-summary",
      storyCount: 4,
      cursor: {
        storyIndex: last ? 3 : 0,
        entryIndex: last ? 3 : 0,
      },
      storyline: {
        id: last ? "story-4" : "story-1",
        entries: last ? entries : entries.slice(0, 1),
      },
    },
    privatePhone: null,
  };
}

function makePhoneCompletionSnapshot(
  selfPlayerId = "player-1",
): PlayerRoomSnapshot {
  const active = makePhonePhaseSnapshot("phone-writing");
  return {
    ...active,
    phase: "final-results",
    selfPlayerId,
    phone: {
      matchId: active.phone.matchId,
      phase: "final-results",
      storyCount: 4,
    },
    privatePhone: null,
  };
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

describe("Pro Mode feedback", () => {
  it("keeps the penalty rule visible and renders a signed private incorrect-guess delta", () => {
    const snapshot = makeProSnapshot({
      phase: "drawing",
      selfPlayerId: "player-2",
      drawerId: "player-1",
    });
    roomStore.getState().establishSession(makeEstablished(snapshot));
    roomStore.getState().applyGuessFeedback({
      revision: 2,
      feedbackId: "pro-incorrect-1",
      feedback: {
        kind: "incorrect",
        turnId: "turn-1",
        message: "Incorrect guess. 25 points lost.",
        scoreDelta: -25,
        placement: null,
      },
    });

    renderStoredRoom(snapshot.code);

    expect(screen.getByRole("note")).toHaveTextContent(
      "incorrect guess costs up to 25 points",
    );
    expect(screen.getByText("−25 points")).toBeInTheDocument();
    expect(
      screen.getByText("Incorrect guess. 25 points lost."),
    ).toBeInTheDocument();
  });

  it("sums every signed score change for a player on the result leaderboard", () => {
    const snapshot = makeProSnapshot({
      phase: "final-results",
      players: [
        makeSnapshot().players[0]!,
        {
          ...makeSnapshot().players[1]!,
          score: 90,
        },
      ],
    });
    roomStore.getState().establishSession(makeEstablished(snapshot));
    roomStore.setState({
      lastTurnResult: {
        turnId: "turn-1",
        answer: "lighthouse",
        drawerId: "player-1",
        correctPlayerIds: ["player-2"],
        scoreChanges: [
          {
            playerId: "player-2",
            delta: -25,
            total: 75,
            reason: "incorrect-guess",
          },
          {
            playerId: "player-2",
            delta: -25,
            total: 50,
            reason: "incorrect-guess",
          },
          {
            playerId: "player-2",
            delta: 40,
            total: 90,
            reason: "correct-guess",
          },
        ],
        endedAt: 15_000,
        reason: "all-guessed",
      },
    });

    renderStoredRoom(snapshot.code);

    expect(screen.getByText("−10")).toBeInTheDocument();
    expect(screen.queryByText("−25")).not.toBeInTheDocument();
  });
});

describe("Phone Mode active phases", () => {
  it("renders the writing phase without chat or scores and focuses the private textarea", () => {
    const snapshot = makePhonePhaseSnapshot("phone-writing");
    snapshot.phone.participants = snapshot.phone.participants.map(
      (participant, index) => ({
        ...participant,
        status:
          index === 0
            ? "submitted"
            : index === 1
              ? "working"
              : index === 2
                ? "skipped"
                : "disconnected",
      }),
    );
    snapshot.phone.submittedCount = 1;

    renderSnapshot(snapshot);

    expect(
      screen.getByRole("heading", { name: "Write the opening" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Write one clear, drawable scene")).toHaveFocus();
    expect(screen.getByText("Submitted")).toBeInTheDocument();
    expect(screen.getByText("Skipped")).toBeInTheDocument();
    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Guesses & chat" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/points/i)).not.toBeInTheDocument();
  });

  it("renders the first drawing phase with a private text prompt, restored draft, and heading focus", () => {
    const envelope = makePhoneDrawingEnvelope();
    const snapshot = makePhonePhaseSnapshot("phone-drawing-1", {
      prompt: {
        kind: "text",
        text: "A tiny lighthouse on a giant turtle",
      },
      draft: {
        acceptedThroughSequence: 1,
        envelopes: [envelope],
      },
    });

    renderSnapshot(snapshot);

    expect(
      screen.getByRole("heading", { name: "Draw the prompt" }),
    ).toHaveFocus();
    expect(
      screen.getByText("A tiny lighthouse on a giant turtle"),
    ).toBeInTheDocument();
    const canvas = screen.getByTestId("editable-canvas");
    expect(canvas).toHaveAttribute("data-operation-count", "1");
    expect(canvas).toHaveAttribute("data-room-subscription", "false");
    fireEvent.click(
      screen.getByRole("button", { name: "Recover private canvas" }),
    );
    expect(controller.requestSnapshot).toHaveBeenCalledOnce();
  });

  it("renders the guessing phase over its assigned drawing and submits private text", async () => {
    const snapshot = makePhonePhaseSnapshot("phone-guessing", {
      prompt: {
        kind: "drawing",
        envelopes: [makePhoneDrawingEnvelope()],
      },
    });

    renderSnapshot(snapshot);

    expect(
      screen.getByRole("heading", { name: "Guess the drawing" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Latest valid drawing")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-canvas")).toHaveAttribute(
      "data-operation-count",
      "1",
    );
    const guess = screen.getByLabelText("Your private guess");
    expect(guess).toHaveFocus();
    fireEvent.change(guess, {
      target: { value: "A lighthouse riding a turtle" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Submit guess" }),
    );

    await waitFor(() => {
      expect(controller.submitPhoneText).toHaveBeenCalledWith(
        "assignment-1",
        "A lighthouse riding a turtle",
      );
    });
  });

  it("renders the final drawing phase with a private text prompt and heading focus", () => {
    const snapshot = makePhonePhaseSnapshot("phone-drawing-2", {
      prompt: {
        kind: "text",
        text: "A rolling birthday cake",
      },
    });

    renderSnapshot(snapshot);

    expect(
      screen.getByRole("heading", { name: "Draw the guess" }),
    ).toHaveFocus();
    expect(screen.getByText("A rolling birthday cake")).toBeInTheDocument();
    expect(screen.getByTestId("editable-canvas")).toBeInTheDocument();
  });

  it("shows the most recent valid prompt kind after skipped links instead of a blank expected-kind placeholder", () => {
    const textFallback = makePhonePhaseSnapshot("phone-guessing", {
      prompt: {
        kind: "text",
        text: "The sentence survived because the drawing was skipped",
      },
      skippedEntryCount: 1,
    });
    const first = renderSnapshot(textFallback);

    expect(screen.getByText("1 skipped step · continue this task")).toBeInTheDocument();
    expect(
      screen.getByText(
        "The sentence survived because the drawing was skipped",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/restoring the latest/i)).not.toBeInTheDocument();

    first.unmount();
    roomStore.getState().reset();
    const drawingFallback = makePhonePhaseSnapshot("phone-drawing-2", {
      prompt: {
        kind: "drawing",
        envelopes: [makePhoneDrawingEnvelope()],
      },
      skippedEntryCount: 1,
    });
    renderSnapshot(drawingFallback);

    expect(screen.getByText("Latest valid drawing")).toBeInTheDocument();
    expect(screen.getByTestId("readonly-canvas")).toBeInTheDocument();
    expect(screen.getByTestId("editable-canvas")).toBeInTheDocument();
  });

  it("allows authoring when every earlier link was skipped", () => {
    const snapshot = makePhonePhaseSnapshot("phone-drawing-2", {
      prompt: null,
      skippedEntryCount: 2,
    });

    renderSnapshot(snapshot);

    expect(screen.getByText("No earlier prompt")).toBeInTheDocument();
    expect(
      screen.getByText(
        /No earlier valid prompt was submitted.*imagination\./,
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("editable-canvas")).toBeInTheDocument();
  });
});

describe("Phone Mode synchronized summary", () => {
  it("gives the host synchronized reveal controls and focuses the summary heading", async () => {
    const snapshot = makePhoneSummarySnapshot();
    renderSnapshot(snapshot);

    expect(
      screen.getByRole("heading", { name: "Story 1 of 4" }),
    ).toHaveFocus();
    expect(screen.getByText("Maya wrote")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Reveal next" }),
    );
    await waitFor(() => {
      expect(controller.navigatePhoneSummary).toHaveBeenCalledWith("next");
    });
  });

  it("keeps summary navigation host-only for guests", () => {
    const snapshot = makePhoneSummarySnapshot({
      selfPlayerId: "player-2",
    });
    renderSnapshot(snapshot);

    expect(screen.getByText("Waiting for the host")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Reveal next" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous" }),
    ).not.toBeInTheDocument();
  });

  it("lets the host finish only after the last synchronized entry", async () => {
    const snapshot = makePhoneSummarySnapshot({ last: true });
    renderSnapshot(snapshot);

    fireEvent.click(
      screen.getByRole("button", { name: "Finish summary" }),
    );
    await waitFor(() => {
      expect(controller.navigatePhoneSummary).toHaveBeenCalledWith(
        "finish",
      );
    });
  });
});

describe("Phone Mode completion", () => {
  it("focuses the completion heading and omits a leaderboard", () => {
    renderSnapshot(makePhoneCompletionSnapshot());

    expect(
      screen.getByRole("heading", {
        name: "Every story found an ending",
      }),
    ).toHaveFocus();
    expect(screen.getByRole("button", { name: "Play again" })).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: /leaderboard/i }),
    ).not.toBeInTheDocument();
  });
});
