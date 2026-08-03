import type {
  ClassicPlayerRoomSnapshot,
  GuessFeedback,
  ProPlayerRoomSnapshot,
  RoundPublic,
} from "@gtd/contracts";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { roomController } from "../realtime/runtime";
import { useRoomStore } from "../state/room-store";
import { playGameSound } from "./game-audio";
import {
  Banner,
  Button,
  Icon,
  IconButton,
  Panel,
  PlayersPanel,
  StatusBadge,
} from "./primitives";

type ClassicGameRoom =
  | ClassicPlayerRoomSnapshot
  | ProPlayerRoomSnapshot;

export function useCountdown(deadline: number | null): number {
  const [now, setNow] = useState(Date.now());
  const serverClockOffsetMs = useRoomStore(
    (state) => state.serverClockOffsetMs,
  );
  useEffect(() => {
    if (!deadline) return;
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(timer);
  }, [deadline]);
  return deadline
    ? Math.max(
        0,
        Math.ceil((deadline - (now + serverClockOffsetMs)) / 1_000),
      )
    : 0;
}

export function Timer({
  seconds,
  total,
  label = "seconds remaining",
  audible = true,
}: {
  seconds: number;
  total: number;
  label?: string;
  audible?: boolean;
}) {
  const previousSecondsRef = useRef(seconds);
  const urgent = seconds <= 5;
  const warning = seconds <= 10 && !urgent;

  useEffect(() => {
    const previousSeconds = previousSecondsRef.current;
    previousSecondsRef.current = seconds;
    if (
      !audible ||
      seconds >= previousSeconds ||
      seconds < 1 ||
      seconds > 5
    ) {
      return;
    }
    playGameSound(seconds === 1 ? "timerFinal" : "timerTick");
  }, [audible, seconds]);

  return (
    <div
      className={`timer ${urgent ? "timer--urgent" : warning ? "timer--warning" : ""}`}
      aria-label={`${seconds} ${label}`}
    >
      <Icon name={urgent ? "alert" : "clock"} size={20} />
      <strong key={urgent ? seconds : "steady"} className="numeric">
        {seconds}
      </strong>
      <span className="timer__unit">sec</span>
      <span className="timer__track" aria-hidden="true">
        <span
          style={{
            inlineSize: `${Math.max(0, Math.min(100, (seconds / total) * 100))}%`,
          }}
        />
      </span>
    </div>
  );
}

function WordDisplay({
  room,
  isDrawer,
}: {
  room: ClassicGameRoom;
  isDrawer: boolean;
}) {
  const answer =
    isDrawer && room.privateRound?.turnId === room.round?.turnId
      ? room.privateRound?.answer
      : null;
  if (answer) {
    return (
      <div className="word-display word-display--drawer">
        <span>Your word</span>
        <strong>{answer}</strong>
      </div>
    );
  }
  const mask = room.round?.wordMask;
  const drawer = room.players.find(
    (player) => player.id === room.round?.drawerId,
  );
  const selectionLabel = isDrawer
    ? "Choose your word"
    : drawer
      ? `${drawer.name} is choosing a word`
      : "Word choice in progress";
  return (
    <div
      className="word-display"
      aria-label={
        mask
          ? `${mask.words} ${mask.words === 1 ? "word" : "words"}, ${mask.letters} letters`
          : selectionLabel
      }
    >
      <span>
        {mask
          ? `${mask.words === 1 ? "One word" : `${mask.words} words`} · ${mask.letters} letters`
          : selectionLabel}
      </span>
      <strong aria-hidden="true">{mask?.pattern ?? "•••"}</strong>
    </div>
  );
}

export function GameStatusBar({
  room,
  isDrawer,
}: {
  room: ClassicGameRoom;
  isDrawer: boolean;
}) {
  const round = room.round;
  const deadline = round?.pausedUntil
    ? round.pausedUntil
    : round?.phase === "selecting"
      ? round.selectionDeadline
      : round?.drawingDeadline;
  const seconds = useCountdown(deadline ?? null);
  const total = round?.pausedUntil
    ? 20
    : round?.phase === "selecting"
      ? room.settings.wordSelectionSeconds
      : room.settings.turnSeconds;
  const connection = useRoomStore((state) => state.connectionStatus);
  const drawer = room.players.find(
    (player) => player.id === room.round?.drawerId,
  );
  return (
    <header className="game-statusbar" data-od-id="game-status">
      <div className="round-context">
        <span className="eyebrow">
          Cycle {round?.cycle ?? 1} of {round?.cycleCount ?? room.settings.drawingCycles}
        </span>
        <strong>
          Turn {round?.turn ?? 1}
          {drawer
            ? ` · ${drawer.name} ${
                round?.phase === "selecting" ? "chooses" : "draws"
              }`
            : ""}
        </strong>
      </div>
      <WordDisplay room={room} isDrawer={isDrawer} />
      <Timer
        seconds={seconds}
        total={total}
        {...(round?.pausedUntil
          ? { label: "seconds until drawer is skipped" }
          : {})}
      />
      <StatusBadge
        tone={connection === "connected" ? "success" : "warning"}
        icon={connection === "connected" ? "wifi" : "wifiOff"}
      >
        {connection === "connected"
          ? "Connected"
          : connection === "recovering"
            ? "Resyncing"
            : "Offline"}
      </StatusBadge>
    </header>
  );
}

export function NetworkBanner({ round }: { round: RoundPublic }) {
  const connection = useRoomStore((state) => state.connectionStatus);
  const message = useRoomStore((state) => state.connectionMessage);
  const sync = useRoomStore((state) => state.syncStatus);
  const drawingSync = useRoomStore((state) => state.drawingSyncStatus);
  if (round.pausedUntil) {
    return (
      <Banner
        tone="danger"
        icon="wifiOff"
        title="Drawer disconnected · round paused"
        role="alert"
      >
        The synchronized canvas remains visible while the drawer has a brief
        chance to reconnect.
      </Banner>
    );
  }
  if (
    connection === "recovering" ||
    sync === "resyncing" ||
    drawingSync === "replaying"
  ) {
    return (
      <Banner
        tone="warning"
        icon="refresh"
        title="Reconnecting and resyncing"
      >
        {message ?? "Restoring the latest confirmed scores and drawing."}
      </Banner>
    );
  }
  if (sync === "desynced" || drawingSync === "gap") {
    return (
      <Banner
        tone="warning"
        icon="refresh"
        title="A newer room state is available"
        actions={
          <Button
            variant="secondary"
            icon="refresh"
            onClick={() => void roomController.requestSnapshot()}
          >
            Apply latest state
          </Button>
        }
      >
        Apply the server’s latest confirmed room and canvas state.
      </Banner>
    );
  }
  if (connection === "offline" || connection === "outage") {
    return (
      <Banner
        tone="danger"
        icon="cloudOff"
        title="The game server is unavailable"
        role="alert"
      >
        New drawing strokes and guesses are disabled until the connection is
        restored.
      </Banner>
    );
  }
  return null;
}

function signedDelta(value: number): string {
  return value > 0 ? `+${value}` : `${value}`.replace("-", "−");
}

function feedbackBanner(
  feedback: GuessFeedback | null,
  showIncorrect: boolean,
) {
  if (
    !feedback ||
    (feedback.kind === "incorrect" && !showIncorrect)
  ) {
    return null;
  }
  return (
    <Banner
      tone={
        feedback.kind === "correct"
          ? "success"
          : feedback.kind === "incorrect"
            ? "danger"
            : "warning"
      }
      icon={
        feedback.kind === "correct"
          ? "checkCircle"
          : feedback.kind === "incorrect"
            ? "alert"
            : "lightbulb"
      }
      title={
        feedback.kind === "correct"
          ? "You got it"
          : feedback.kind === "incorrect"
            ? `${signedDelta(feedback.scoreDelta)} points`
            : "Very close"
      }
      privateNote="Only you can see this."
    >
      {feedback.message}
    </Banner>
  );
}

export function GuessFeedbackBanner({
  turnId,
  pro = false,
}: {
  turnId: string;
  pro?: boolean;
}) {
  const feedback = useRoomStore((state) => state.latestGuessFeedback);
  return feedback?.turnId === turnId
    ? feedbackBanner(feedback, pro)
    : null;
}

export function ChatPanel({
  room,
  isDrawer,
  compact = false,
}: {
  room: ClassicGameRoom;
  isDrawer: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  const currentPlayer = room.players.find(
    (player) => player.id === room.selfPlayerId,
  );
  const allCorrectEvents = useRoomStore(
    (state) => state.correctGuessEvents,
  );
  const correctEvents = useMemo(
    () =>
      allCorrectEvents.filter(
        (event) => event.turnId === room.round?.turnId,
      ),
    [allCorrectEvents, room.round?.turnId],
  );
  const disabled =
    isDrawer ||
    room.round?.pausedUntil !== null ||
    pending ||
    !room.round ||
    room.phase !== "drawing";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim() || disabled || !room.round) return;
    const next = text.trim();
    setText("");
    setPending(true);
    setError(undefined);
    try {
      await roomController.submitGuess(room.round.turnId, next);
    } catch (caught) {
      setText(next);
      setError(
        caught instanceof Error ? caught.message : "Your guess was not sent.",
      );
    } finally {
      setPending(false);
    }
  }

  const messages = useMemo(
    () => [...room.chat].sort((a, b) => a.createdAt - b.createdAt),
    [room.chat],
  );

  return (
    <Panel
      className={`chat-panel ${compact ? "chat-panel--compact" : ""}`}
      aria-labelledby={compact ? "mobile-chat-title" : "chat-title"}
    >
      <div className="split panel__heading">
        <h2 id={compact ? "mobile-chat-title" : "chat-title"}>
          Guesses & chat
        </h2>
        <StatusBadge icon="users">
          {room.players.filter((player) => player.isConnected).length} here
        </StatusBadge>
      </div>
      <div
        className="chat-log"
        role="log"
        aria-label="Public room messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {correctEvents.map((event) => (
          <div
            key={`${event.turnId}-${event.playerId}`}
            className="chat-event"
          >
            <Icon name="checkCircle" size={16} />
            <span>
              <strong>{event.playerName}</strong> guessed the word.
            </span>
          </div>
        ))}
        {messages.length ? (
          messages.map((message) => (
            <div
              key={message.id}
              className={`chat-message ${
                message.playerId === room.selfPlayerId
                  ? "chat-message--own"
                  : ""
              }`}
            >
              <strong>{message.playerName}</strong>
              <span>{message.text}</span>
              <time>
                {new Date(message.createdAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </time>
            </div>
          ))
        ) : (
          <p className="chat-empty">No guesses yet. Be the first.</p>
        )}
      </div>
      {error ? (
        <p className="field__message chat-error" role="alert">
          <Icon name="alert" size={16} /> {error}
        </p>
      ) : null}
      {room.mode === "pro" && !isDrawer ? (
        <div className="pro-rule-note" role="note">
          <Icon name="alert" size={18} />
          <span>
            <strong>Pro rule:</strong> an incorrect guess costs up to 25
            points. Close guesses are safe.
          </span>
        </div>
      ) : null}
      {room.phase === "selecting" ? (
        <div className="composer composer--disabled" role="status">
          <Icon name="clock" size={20} />
          <div>
            <strong>Word choice in progress</strong>
            <span>Guessing opens as soon as the word is ready.</span>
          </div>
        </div>
      ) : isDrawer ? (
        <div className="composer composer--disabled">
          <Icon name="lock" size={20} />
          <div>
            <strong>Chat is paused while you draw</strong>
            <span>Keep the word secret until the turn ends.</span>
          </div>
        </div>
      ) : currentPlayer?.hasGuessed ? (
        <form className="composer" onSubmit={submit}>
          <label htmlFor={compact ? "mobile-guess-input" : "guess-input"}>
            Chat after guessing
          </label>
          <div className="composer__row">
            <input
              id={compact ? "mobile-guess-input" : "guess-input"}
              value={text}
              maxLength={180}
              placeholder="Keep the answer secret"
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              data-testid={compact ? "mobile-guess-composer" : "guess-composer"}
            />
            <IconButton
              icon="send"
              label="Send message"
              type="submit"
              disabled={!text.trim() || disabled}
            />
          </div>
        </form>
      ) : (
        <form className="composer" onSubmit={submit}>
          <label htmlFor={compact ? "mobile-guess-input" : "guess-input"}>
            Your guess
          </label>
          <div className="composer__row">
            <input
              id={compact ? "mobile-guess-input" : "guess-input"}
              value={text}
              maxLength={180}
              placeholder="Type a guess"
              disabled={disabled}
              onChange={(event) => setText(event.target.value)}
              data-testid={compact ? "mobile-guess-composer" : "guess-composer"}
            />
            <IconButton
              icon="send"
              label="Send guess"
              type="submit"
              disabled={!text.trim() || disabled}
            />
          </div>
        </form>
      )}
    </Panel>
  );
}

export function MobileSupport({
  room,
  isDrawer,
  isHost,
}: {
  room: ClassicGameRoom;
  isDrawer: boolean;
  isHost: boolean;
}) {
  const [sheet, setSheet] = useState<"players" | "chat" | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openSheet = (next: "players" | "chat") => {
    openerRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    setSheet(next);
  };
  useEffect(() => {
    if (!sheet) return;
    const focusable = () =>
      sheetRef.current?.querySelectorAll<HTMLElement>(
        "button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]",
      );
    focusable()?.[0]?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheet(null);
        return;
      }
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls?.length) return;
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
    window.addEventListener("keydown", close);
    return () => {
      window.removeEventListener("keydown", close);
      openerRef.current?.focus();
    };
  }, [sheet]);
  return (
    <>
      <div className="mobile-support-tabs" role="group" aria-label="Game details">
        <Button
          variant="secondary"
          icon="users"
          onClick={() => openSheet("players")}
        >
          Players
        </Button>
        <Button
          variant="secondary"
          icon="menu"
          onClick={() => openSheet("chat")}
        >
          Chat
        </Button>
      </div>
      {sheet ? (
        <div className="sheet-layer">
          <button
            type="button"
            className="sheet-scrim"
            aria-label="Close game details"
            onClick={() => setSheet(null)}
          />
          <section
            ref={sheetRef}
            className="sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-sheet-heading"
          >
            <div className="split sheet__heading">
              <h2 id="mobile-sheet-heading">
                {sheet === "players" ? "Players & scores" : "Guesses & chat"}
              </h2>
              <IconButton
                icon="x"
                label="Close game details"
                onClick={() => setSheet(null)}
              />
            </div>
            {sheet === "players" ? (
              <PlayersPanel
                players={room.players}
                selfId={room.selfPlayerId}
                ranked
                showKick={isHost}
                activeDrawerId={
                  room.phase === "selecting" || room.phase === "drawing"
                    ? (room.round?.drawerId ?? null)
                    : null
                }
                {...(room.phase === "selecting" || room.phase === "drawing"
                  ? {
                      activeDrawerStatus: room.round?.pausedUntil
                        ? ("Reconnecting" as const)
                        : room.phase === "selecting"
                          ? ("Choosing" as const)
                          : ("Drawing" as const),
                    }
                  : {})}
                onKick={(playerId) =>
                  void roomController.kickPlayer(playerId)
                }
              />
            ) : (
              <ChatPanel room={room} isDrawer={isDrawer} compact />
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
