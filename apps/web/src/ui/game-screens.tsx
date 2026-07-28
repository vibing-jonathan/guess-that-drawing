import {
  isValidRoomCode,
  type PlayerPublic,
  type PlayerRoomSnapshot,
} from "@gtd/contracts";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { roomController } from "../realtime/runtime";
import {
  roomStore,
  selectCurrentPlayer,
  selectIsDrawer,
  selectIsHost,
  useRoomStore,
} from "../state/room-store";
import { CanvasBoard } from "./canvas-board";
import {
  ChatPanel,
  GameStatusBar,
  GuessFeedbackBanner,
  MobileSupport,
  NetworkBanner,
  Timer,
  useCountdown,
} from "./game-components";
import {
  Avatar,
  Banner,
  Button,
  Icon,
  Panel,
  PlayersPanel,
  StatusBadge,
} from "./primitives";
import { LobbyScreen } from "./setup-screens";

function WordSelectionScreen({ room }: { room: PlayerRoomSnapshot }) {
  const [choice, setChoice] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const isDrawer = room.round?.drawerId === room.selfPlayerId;
  const choices =
    isDrawer && room.privateRound?.turnId === room.round?.turnId
      ? room.privateRound?.wordChoices ?? []
      : [];
  const seconds = useCountdown(room.round?.selectionDeadline ?? null);
  const firstChoice = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (choices.length) {
      firstChoice.current?.focus();
    } else {
      dialogRef.current?.focus();
    }
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = dialogRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled)",
      );
      if (!controls?.length) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = controls[0]!;
      const last = controls[controls.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => window.removeEventListener("keydown", trapFocus);
  }, [choices.length]);

  async function confirmChoice() {
    if (choice === undefined || !room.round) return;
    setPending(true);
    setError(undefined);
    try {
      await roomController.selectWord(room.round.turnId, choice);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to select that word.",
      );
    } finally {
      setPending(false);
    }
  }

  const emptyDrawing =
    room.drawing?.turnId === room.round?.turnId
      ? room.drawing?.operations ?? []
      : [];

  return (
    <main
      id="main-content"
      className="game-page game-page--selection"
      aria-labelledby="word-select-title"
    >
      <div className="game-selection-shell">
        <GameStatusBar room={room} isDrawer={isDrawer} />
        {room.round ? (
          <CanvasBoard
            turnId={room.round.turnId}
            editable={false}
            disabled
            initialOperations={emptyDrawing}
          />
        ) : null}
      </div>
      <div className="word-select-layer">
        <section
          ref={dialogRef}
          className="word-select-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="word-select-title"
          aria-describedby="word-select-description"
          tabIndex={-1}
        >
          <div className="word-select-heading">
            <div>
              <span className="eyebrow">
                {isDrawer ? "You’re drawing" : "Next turn"}
              </span>
              <h1 id="word-select-title">
                {isDrawer ? "Choose a word" : "The drawer is choosing"}
              </h1>
              <p id="word-select-description">
                {isDrawer
                  ? "The other players will only see the letter count."
                  : "Your canvas will appear as soon as the secret word is chosen."}
              </p>
            </div>
            <Timer
              seconds={seconds}
              total={room.settings.wordSelectionSeconds}
              label="seconds to choose a word"
            />
          </div>
          {error ? (
            <Banner tone="danger" title="Selection failed" role="alert">
              {error}
            </Banner>
          ) : null}
          {isDrawer ? (
            <>
              <div
                className="word-choice-list"
                role="radiogroup"
                aria-label="Word choices"
              >
                {choices.map((word, index) => (
                  <button
                    key={`${index}-${word}`}
                    type="button"
                    className={choice === index ? "is-selected" : ""}
                    role="radio"
                    aria-checked={choice === index}
                    onClick={() => setChoice(index)}
                    data-testid={`word-choice-${index}`}
                    {...(index === 0 ? { ref: firstChoice } : {})}
                  >
                    <span>{word}</span>
                    {choice === index ? (
                      <>
                        <Icon name="check" size={20} />
                        <small>Selected</small>
                      </>
                    ) : (
                      <small>{word.length} characters</small>
                    )}
                  </button>
                ))}
              </div>
              <div className="dialog__actions cluster">
                <Button variant="secondary" onClick={() => setChoice(undefined)}>
                  Clear choice
                </Button>
                <Button
                  disabled={choice === undefined || pending}
                  icon="arrowRight"
                  onClick={() => void confirmChoice()}
                >
                  {pending ? "Starting turn…" : "Draw selected word"}
                </Button>
              </div>
            </>
          ) : (
            <div className="waiting-status" role="status" aria-live="polite">
              <Icon name="clock" size={22} />
              <div>
                <strong>Word selection is private</strong>
                <span>Get ready to guess.</span>
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function GameScreen({ room }: { room: PlayerRoomSnapshot }) {
  const round = room.round!;
  const isDrawer = round.drawerId === room.selfPlayerId;
  const isHost = room.players.some(
    (player) => player.id === room.selfPlayerId && player.isHost,
  );
  const connection = useRoomStore((state) => state.connectionStatus);
  const sync = useRoomStore((state) => state.syncStatus);
  const drawingSync = useRoomStore((state) => state.drawingSyncStatus);
  const allCorrectEvents = useRoomStore(
    (state) => state.correctGuessEvents,
  );
  const correctEvents = useMemo(
    () =>
      allCorrectEvents.filter((event) => event.turnId === round.turnId),
    [allCorrectEvents, round.turnId],
  );
  const operations =
    room.drawing?.turnId === round.turnId ? room.drawing.operations : [];
  const disabled =
    connection !== "connected" ||
    sync !== "synced" ||
    drawingSync === "gap" ||
    drawingSync === "replaying" ||
    round.pausedUntil !== null;
  const self = room.players.find((player) => player.id === room.selfPlayerId);

  return (
    <main
      id="main-content"
      className={`game-page game-page--${
        isDrawer ? "drawer" : self?.hasGuessed ? "guessed" : "guesser"
      }`}
      aria-labelledby="game-heading"
    >
      <h1 id="game-heading" className="sr-only">
        {isDrawer
          ? "Active drawer game room"
          : self?.hasGuessed
            ? "Already-guessed game room"
            : "Active guesser game room"}
      </h1>
      <div className="game-live sr-only" aria-live="polite">
        {correctEvents.at(-1)
          ? `${correctEvents.at(-1)!.playerName} guessed correctly.`
          : isDrawer
            ? "You are drawing."
            : "Enter your guess."}
      </div>
      <NetworkBanner round={round} />
      <div className="game-shell">
        <PlayersPanel
          players={room.players}
          selfId={room.selfPlayerId}
          ranked
        />
        <section className="play-column" aria-label="Current drawing turn">
          <GameStatusBar room={room} isDrawer={isDrawer} />
          <CanvasBoard
            turnId={round.turnId}
            editable={isDrawer}
            disabled={disabled}
            initialOperations={operations}
          />
          {!isDrawer ? (
            <div className="guesser-action-row">
              <GuessFeedbackBanner turnId={round.turnId} />
              {!self?.hasGuessed &&
              roomStore.getState().latestGuessFeedback?.kind !== "close" ? (
                <span className="canvas-caption">
                  <Icon name="eye" size={18} /> Drawing in progress · close and
                  correct guesses stay private
                </span>
              ) : null}
            </div>
          ) : null}
          <MobileSupport
            room={room}
            isDrawer={isDrawer}
            isHost={isHost}
          />
        </section>
        <ChatPanel room={room} isDrawer={isDrawer} />
      </div>
    </main>
  );
}

function scoreDelta(player: PlayerPublic, room: PlayerRoomSnapshot): number {
  return (
    roomStore
      .getState()
      .lastTurnResult?.scoreChanges.find(
        (change) => change.playerId === player.id,
      )?.delta ?? 0
  );
}

function Leaderboard({
  room,
  final,
}: {
  room: PlayerRoomSnapshot;
  final?: boolean;
}) {
  const players = useMemo(
    () => [...room.players].sort((a, b) => b.score - a.score),
    [room.players],
  );
  return (
    <ol className={`leaderboard ${final ? "leaderboard--final" : ""}`}>
      {players.map((player, index) => {
        const delta = scoreDelta(player, room);
        return (
          <li
            key={player.id}
            className={index === 0 ? "leaderboard__winner" : ""}
          >
            <span className="leaderboard__place numeric">{index + 1}</span>
            <Avatar name={player.name} config={player.avatar} size={48} />
            <div>
              <strong>
                {player.name}
                {player.id === room.selfPlayerId ? " · You" : ""}
              </strong>
              <span>
                {index === 0 && final ? (
                  <>
                    <Icon name="trophy" size={15} /> Winner
                  </>
                ) : player.isConnected ? (
                  "Finished"
                ) : (
                  "Disconnected"
                )}
              </span>
            </div>
            {delta ? (
              <span className="leaderboard__delta numeric">+{delta}</span>
            ) : null}
            <strong className="leaderboard__score numeric">
              {player.score}
            </strong>
          </li>
        );
      })}
    </ol>
  );
}

function TurnResultsScreen({ room }: { room: PlayerRoomSnapshot }) {
  const navigate = useNavigate();
  const result = useRoomStore((state) => state.lastTurnResult);
  const drawer = room.players.find(
    (player) => player.id === result?.drawerId,
  );
  return (
    <main
      id="main-content"
      className="results-page page-shell page-shell--wide"
      aria-labelledby="turn-results-title"
    >
      <section className="turn-result-summary">
        <p className="page-kicker">Turn complete</p>
        <h1 id="turn-results-title">
          The word was <span>{result?.answer ?? "revealed"}</span>
        </h1>
        <p className="lede">
          {drawer?.name ?? "The drawer"} drew it.{" "}
          {result?.correctPlayerIds.length ?? 0} players found the answer.
        </p>
        <div className="result-facts">
          <div>
            <span>Turn ended</span>
            <strong>{result?.reason.replaceAll("-", " ") ?? "Complete"}</strong>
          </div>
          <div>
            <span>Correct guesses</span>
            <strong className="numeric">
              {result?.correctPlayerIds.length ?? 0}
            </strong>
          </div>
          <div>
            <span>Next turn</span>
            <strong>Starting shortly</strong>
          </div>
        </div>
      </section>
      <Panel className="round-score-panel" aria-labelledby="round-score-title">
        <div className="split panel__heading">
          <h2 id="round-score-title">Round scores</h2>
          <StatusBadge icon="clock">Waiting for server</StatusBadge>
        </div>
        <Leaderboard room={room} />
        <div className="form-actions">
          <Button
            variant="secondary"
            icon="logOut"
            onClick={() => void leaveRoom(navigate)}
          >
            Leave room
          </Button>
          <Button
            icon="refresh"
            data-testid="next-turn-action"
            onClick={() => void roomController.requestSnapshot()}
          >
            Refresh next turn
          </Button>
        </div>
      </Panel>
    </main>
  );
}

function FinalResultsScreen({ room }: { room: PlayerRoomSnapshot }) {
  const navigate = useNavigate();
  const winner = [...room.players].sort((a, b) => b.score - a.score)[0];
  const isHost =
    room.players.find((player) => player.id === room.selfPlayerId)?.isHost ??
    false;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  async function playAgain() {
    setPending(true);
    setError(undefined);
    try {
      await roomController.startMatch();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to start a rematch.",
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <main
      id="main-content"
      className="results-page final-page page-shell page-shell--wide"
      aria-labelledby="final-title"
    >
      <section className="winner-summary">
        <span className="winner-mark">
          <Icon name="trophy" size={46} />
        </span>
        <p className="page-kicker">
          {room.settings.drawingCycles} cycles complete
        </p>
        <h1 id="final-title">
          {winner ? `${winner.name} takes the table` : "Game complete"}
        </h1>
        <p className="lede">Every sketch and guess made this match.</p>
        <div className="winner-score numeric">{winner?.score ?? 0}</div>
        <span>final points</span>
      </section>
      <Panel
        className="final-leaderboard-panel"
        aria-labelledby="final-leaderboard-title"
      >
        {error ? (
          <Banner tone="danger" title="Rematch failed" role="alert">
            {error}
          </Banner>
        ) : null}
        <div className="split panel__heading">
          <h2 id="final-leaderboard-title">Final leaderboard</h2>
          <StatusBadge tone="success" icon="checkCircle">
            Game complete
          </StatusBadge>
        </div>
        <Leaderboard room={room} final />
        <div className="final-actions">
          {isHost ? (
            <Button
              icon="refresh"
              data-testid="replay-match-action"
              disabled={pending}
              onClick={() => void playAgain()}
            >
              {pending ? "Starting rematch…" : "Play again"}
            </Button>
          ) : (
            <div className="waiting-status" role="status">
              <Icon name="clock" size={22} />
              <div>
                <strong>Waiting for the host</strong>
                <span>The host can start a rematch.</span>
              </div>
            </div>
          )}
          <Button
            variant="quiet"
            icon="logOut"
            onClick={() => void leaveRoom(navigate)}
          >
            Leave room
          </Button>
        </div>
      </Panel>
    </main>
  );
}

async function leaveRoom(navigate: ReturnType<typeof useNavigate>) {
  try {
    await roomController.leaveRoom();
  } finally {
    navigate("/", { replace: true });
  }
}

function RecoveryScreen({
  code,
  message,
  retry,
  retryLabel = "Try again",
}: {
  code: string;
  message: string;
  retry: () => void;
  retryLabel?: string;
}) {
  const navigate = useNavigate();
  return (
    <main
      id="main-content"
      className="system-state-page"
      aria-labelledby="recovery-title"
    >
      <section className="system-state-card" role="alert">
        <span className="system-state-card__icon">
          <Icon name="cloudOff" size={46} />
        </span>
        <p className="eyebrow">Connection interrupted</p>
        <h1 id="recovery-title">We couldn’t restore this room</h1>
        <p>{message}</p>
        <dl className="outage-facts">
          <div>
            <dt>Room</dt>
            <dd className="numeric">{code}</dd>
          </div>
          <div>
            <dt>Recovery</dt>
            <dd>Safe to retry</dd>
          </div>
        </dl>
        <div className="cluster">
          <Button icon="refresh" onClick={retry}>
            {retryLabel}
          </Button>
          <Button variant="secondary" icon="home" onClick={() => navigate("/")}>
            Back home
          </Button>
        </div>
      </section>
    </main>
  );
}

export function RoomScreen() {
  const navigate = useNavigate();
  const { code: rawCode = "" } = useParams();
  const code = rawCode.toUpperCase();
  const room = useRoomStore((state) => state.room);
  const sessionStatus = useRoomStore((state) => state.sessionStatus);
  const kickedReason = useRoomStore((state) => state.kickedReason);
  const storeError = useRoomStore((state) => state.lastError);
  const [recoveryError, setRecoveryError] = useState<{
    code?: string;
    message: string;
  }>();
  const attemptedCode = useRef<string | undefined>(undefined);

  const resume = () => {
    attemptedCode.current = code;
    setRecoveryError(undefined);
    void roomController.resumeRoom(code).catch((caught) => {
      const issue = caught as { code?: string; message?: string };
      setRecoveryError({
        ...(issue.code ? { code: issue.code } : {}),
        message: issue.message ?? "Room recovery failed.",
      });
    });
  };

  useEffect(() => {
    if (
      code.length === 6 &&
      room?.code !== code &&
      attemptedCode.current !== code &&
      !["joining", "creating", "resuming"].includes(sessionStatus)
    ) {
      resume();
    }
  }, [code, room?.code, sessionStatus]);

  if (!isValidRoomCode(code)) {
    return (
      <RecoveryScreen
        code={code || "—"}
        message="Room codes contain six supported letters or digits."
        retryLabel="Enter a room code"
        retry={() => navigate("/join", { replace: true })}
      />
    );
  }

  if (room?.code !== code) {
    if (recoveryError || kickedReason || storeError) {
      return (
        <RecoveryScreen
          code={code}
          message={
            kickedReason ??
            recoveryError?.message ??
            storeError?.message ??
            "This room may be invalid, expired, full, or unavailable."
          }
          retry={() => {
            if (recoveryError?.code === "MISSING_CREDENTIALS") {
              navigate(`/join?code=${code}`, { replace: true });
              return;
            }
            attemptedCode.current = undefined;
            resume();
          }}
          retryLabel={
            recoveryError?.code === "MISSING_CREDENTIALS"
              ? "Join this room"
              : "Try again"
          }
        />
      );
    }
    return (
      <main
        id="main-content"
        className="system-state-page"
        aria-labelledby="room-loading-title"
      >
        <section className="system-state-card" role="status">
          <span className="system-state-card__icon">
            <Icon name="refresh" size={46} />
          </span>
          <h1 id="room-loading-title">Restoring room {code}</h1>
          <p>Loading the latest players, scores, and drawing.</p>
        </section>
      </main>
    );
  }

  switch (room.phase) {
    case "lobby":
      return <LobbyScreen />;
    case "selecting":
      return <WordSelectionScreen room={room} />;
    case "drawing":
      return <GameScreen room={room} />;
    case "turn-results":
      return <TurnResultsScreen room={room} />;
    case "final-results":
      return <FinalResultsScreen room={room} />;
  }
}

export function CurrentRoleSummary() {
  const player = useRoomStore(selectCurrentPlayer);
  const isDrawer = useRoomStore(selectIsDrawer);
  const isHost = useRoomStore(selectIsHost);
  return (
    <span className="sr-only">
      {player?.name}: {isHost ? "host" : "guest"},{" "}
      {isDrawer ? "drawing" : "guessing"}.
    </span>
  );
}
