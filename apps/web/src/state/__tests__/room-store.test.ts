import type {
  GuessFeedbackEvent,
  PhonePrivateStateEvent,
  PhoneStateEvent,
  RoundPrivateEvent,
} from "@gtd/contracts";
import { describe, expect, it } from "vitest";

import { createRoomStore } from "../room-store";
import {
  makePhoneDrawingEnvelope,
  makePhoneWritingSnapshot,
  makePlayer,
  makeSnapshot,
} from "./fixtures";

describe("room store", () => {
  it("keeps drawer secrets only for the matching drawer and turn", () => {
    const guesserStore = createRoomStore();
    const leakedSnapshot = makeSnapshot({
      selfPlayerId: "player-2",
      drawerId: "player-1",
      privateRound: {
        turnId: "turn-1",
        answer: "castle",
        wordChoices: ["castle", "rocket", "banana"],
      },
    });

    expect(
      guesserStore.getState().applySnapshot(leakedSnapshot),
    ).toBe("applied");
    expect(guesserStore.getState().room).toMatchObject({
      privateRound: null,
    });

    const privateEvent: RoundPrivateEvent = {
      revision: 2,
      privateRound: {
        turnId: "turn-1",
        answer: "castle",
        wordChoices: ["castle", "rocket", "banana"],
      },
    };
    expect(
      guesserStore.getState().applyPrivateRound(privateEvent),
    ).toBe("ignored");
    expect(guesserStore.getState().room).toMatchObject({
      privateRound: null,
    });

    const drawerStore = createRoomStore();
    drawerStore.getState().applySnapshot(
      makeSnapshot({
        selfPlayerId: "player-1",
        drawerId: "player-1",
      }),
    );
    expect(
      drawerStore.getState().applyPrivateRound(privateEvent),
    ).toBe("applied");
    const drawerRoom = drawerStore.getState().room;
    if (!drawerRoom || drawerRoom.mode === "phone") {
      throw new Error("Expected a classic drawing room.");
    }
    expect(drawerRoom.privateRound?.answer).toBe("castle");
  });

  it("never applies stale deltas and marks revision gaps for recovery", () => {
    const store = createRoomStore();
    store.getState().applySnapshot(makeSnapshot({ revision: 4 }));

    const stalePlayer = makePlayer("player-2", { score: 900 });
    expect(
      store.getState().applyPlayerUpdated({
        revision: 3,
        player: stalePlayer,
      }),
    ).toBe("stale");
    expect(
      store
        .getState()
        .room?.players.find((player) => player.id === "player-2")
        ?.score,
    ).toBe(0);

    expect(
      store.getState().applyPlayerUpdated({
        revision: 6,
        player: stalePlayer,
      }),
    ).toBe("gap");
    expect(store.getState().syncStatus).toBe("desynced");
    expect(store.getState().revisionGap).toEqual({
      expected: 5,
      received: 6,
    });
    expect(store.getState().room?.revision).toBe(4);

    expect(
      store.getState().applyPlayerUpdated({
        revision: 5,
        player: stalePlayer,
      }),
    ).toBe("gap");
    expect(store.getState().room?.revision).toBe(4);

    expect(
      store
        .getState()
        .applySnapshot(
          makeSnapshot({
            revision: 6,
            players: [
              makePlayer("player-1"),
              makePlayer("player-2", { score: 20 }),
            ],
          }),
        ),
    ).toBe("applied");
    expect(store.getState().syncStatus).toBe("synced");
    expect(store.getState().room?.revision).toBe(6);
  });

  it("stores close/correct feedback privately without publishing text", () => {
    const store = createRoomStore();
    store.getState().applySnapshot(
      makeSnapshot({
        revision: 1,
        selfPlayerId: "player-2",
        drawerId: "player-1",
      }),
    );
    const closeFeedback: GuessFeedbackEvent = {
      revision: 2,
      feedbackId: "feedback-close-1",
      feedback: {
        kind: "close",
        turnId: "turn-1",
        message: "Very close!",
        scoreDelta: 0,
        placement: null,
      },
    };

    expect(
      store.getState().applyGuessFeedback(closeFeedback),
    ).toBe("applied");
    expect(store.getState().latestGuessFeedback?.kind).toBe("close");
    expect(store.getState().privateFeedback).toHaveLength(1);
    expect(store.getState().room?.chat).toEqual([]);

    expect(
      store.getState().applyGuessFeedback({
        ...closeFeedback,
        feedbackId: "feedback-close-2",
      }),
    ).toBe("applied");
    expect(store.getState().privateFeedback).toHaveLength(2);

    expect(
      store.getState().applyGuessFeedback({
        revision: 3,
        feedbackId: "feedback-correct-1",
        feedback: {
          kind: "correct",
          turnId: "turn-1",
          message: "Correct! +750 points",
          scoreDelta: 750,
          placement: 1,
        },
      }),
    ).toBe("applied");
    expect(store.getState().latestGuessFeedback?.kind).toBe("correct");
    expect(store.getState().privateFeedback).toHaveLength(3);
    expect(store.getState().room?.chat).toEqual([]);

    expect(
      store.getState().applyGuessFeedback({
        ...closeFeedback,
        revision: 4,
        feedbackId: "feedback-stale-1",
        feedback: {
          ...closeFeedback.feedback,
          turnId: "a-stale-turn",
        },
      }),
    ).toBe("ignored");
    expect(store.getState().privateFeedback).toHaveLength(3);
  });

  it("applies public player, chat, score, and round changes idempotently", () => {
    const store = createRoomStore();
    store.getState().applySnapshot(makeSnapshot({ revision: 1 }));

    const joined = makePlayer("player-3", {
      name: "Ari",
      joinOrder: 2,
    });
    expect(
      store.getState().applyPlayerJoined({
        revision: 2,
        player: joined,
      }),
    ).toBe("applied");
    expect(store.getState().room?.players).toHaveLength(3);

    const chatEvent = {
      revision: 3,
      message: {
        id: "message-1",
        roomRevision: 3,
        playerId: "player-3",
        playerName: "Ari",
        text: "Is it a castle?",
        createdAt: 12_000,
      },
    } as const;
    expect(store.getState().applyChatMessage(chatEvent)).toBe("applied");
    expect(store.getState().applyChatMessage(chatEvent)).toBe("stale");
    expect(store.getState().room?.chat).toHaveLength(1);

    expect(
      store.getState().applyScoreUpdated({
        revision: 4,
        changes: [
          {
            playerId: "player-2",
            delta: 650,
            total: 650,
            reason: "correct-guess",
          },
        ],
      }),
    ).toBe("applied");
    expect(
      store
        .getState()
        .room?.players.find((player) => player.id === "player-2")
        ?.score,
    ).toBe(650);

    const round = store.getState().room?.round;
    if (!round) {
      throw new Error("Expected an active round.");
    }
    expect(
      store.getState().applyRoundEvent({
        revision: 5,
        round: {
          ...round,
          phase: "drawing",
          pausedUntil: 15_000,
        },
      }),
    ).toBe("applied");
    expect(store.getState().room?.round?.pausedUntil).toBe(15_000);
  });

  it("accepts authoritative Phone progress across concurrent revision jumps and merges same-revision private recovery", () => {
    const store = createRoomStore();
    const snapshot = makePhoneWritingSnapshot({ revision: 1 });
    store.getState().applySnapshot(snapshot);

    const participants = snapshot.phone.participants.map((participant) =>
      participant.playerId === "player-1"
        ? { ...participant, status: "submitted" as const }
        : participant,
    );
    const stateEvent: PhoneStateEvent = {
      revision: 4,
      phone: {
        ...snapshot.phone,
        submittedCount: 1,
        participants,
      },
    };

    expect(store.getState().applyPhoneState(stateEvent)).toBe("applied");
    expect(store.getState().room?.revision).toBe(4);
    expect(store.getState().syncStatus).toBe("synced");
    expect(store.getState().revisionGap).toBeNull();

    const draftEnvelope = makePhoneDrawingEnvelope();
    const privateEvent: PhonePrivateStateEvent = {
      revision: 4,
      privatePhone: {
        matchId: snapshot.phone.matchId,
        phase: "phone-writing",
        assignmentId: "assignment-1",
        prompt: {
          kind: "text",
          text: "A tiny lighthouse on a giant turtle",
        },
        skippedEntryCount: 1,
        draft: {
          acceptedThroughSequence: 1,
          envelopes: [draftEnvelope],
        },
        submitted: false,
      },
    };

    expect(store.getState().applyPhonePrivate(privateEvent)).toBe(
      "applied",
    );
    const room = store.getState().room;
    expect(room?.mode).toBe("phone");
    if (!room || room.mode !== "phone" || room.phase === "lobby") {
      throw new Error("Expected an active Phone room.");
    }
    expect(room.privatePhone).toMatchObject({
      assignmentId: "assignment-1",
      skippedEntryCount: 1,
      prompt: {
        kind: "text",
        text: "A tiny lighthouse on a giant turtle",
      },
      draft: {
        acceptedThroughSequence: 1,
      },
    });
    expect(room.drawing).toBeNull();
    expect(room.chat).toEqual([]);
  });
});
