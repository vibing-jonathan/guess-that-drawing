import {
  isValidRoomCode,
  type DrawingEnvelope,
  type DrawingOp,
  type PhoneActivePhase,
  type PhoneDrawingEnvelope,
  type PhonePrompt as PhonePromptValue,
  type PhoneStoryEntry,
  type PlayerPublic,
  type PlayerRoomSnapshot,
} from "@gtd/contracts";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useNavigate, useParams } from "react-router";

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
  toContractDrawingOp,
  type DrawingOperation,
} from "../canvas";
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

type ClassicGameRoom = Exclude<
  PlayerRoomSnapshot,
  { mode: "phone" }
>;
type PhoneGameRoom = Extract<
  PlayerRoomSnapshot,
  { mode: "phone" }
>;
type PhoneActiveRoom = Extract<
  PhoneGameRoom,
  {
    phase:
      | "phone-writing"
      | "phone-drawing-1"
      | "phone-guessing"
      | "phone-drawing-2";
  }
>;
type PhoneSummaryRoom = Extract<
  PhoneGameRoom,
  { phase: "phone-summary" }
>;
type PhoneCompleteRoom = Extract<
  PhoneGameRoom,
  { phase: "final-results" }
>;

function WordSelectionDialog({
  room,
  turnId,
}: {
  room: ClassicGameRoom;
  turnId: string;
}) {
  const [choice, setChoice] = useState<number>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const choices =
    room.privateRound?.turnId === turnId
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
  }, [choices.length, turnId]);

  async function confirmChoice() {
    if (choice === undefined) return;
    setPending(true);
    setError(undefined);
    try {
      await roomController.selectWord(turnId, choice);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to select that word.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
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
            <span className="eyebrow">You’re drawing</span>
            <h2 id="word-select-title">Choose a word</h2>
            <p id="word-select-description">
              The other players will only see the letter count.
            </p>
          </div>
          <Timer
            seconds={seconds}
            total={room.settings.wordSelectionSeconds}
            label="seconds to choose a word"
            audible={false}
          />
        </div>
        {error ? (
          <Banner tone="danger" title="Selection failed" role="alert">
            {error}
          </Banner>
        ) : null}
        {choices.length ? (
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
              <strong>Loading your word choices</strong>
              <span>Your private choices will appear here.</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function GameScreen({
  room,
  frozen = false,
}: {
  room: ClassicGameRoom;
  frozen?: boolean;
}) {
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
    frozen ||
    room.phase !== "drawing" ||
    connection !== "connected" ||
    sync !== "synced" ||
    drawingSync === "gap" ||
    drawingSync === "replaying" ||
    round.pausedUntil !== null;
  const self = room.players.find((player) => player.id === room.selfPlayerId);
  const drawer = room.players.find((player) => player.id === round.drawerId);
  const selecting = room.phase === "selecting";
  const showWordDialog = selecting && isDrawer && !frozen;
  const pageRole =
    room.phase === "drawing"
      ? isDrawer
        ? "drawer"
        : self?.hasGuessed
          ? "guessed"
          : "guesser"
      : selecting
        ? "selecting"
        : "handoff";
  const liveMessage = selecting
    ? drawer
      ? `${drawer.name} is choosing a word.`
      : "Word selection is in progress."
    : correctEvents.at(-1)
      ? `${correctEvents.at(-1)!.playerName} guessed correctly.`
      : isDrawer
        ? "You are drawing."
        : "Enter your guess.";

  return (
    <>
      <main
        id="main-content"
        className={`game-page game-page--${pageRole}`}
        aria-labelledby="game-heading"
        aria-busy={frozen}
        inert={frozen || showWordDialog}
      >
      <h1 id="game-heading" className="sr-only">
        {selecting
          ? "Word selection game room"
          : isDrawer
            ? "Active drawer game room"
            : self?.hasGuessed
              ? "Already-guessed game room"
              : "Active guesser game room"}
      </h1>
      <div className="game-live sr-only" aria-live="polite">
        {liveMessage}
      </div>
      <NetworkBanner round={round} />
      <div className="game-shell">
        <PlayersPanel
          players={room.players}
          selfId={room.selfPlayerId}
          ranked
          activeDrawerId={
            selecting || room.phase === "drawing" ? round.drawerId : null
          }
          {...(selecting || room.phase === "drawing"
            ? {
                activeDrawerStatus: round.pausedUntil
                  ? ("Reconnecting" as const)
                  : selecting
                    ? ("Choosing" as const)
                    : ("Drawing" as const),
              }
            : {})}
        />
        <section
          className="play-column"
          aria-label={selecting ? "Word selection turn" : "Current drawing turn"}
        >
          <GameStatusBar room={room} isDrawer={isDrawer} />
          <CanvasBoard
            turnId={round.turnId}
            editable={isDrawer && room.phase === "drawing"}
            disabled={disabled}
            initialOperations={operations}
          />
          {room.phase === "drawing" && !isDrawer ? (
            <div className="guesser-action-row">
              <GuessFeedbackBanner
                turnId={round.turnId}
                pro={room.mode === "pro"}
              />
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
      {showWordDialog ? (
        <WordSelectionDialog
          key={round.turnId}
          room={room}
          turnId={round.turnId}
        />
      ) : null}
    </>
  );
}

function scoreDelta(player: PlayerPublic, room: ClassicGameRoom): number {
  return (
    roomStore
      .getState()
      .lastTurnResult?.scoreChanges.filter(
        (change) => change.playerId === player.id,
      )
      .reduce((total, change) => total + change.delta, 0) ?? 0
  );
}

function Leaderboard({
  room,
  final,
}: {
  room: ClassicGameRoom;
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
              <span
                className={`leaderboard__delta numeric ${
                  delta < 0 ? "leaderboard__delta--negative" : ""
                }`}
              >
                {delta > 0 ? `+${delta}` : `${delta}`.replace("-", "−")}
              </span>
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

const PHONE_PHASE_CONTENT: Record<
  PhoneActivePhase,
  {
    number: number;
    title: string;
    instruction: string;
    action: string;
    timer: "text" | "drawing";
  }
> = {
  "phone-writing": {
    number: 1,
    title: "Write the opening",
    instruction: "Write one clear scene that another player can draw.",
    action: "Submit sentence",
    timer: "text",
  },
  "phone-drawing-1": {
    number: 2,
    title: "Draw the prompt",
    instruction: "Turn the assigned sentence into a drawing.",
    action: "Submit drawing",
    timer: "drawing",
  },
  "phone-guessing": {
    number: 3,
    title: "Guess the drawing",
    instruction: "Describe what you think the assigned drawing says.",
    action: "Submit guess",
    timer: "text",
  },
  "phone-drawing-2": {
    number: 4,
    title: "Draw the guess",
    instruction: "Turn the assigned guess into the final drawing.",
    action: "Submit drawing",
    timer: "drawing",
  },
};

function phoneDrawingOperations(
  envelopes: readonly PhoneDrawingEnvelope[],
  canvasId: string,
): DrawingEnvelope[] {
  return envelopes.map((envelope) => ({
    turnId: canvasId,
    strokeId: envelope.strokeId,
    chunkId: envelope.chunkId,
    serverSequence: envelope.serverSequence,
    operation: envelope.operation,
  }));
}

function PhonePhaseProgress({ active }: { active: number }) {
  const labels = ["Write", "Draw", "Guess", "Draw"];
  return (
    <ol className="phone-phase-progress" aria-label={`Phase ${active} of 4`}>
      {labels.map((label, index) => (
        <li
          key={`${label}-${index}`}
          className={
            index + 1 === active
              ? "is-current"
              : index + 1 < active
                ? "is-complete"
                : ""
          }
        >
          <span className="numeric">{index + 1}</span>
          <strong>{label}</strong>
          {index + 1 < active ? <Icon name="check" size={15} /> : null}
        </li>
      ))}
    </ol>
  );
}

function PhoneRoster({ room }: { room: PhoneActiveRoom }) {
  const statusLabel = {
    working: "Working",
    submitted: "Submitted",
    skipped: "Skipped",
    disconnected: "Disconnected",
  } as const;
  const statusTone = {
    working: "primary",
    submitted: "success",
    skipped: "warning",
    disconnected: "danger",
  } as const;
  return (
    <Panel className="phone-roster" aria-labelledby="phone-players-title">
      <div className="split panel__heading">
        <h2 id="phone-players-title">Players</h2>
        <span className="numeric muted">
          {room.phone.submittedCount}/{room.phone.totalCount}
        </span>
      </div>
      <ul>
        {room.phone.participants.map((participant) => (
          <li
            key={participant.playerId}
            className={
              participant.playerId === room.selfPlayerId
                ? "is-you"
                : ""
            }
          >
            <Avatar
              name={participant.playerName}
              config={participant.avatar}
              size={40}
            />
            <div>
              <strong>
                {participant.playerName}
                {participant.playerId === room.selfPlayerId
                  ? " · You"
                  : ""}
              </strong>
              <span>Phone participant</span>
            </div>
            <StatusBadge tone={statusTone[participant.status]}>
              {statusLabel[participant.status]}
            </StatusBadge>
          </li>
        ))}
      </ul>
      <p className="phone-roster__note">
        Prompts and authors remain private until the synchronized reveal.
      </p>
    </Panel>
  );
}

function PhonePrompt({
  label,
  children,
}: {
  label: string;
  children: string;
}) {
  return (
    <section className="phone-private-prompt" aria-label={label}>
      <div>
        <span className="eyebrow">{label}</span>
        <strong>{children}</strong>
      </div>
      <StatusBadge icon="lock">Author hidden</StatusBadge>
    </section>
  );
}

function PhoneAssignedPrompt({
  assignmentId,
  prompt,
}: {
  assignmentId: string;
  prompt: PhonePromptValue | null;
}) {
  if (!prompt) {
    return (
      <PhonePrompt label="No earlier prompt">
        No earlier valid prompt was submitted. Create a continuation from your
        imagination.
      </PhonePrompt>
    );
  }

  if (prompt.kind === "text") {
    return (
      <PhonePrompt label="Latest valid sentence">{prompt.text}</PhonePrompt>
    );
  }

  return (
    <>
      <PhonePrompt label="Latest valid drawing">
        Continue from the private drawing shown below
      </PhonePrompt>
      <div className="phone-assigned-canvas">
        <CanvasBoard
          turnId={`${assignmentId}-prompt`}
          editable={false}
          disabled={false}
          initialOperations={phoneDrawingOperations(
            prompt.envelopes,
            `${assignmentId}-prompt`,
          )}
          subscribeToRoomDrawing={false}
        />
      </div>
    </>
  );
}

function PhoneWaitingState({
  room,
  title = "Submitted",
}: {
  room: PhoneActiveRoom;
  title?: string;
}) {
  return (
    <div className="phone-submitted-state" role="status">
      <Icon name="checkCircle" size={24} />
      <div>
        <strong>{title}</strong>
        <span>
          Your link is locked. {room.phone.submittedCount} of{" "}
          {room.phone.totalCount} players have submitted.
        </span>
      </div>
    </div>
  );
}

function PhonePhaseScreen({ room }: { room: PhoneActiveRoom }) {
  const phase = PHONE_PHASE_CONTENT[room.phase];
  const assignment = room.privatePhone;
  const connection = useRoomStore((state) => state.connectionStatus);
  const seconds = useCountdown(room.phone.deadline);
  const total =
    phase.timer === "text"
      ? room.settings.textSeconds
      : room.settings.drawingSeconds;
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const draftOperations = useMemo(
    () =>
      assignment?.draft
        ? phoneDrawingOperations(
            assignment.draft.envelopes,
            assignment.assignmentId,
          )
        : [],
    [assignment?.assignmentId, assignment?.draft],
  );
  const [hasVisibleDrawing, setHasVisibleDrawing] = useState(
    draftOperations.some(
      ({ operation }) =>
        operation.kind === "stroke" || operation.kind === "shape",
    ),
  );
  const textArea = useRef<HTMLTextAreaElement>(null);
  const phaseHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setText("");
    setError(undefined);
    setPending(false);
    setHasVisibleDrawing(
      draftOperations.some(
        ({ operation }) =>
          operation.kind === "stroke" || operation.kind === "shape",
      ),
    );
    if (
      room.phase === "phone-writing" ||
      room.phase === "phone-guessing"
    ) {
      textArea.current?.focus();
    } else {
      phaseHeading.current?.focus();
    }
  }, [assignment?.assignmentId, draftOperations, room.phase]);

  const sendDrawingOperation = useCallback(
    async (operation: DrawingOperation) => {
      if (!assignment) return;
      await roomController.sendPhoneDrawingBatch({
        assignmentId: assignment.assignmentId,
        strokeId: operation.strokeId,
        chunkId: operation.chunkId,
        operations: [toContractDrawingOp(operation) as DrawingOp],
      });
    },
    [assignment?.assignmentId],
  );
  const recoverDrawing = useCallback(
    () => roomController.requestSnapshot(),
    [],
  );
  const updateDrawingActions = useCallback((actionCount: number) => {
    setHasVisibleDrawing(actionCount > 0);
  }, []);

  const submitted = assignment?.submitted ?? false;
  const disconnected = connection !== "connected";
  const textPhase =
    room.phase === "phone-writing" || room.phase === "phone-guessing";
  const drawingPhase = !textPhase;
  const trimmed = text.trim();
  const canSubmit =
    Boolean(assignment) &&
    !submitted &&
    !pending &&
    !disconnected &&
    (textPhase
      ? trimmed.length >= 1 && trimmed.length <= 180
      : hasVisibleDrawing);

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    if (!assignment || !canSubmit) return;
    setPending(true);
    setError(undefined);
    try {
      if (textPhase) {
        await roomController.submitPhoneText(
          assignment.assignmentId,
          trimmed,
        );
      } else {
        await roomController.submitPhoneDrawing(assignment.assignmentId);
      }
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Your private entry was not submitted.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      id="main-content"
      className={`phone-page phone-page--${room.phase}`}
      aria-labelledby="phone-phase-title"
      data-phone-excludes="chat scores"
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Phase {phase.number} of 4. {phase.title}. {seconds} seconds remain.
      </div>
      {disconnected ? (
        <Banner
          tone="warning"
          icon="refresh"
          title="Reconnecting to the Phone round"
        >
          Your confirmed drawing draft is preserved. Submission unlocks after
          the assignment and authoritative timer are synchronized.
        </Banner>
      ) : null}
      {assignment && assignment.skippedEntryCount > 0 ? (
        <Banner
          tone="warning"
          icon="alert"
          title={`${assignment.skippedEntryCount} skipped ${
            assignment.skippedEntryCount === 1 ? "step" : "steps"
          } · continue this task`}
        >
          The most recent valid prompt is shown below. The skipped link stays
          recorded and the current deadline is unchanged.
        </Banner>
      ) : null}
      {error ? (
        <Banner tone="danger" title="Submission failed" role="alert">
          {error}
        </Banner>
      ) : null}
      <div className="phone-shell">
        <PhoneRoster room={room} />
        <section className="phone-play-column" aria-label={phase.title}>
          <header className="phone-phase-header">
            <div>
              <h1
                ref={phaseHeading}
                id="phone-phase-title"
                tabIndex={-1}
              >
                {phase.title}
              </h1>
              <span className="phone-phase-meta">
                Phone Mode · Phase {phase.number} of 4
              </span>
              <p>{phase.instruction}</p>
            </div>
            <div className="phone-authority">
              <Timer
                seconds={seconds}
                total={total}
                label="seconds remaining on the shared server timer"
              />
              <StatusBadge
                tone={disconnected ? "warning" : "success"}
                icon={disconnected ? "refresh" : "wifi"}
              >
                {disconnected ? "Resyncing" : "Shared deadline"}
              </StatusBadge>
            </div>
          </header>
          <PhonePhaseProgress active={phase.number} />
          {!assignment ? (
            <div className="waiting-status" role="status">
              <Icon name="refresh" size={22} />
              <div>
                <strong>Restoring your private assignment</strong>
                <span>The room timer continues while we synchronize.</span>
              </div>
            </div>
          ) : room.phase === "phone-writing" ? (
            <form
              className="phone-writing-surface"
              onSubmit={(event) => void submit(event)}
            >
              <div className="split">
                <h2>Your opening sentence</h2>
                <span className="phone-character-count numeric">
                  {trimmed.length}/180
                </span>
              </div>
              <label htmlFor="phone-text-entry">
                Write one clear, drawable scene
              </label>
              <textarea
                ref={textArea}
                id="phone-text-entry"
                value={text}
                maxLength={180}
                rows={5}
                disabled={submitted || pending || disconnected}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    void submit();
                  }
                }}
              />
            </form>
          ) : (
            <>
              <PhoneAssignedPrompt
                assignmentId={assignment.assignmentId}
                prompt={assignment.prompt}
              />
              {room.phase === "phone-guessing" ? (
                <form
                  className="phone-guess-composer"
                  onSubmit={(event) => void submit(event)}
                >
                  <div className="split">
                    <h2>What does this prompt say?</h2>
                    <span className="phone-character-count numeric">
                      {trimmed.length}/180
                    </span>
                  </div>
                  <label htmlFor="phone-text-entry">
                    Your private guess
                  </label>
                  <textarea
                    ref={textArea}
                    id="phone-text-entry"
                    value={text}
                    maxLength={180}
                    rows={3}
                    disabled={submitted || pending || disconnected}
                    onChange={(event) => setText(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.ctrlKey || event.metaKey)
                      ) {
                        void submit();
                      }
                    }}
                  />
                </form>
              ) : drawingPhase ? (
                <div className="phone-drawing-canvas">
                  <CanvasBoard
                    key={`${assignment.assignmentId}:${
                      assignment.draft?.acceptedThroughSequence ?? 0
                    }`}
                    turnId={assignment.assignmentId}
                    editable
                    disabled={submitted || pending || disconnected}
                    initialOperations={draftOperations}
                    sendOperation={sendDrawingOperation}
                    recover={recoverDrawing}
                    subscribeToRoomDrawing={false}
                    onActionCountChange={updateDrawingActions}
                  />
                </div>
              ) : null}
            </>
          )}
          {submitted ? (
            <PhoneWaitingState room={room} />
          ) : (
            <div className="phone-submit-row">
              <span>
                <Icon name="lock" size={17} /> Private submission · author
                hidden
              </span>
              <Button
                icon="arrowRight"
                disabled={!canSubmit}
                onClick={() => void submit()}
              >
                {pending ? "Submitting…" : phase.action}
              </Button>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function PhoneStoryEntryView({
  entry,
  index,
}: {
  entry: PhoneStoryEntry;
  index: number;
}) {
  return (
    <li className={`story-entry story-entry--${entry.kind}`}>
      <div className="story-entry__meta">
        <span className="numeric">Item {index + 1} of 4</span>
        <strong>
          {entry.author.playerName}{" "}
          {entry.kind === "drawing"
            ? "drew"
            : entry.kind === "text"
              ? entry.phase === "phone-writing"
                ? "wrote"
                : "guessed"
              : "could not contribute"}
        </strong>
      </div>
      {entry.kind === "text" ? (
        <blockquote>{entry.text}</blockquote>
      ) : entry.kind === "drawing" ? (
        <div className="story-entry__drawing">
          <CanvasBoard
            turnId={entry.id}
            editable={false}
            disabled={false}
            initialOperations={phoneDrawingOperations(
              entry.envelopes,
              entry.id,
            )}
            subscribeToRoomDrawing={false}
          />
        </div>
      ) : (
        <Banner tone="warning" icon="alert" title="Skipped link">
          No entry was submitted before this phase ended.
        </Banner>
      )}
    </li>
  );
}

function PhoneSummaryScreen({ room }: { room: PhoneSummaryRoom }) {
  const self = room.players.find(
    (player) => player.id === room.selfPlayerId,
  );
  const isHost = self?.isHost ?? false;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const summaryHeading = useRef<HTMLHeadingElement>(null);
  const last =
    room.phone.cursor.storyIndex === room.phone.storyCount - 1 &&
    room.phone.cursor.entryIndex === 3;

  useEffect(() => {
    summaryHeading.current?.focus();
  }, [room.phone.matchId]);

  async function navigate(action: "previous" | "next" | "finish") {
    setPending(true);
    setError(undefined);
    try {
      await roomController.navigatePhoneSummary(action);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The story reveal could not move.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      id="main-content"
      className="phone-summary-page"
      aria-labelledby="phone-summary-title"
    >
      <header className="phone-summary-heading">
        <div>
          <span className="eyebrow">Phone Mode · Story summary</span>
          <h1
            ref={summaryHeading}
            id="phone-summary-title"
            tabIndex={-1}
          >
            Story {room.phone.cursor.storyIndex + 1} of{" "}
            {room.phone.storyCount}
          </h1>
          <p>
            {isHost
              ? "Reveal one link at a time. Everyone stays synchronized to your controls."
              : "The host is revealing this story. Your view follows automatically."}
          </p>
        </div>
        <StatusBadge tone="success" icon="wifi">
          Synchronized
        </StatusBadge>
      </header>
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        Story {room.phone.cursor.storyIndex + 1} of {room.phone.storyCount},
        item {room.phone.cursor.entryIndex + 1} of 4 revealed.
      </div>
      {error ? (
        <Banner tone="danger" title="Reveal failed" role="alert">
          {error}
        </Banner>
      ) : null}
      <ol className="story-timeline">
        {room.phone.storyline.entries.map((entry, index) => (
          <PhoneStoryEntryView
            key={entry.id}
            entry={entry}
            index={index}
          />
        ))}
      </ol>
      {isHost ? (
        <div className="story-host-controls" aria-label="Story controls">
          <Button
            variant="secondary"
            icon="arrowLeft"
            disabled={
              pending ||
              (room.phone.cursor.storyIndex === 0 &&
                room.phone.cursor.entryIndex === 0)
            }
            onClick={() => void navigate("previous")}
          >
            Previous
          </Button>
          <span className="numeric">
            {room.phone.cursor.entryIndex + 1}/4
          </span>
          <Button
            icon={last ? "check" : "arrowRight"}
            disabled={pending}
            onClick={() => void navigate(last ? "finish" : "next")}
          >
            {pending
              ? "Synchronizing…"
              : last
                ? "Finish summary"
                : "Reveal next"}
          </Button>
        </div>
      ) : (
        <div className="story-guest-waiting" role="status">
          <Icon name="clock" size={24} />
          <div>
            <strong>Waiting for the host</strong>
            <span>
              Only the host can move backward, reveal the next link, or finish.
            </span>
          </div>
        </div>
      )}
    </main>
  );
}

function PhoneCompletionScreen({ room }: { room: PhoneCompleteRoom }) {
  const navigate = useNavigate();
  const isHost =
    room.players.find((player) => player.id === room.selfPlayerId)?.isHost ??
    false;
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const completionHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    completionHeading.current?.focus();
  }, [room.phone.matchId]);
  async function playAgain() {
    setPending(true);
    setError(undefined);
    try {
      await roomController.startMatch();
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start another Phone round.",
      );
      setPending(false);
    }
  }
  return (
    <main
      id="main-content"
      className="phone-completion-page page-shell"
      aria-labelledby="phone-completion-title"
    >
      <section className="phone-completion-copy">
        <span className="winner-mark">
          <Icon name="checkCircle" size={44} />
        </span>
        <h1
          ref={completionHeading}
          id="phone-completion-title"
          tabIndex={-1}
        >
          Every story found an ending
        </h1>
        <p className="completion-meta">Phone Mode complete</p>
        <p className="lede">
          There is no leaderboard in Phone Mode. Start fresh private chains or
          leave the room.
        </p>
      </section>
      <Panel className="rematch-panel" aria-labelledby="phone-rematch-title">
        <div className="split panel__heading">
          <h2 id="phone-rematch-title">Next round</h2>
          <StatusBadge
            tone={isHost ? "primary" : "warning"}
            icon={isHost ? "crown" : "clock"}
          >
            {isHost ? "Host controls" : "Waiting for host"}
          </StatusBadge>
        </div>
        {error ? (
          <Banner tone="danger" title="Rematch failed" role="alert">
            {error}
          </Banner>
        ) : null}
        {isHost ? (
          <div className="final-actions">
            <Button
              icon="refresh"
              disabled={pending}
              onClick={() => void playAgain()}
            >
              {pending ? "Starting…" : "Play again"}
            </Button>
            <Button
              variant="quiet"
              icon="logOut"
              onClick={() => void leaveRoom(navigate)}
            >
              Leave room
            </Button>
          </div>
        ) : (
          <>
            <div className="story-guest-waiting" role="status">
              <Icon name="clock" size={24} />
              <div>
                <strong>Waiting for the host</strong>
                <span>The host decides whether to play again.</span>
              </div>
            </div>
            <Button
              variant="quiet"
              icon="logOut"
              onClick={() => void leaveRoom(navigate)}
            >
              Leave room
            </Button>
          </>
        )}
      </Panel>
    </main>
  );
}

function FinalResultsScreen({ room }: { room: ClassicGameRoom }) {
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
        <h1 id="final-title">
          {winner ? `${winner.name} takes the table` : "Game complete"}
        </h1>
        <p className="completion-meta">
          {room.settings.drawingCycles} cycles complete
        </p>
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

  if (room.mode === "phone") {
    switch (room.phase) {
      case "lobby":
        return <LobbyScreen />;
      case "phone-writing":
      case "phone-drawing-1":
      case "phone-guessing":
      case "phone-drawing-2":
        return <PhonePhaseScreen room={room} />;
      case "phone-summary":
        return <PhoneSummaryScreen room={room} />;
      case "final-results":
        return <PhoneCompletionScreen room={room} />;
    }
  }

  switch (room.phase) {
    case "lobby":
      return <LobbyScreen />;
    case "selecting":
    case "drawing":
      return <GameScreen room={room} />;
    case "turn-results":
      return <GameScreen room={room} frozen />;
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
