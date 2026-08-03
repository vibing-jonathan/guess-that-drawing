import type { GuessFeedback, PlayerRoomSnapshot } from "@gtd/contracts";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { useRoomStore } from "../state/room-store";
import {
  isGameSoundEnabled,
  playGameSound,
  setGameSoundEnabled,
  subscribeGameSound,
  unlockGameAudio,
  type GameSound,
} from "./game-audio";
import { Icon, IconButton, type IconName } from "./primitives";

type MomentTone = "cobalt" | "coral" | "teal" | "yellow";

interface GameMoment {
  id: number;
  title: string;
  detail?: string;
  icon: IconName;
  tone: MomentTone;
  burst?: boolean;
}

interface PlayerFeelState {
  name: string;
  connected: boolean;
  score: number;
}

interface PreviousFeelState {
  sessionStatus: string | undefined;
  roomCode: string | null;
  phase: string | null;
  selfPlayerId: string | null;
  players: Map<string, PlayerFeelState>;
  feedback: GuessFeedback | null | undefined;
  correctGuessKeys: Set<string>;
  turnResultId: string | null;
}

const PARTICLES = Array.from({ length: 12 }, (_, index) => index);

function snapshotFeelState(
  sessionStatus: string | undefined,
  room: PlayerRoomSnapshot | null | undefined,
  feedback: GuessFeedback | null | undefined,
  correctGuessKeys: Set<string>,
  turnResultId: string | null,
): PreviousFeelState {
  return {
    sessionStatus,
    roomCode: room?.code ?? null,
    phase: room?.phase ?? null,
    selfPlayerId: room?.selfPlayerId ?? null,
    players: new Map(
      room?.players.map((player) => [
        player.id,
        {
          name: player.name,
          connected: player.isConnected,
          score: player.score,
        },
      ]) ?? [],
    ),
    feedback,
    correctGuessKeys,
    turnResultId,
  };
}

function phaseMoment(phase: string): Omit<GameMoment, "id"> | null {
  switch (phase) {
    case "selecting":
      return {
        title: "Pick a word!",
        detail: "A fresh turn is on the table.",
        icon: "lightbulb",
        tone: "yellow",
      };
    case "drawing":
      return {
        title: "Pens up!",
        detail: "Draw fast. Guess faster.",
        icon: "pencil",
        tone: "cobalt",
      };
    case "phone-writing":
      return {
        title: "Write it down!",
        detail: "Give the next player something wonderfully weird.",
        icon: "lightbulb",
        tone: "yellow",
      };
    case "phone-drawing-1":
    case "phone-drawing-2":
      return {
        title: "Pass the sketch!",
        detail: "No peeking at the rest of the chain.",
        icon: "pencil",
        tone: "cobalt",
      };
    case "phone-guessing":
      return {
        title: "What is it?",
        detail: "Turn this mysterious drawing back into words.",
        icon: "eye",
        tone: "coral",
      };
    case "phone-summary":
      return {
        title: "Story time!",
        detail: "See how the prompt went gloriously sideways.",
        icon: "sparkles",
        tone: "coral",
        burst: true,
      };
    case "turn-results":
      return {
        title: "Scores are in!",
        detail: "That round is in the books.",
        icon: "trophy",
        tone: "teal",
      };
    case "final-results":
      return {
        title: "That’s the game!",
        detail: "Time for bragging rights.",
        icon: "trophy",
        tone: "yellow",
        burst: true,
      };
    default:
      return null;
  }
}

function SoundToggle() {
  const soundEnabled = useSyncExternalStore(
    subscribeGameSound,
    isGameSoundEnabled,
    () => true,
  );

  const handleToggle = async () => {
    const nextEnabled = !soundEnabled;
    setGameSoundEnabled(nextEnabled);
    if (nextEnabled && (await unlockGameAudio())) {
      playGameSound("join");
    }
  };

  return (
    <IconButton
      className="sound-toggle"
      icon={soundEnabled ? "volume" : "volumeOff"}
      label={soundEnabled ? "Mute game sounds" : "Turn game sounds on"}
      selected={soundEnabled}
      onClick={() => void handleToggle()}
    />
  );
}

export function GameFeel() {
  const sessionStatus = useRoomStore((state) => state.sessionStatus);
  const room = useRoomStore((state) => state.room);
  const latestFeedback = useRoomStore(
    (state) => state.latestGuessFeedback,
  );
  const correctGuessEvents = useRoomStore(
    (state) => state.correctGuessEvents,
  );
  const lastTurnResult = useRoomStore((state) => state.lastTurnResult);
  const [moment, setMoment] = useState<GameMoment | null>(null);
  const previousRef = useRef<PreviousFeelState | null>(null);
  const momentSequenceRef = useRef(0);
  const momentTimeoutRef = useRef<number | null>(null);

  const showMoment = useCallback((next: Omit<GameMoment, "id">) => {
    if (momentTimeoutRef.current !== null) {
      window.clearTimeout(momentTimeoutRef.current);
    }
    const id = ++momentSequenceRef.current;
    setMoment({ ...next, id });
    momentTimeoutRef.current = window.setTimeout(() => {
      setMoment((current) => (current?.id === id ? null : current));
      momentTimeoutRef.current = null;
    }, next.burst ? 1_650 : 1_350);
  }, []);

  const celebrate = useCallback(
    (sound: GameSound, nextMoment?: Omit<GameMoment, "id">) => {
      playGameSound(sound);
      if (nextMoment) showMoment(nextMoment);
    },
    [showMoment],
  );

  useEffect(() => {
    const unlock = () => {
      void unlockGameAudio();
    };
    const buttonSound = (event: MouseEvent) => {
      const button = (event.target as Element | null)?.closest(
        "button:not(:disabled)",
      );
      if (
        button?.matches(
          ".button--primary, .button--accent, .word-choice-list button, .tool-choice",
        )
      ) {
        playGameSound("tap");
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("click", buttonSound);
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("click", buttonSound);
    };
  }, []);

  useEffect(() => {
    return () => {
      if (momentTimeoutRef.current !== null) {
        window.clearTimeout(momentTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const correctGuessKeys = new Set(
      correctGuessEvents?.map(
        (guess) => `${guess.turnId}:${guess.playerId}:${guess.placement}`,
      ) ?? [],
    );
    const current = snapshotFeelState(
      sessionStatus,
      room,
      latestFeedback,
      correctGuessKeys,
      lastTurnResult?.turnId ?? null,
    );
    const previous = previousRef.current;
    previousRef.current = current;
    if (!previous || !room) return;

    if (
      sessionStatus === "in-room" &&
      previous.sessionStatus === "creating"
    ) {
      celebrate("roomReady", {
        title: "Room ready!",
        detail: "Your private game night is open.",
        icon: "sparkles",
        tone: "teal",
        burst: true,
      });
      return;
    }

    if (
      sessionStatus === "in-room" &&
      previous.sessionStatus === "joining"
    ) {
      celebrate("join", {
        title: "You’re in!",
        detail: "Grab a seat and get ready to draw.",
        icon: "game",
        tone: "cobalt",
      });
      return;
    }

    if (previous.roomCode !== room.code) return;

    if (latestFeedback && latestFeedback !== previous.feedback) {
      if (latestFeedback.kind === "correct") {
        celebrate("correct", {
          title: "Nailed it!",
          detail:
            latestFeedback.scoreDelta > 0
              ? `+${latestFeedback.scoreDelta} points`
              : latestFeedback.message,
          icon: "checkCircle",
          tone: "teal",
          burst: true,
        });
      } else if (latestFeedback.kind === "close") {
        celebrate("close", {
          title: "So close!",
          detail: latestFeedback.message,
          icon: "lightbulb",
          tone: "yellow",
        });
      } else {
        playGameSound("incorrect");
      }
      return;
    }

    const newCorrectGuess = correctGuessEvents?.find(
      (guess) =>
        !previous.correctGuessKeys.has(
          `${guess.turnId}:${guess.playerId}:${guess.placement}`,
        ) && guess.playerId !== room.selfPlayerId,
    );
    if (newCorrectGuess) {
      celebrate("correct", {
        title: `${newCorrectGuess.playerName} got it!`,
        detail: `Correct guess #${newCorrectGuess.placement}`,
        icon: "checkCircle",
        tone: "teal",
        burst: true,
      });
      return;
    }

    if (
      lastTurnResult?.turnId &&
      lastTurnResult.turnId !== previous.turnResultId
    ) {
      celebrate("score", {
        title: "Scores are in!",
        detail: "That round is in the books.",
        icon: "trophy",
        tone: "teal",
      });
      return;
    }

    const selfNow = current.players.get(room.selfPlayerId);
    const selfBefore = previous.players.get(room.selfPlayerId);
    if (
      selfNow &&
      selfBefore &&
      selfNow.score > selfBefore.score &&
      latestFeedback?.kind !== "correct"
    ) {
      celebrate("score", {
        title: `+${selfNow.score - selfBefore.score} points!`,
        detail: "Your score just climbed.",
        icon: "trophy",
        tone: "teal",
        burst: true,
      });
      return;
    }

    if (previous.phase !== room.phase) {
      const nextPhaseMoment = phaseMoment(room.phase);
      if (nextPhaseMoment) {
        celebrate(
          room.phase === "final-results" ? "victory" : "phase",
          nextPhaseMoment,
        );
        return;
      }
    }

    for (const [playerId, player] of current.players) {
      if (playerId === room.selfPlayerId) continue;
      const priorPlayer = previous.players.get(playerId);
      if (!priorPlayer || (!priorPlayer.connected && player.connected)) {
        celebrate("join", {
          title: `${player.name} joined!`,
          detail: "Another player pulled up a chair.",
          icon: "users",
          tone: "cobalt",
        });
        return;
      }
      if (priorPlayer.connected && !player.connected) {
        celebrate("leave", {
          title: `${player.name} dropped out`,
          detail: "Their seat is saved while they reconnect.",
          icon: "wifiOff",
          tone: "coral",
        });
        return;
      }
    }

    for (const [playerId, player] of previous.players) {
      if (playerId !== room.selfPlayerId && !current.players.has(playerId)) {
        celebrate("leave", {
          title: `${player.name} left the room`,
          detail: "The game can keep rolling.",
          icon: "wifiOff",
          tone: "coral",
        });
        return;
      }
    }
  }, [
    celebrate,
    correctGuessEvents,
    lastTurnResult,
    latestFeedback,
    room,
    sessionStatus,
  ]);

  return (
    <>
      <SoundToggle />
      <div className="game-moment-layer" aria-live="polite" aria-atomic="true">
        {moment ? (
          <div
            key={moment.id}
            className={`game-moment game-moment--${moment.tone}`}
            role="status"
          >
            <span className="game-moment__icon" aria-hidden="true">
              <Icon name={moment.icon} size={28} />
            </span>
            <span className="game-moment__copy">
              <strong>{moment.title}</strong>
              {moment.detail ? <span>{moment.detail}</span> : null}
            </span>
            {moment.burst ? (
              <span className="game-moment__burst" aria-hidden="true">
                {PARTICLES.map((particle) => (
                  <i key={particle} />
                ))}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </>
  );
}
