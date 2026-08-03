(() => {
const {
  Avatar: GameAvatar,
  Banner: GameBanner,
  Button: GameButton,
  ChatPanel: GameChatPanel,
  ConfirmDialog: GameConfirmDialog,
  DrawingToolbar: GameDrawingToolbar,
  Leaderboard: GameLeaderboard,
  MaskedWord: GameMaskedWord,
  MobileSupport: GameMobileSupport,
  Panel: GamePanel,
  PlayersPanel: GamePlayersPanel,
  StaticDrawing: GameStaticDrawing,
  StatusBadge: GameStatusBadge,
  Timer: GameTimer
} = window.GTDComponents;
const { Icon: GameIcon } = window.GTDIcons;
const { BASE_PLAYERS: GAME_BASE_PLAYERS } = window.GTDData;
const { useEffect: useGameEffect, useRef: useGameRef, useState: useGameState } = React;

function gamePlayersFor(mode, phase = "drawing", gameMode = "classic", penalty = false) {
  return GAME_BASE_PLAYERS
    .map((player) => {
      const isPenalizedPlayer = gameMode === "pro" && penalty && player.name === "Priya";
      const penaltyAmount = isPenalizedPlayer
        ? Math.min(25, player.score)
        : 0;
      return {
        ...player,
        score: player.score - penaltyAmount,
        delta: isPenalizedPlayer ? (penaltyAmount > 0 ? -penaltyAmount : 0) : undefined,
        isDrawer: player.name === "Maya",
        isYou: mode === "drawer" ? player.name === "Maya" : player.name === "Priya",
        drawerStatus: player.name === "Maya" ? (phase === "selecting" ? "Choosing" : "Drawing") : undefined,
        status: mode === "guessed" && player.name === "Priya" ? "Guessed" : player.status
      };
    })
    .sort((a, b) => b.score - a.score);
}

function GameStatusBar({ mode, phase = "drawing", networkState, gameMode = "classic" }) {
  const isDrawer = mode === "drawer";
  const selecting = phase === "selecting";
  const paused = networkState === "paused";
  const seconds = selecting ? 15 : paused ? 23 : isDrawer ? 64 : 47;
  const total = selecting ? 15 : paused ? 30 : 90;
  const timerLabel = selecting
    ? "seconds for Maya to choose a word"
    : paused
      ? "seconds until round resumes or ends"
      : "seconds remaining";
  return (
    <header className="game-statusbar" data-od-id="game-status">
      <div className="round-context">
        <span className="eyebrow">{gameMode === "pro" ? "Pro · " : ""}Cycle 2 of 3</span>
        <strong>Turn 4 · Maya {selecting ? "chooses" : "draws"}</strong>
      </div>
      {selecting ? (
        <div className="word-display word-display--pending" aria-label="The word has not been chosen yet">
          <span>New turn</span>
          <strong>Word not chosen</strong>
        </div>
      ) : (
        <GameMaskedWord drawer={isDrawer} />
      )}
      <GameTimer seconds={seconds} total={total} label={timerLabel} />
      <GameStatusBadge
        tone={networkState === "reconnecting" || paused ? "warning" : "success"}
        icon={networkState === "reconnecting" ? "refresh" : paused ? "wifiOff" : "wifi"}
      >
        {networkState === "reconnecting" ? "Resyncing" : paused ? "Paused" : "Connected"}
      </GameStatusBadge>
    </header>
  );
}

function EmptyTurnCanvas() {
  return (
    <figure
      className="drawing-canvas drawing-canvas--waiting"
      aria-disabled="true"
      aria-labelledby="waiting-canvas-caption"
      data-od-id="drawing-canvas"
    >
      <figcaption id="waiting-canvas-caption" className="sr-only">
        Empty drawing canvas. Drawing begins after Maya chooses a word.
      </figcaption>
    </figure>
  );
}

function WordChoiceDialog({ onNavigate }) {
  const [choice, setChoice] = useGameState(null);
  const dialogRef = useGameRef(null);
  const words = ["Lighthouse", "Roller skates", "Picnic basket"];
  useGameEffect(() => {
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current?.querySelector(".word-choice-list button")?.focus();
    });
    const handler = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        dialogRef.current?.querySelector(".word-choice-list button[tabindex='0']")?.focus();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [...(dialogRef.current?.querySelectorAll("button:not(:disabled)") || [])]
        .filter((control) => control.tabIndex >= 0);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handler);
    };
  }, []);
  return (
    <div className="word-select-layer" role="presentation">
      <section
        ref={dialogRef}
        className="word-select-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="word-select-title"
        aria-describedby="word-select-description"
        data-od-id="word-choice-dialog"
      >
        <div className="word-select-heading">
          <div>
            <span className="eyebrow">Your turn to draw</span>
            <h2 id="word-select-title">Choose a word</h2>
            <p id="word-select-description">Choose one before drawing begins. Other players cannot see these options.</p>
          </div>
          <GameTimer seconds={15} total={15} label="seconds to choose a word" />
        </div>
        <div
          className="word-choice-list"
          role="radiogroup"
          aria-label="Word choices"
          onKeyDown={(event) => {
            if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
            const controls = [...event.currentTarget.querySelectorAll("button")];
            const currentIndex = Math.max(0, controls.indexOf(document.activeElement));
            const nextIndex = event.key === "Home"
              ? 0
              : event.key === "End"
                ? controls.length - 1
                : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + controls.length) % controls.length;
            event.preventDefault();
            controls[nextIndex].focus();
            controls[nextIndex].click();
          }}
        >
          {words.map((word, index) => {
            const letterCount = word.replace(/\s/g, "").length;
            const wordCount = word.trim().split(/\s+/).length;
            return (
              <button
                key={word}
                type="button"
                className={choice === word ? "is-selected" : ""}
                role="radio"
                aria-checked={choice === word}
                tabIndex={choice === word || (!choice && index === 0) ? 0 : -1}
                onClick={() => setChoice(word)}
              >
                <span>{word}</span>
                {choice === word ? <GameIcon name="check" size={20} /> : null}
                <small>{choice === word ? "Selected" : `${letterCount} letters${wordCount > 1 ? ` · ${wordCount} words` : ""}`}</small>
              </button>
            );
          })}
        </div>
        <div className="dialog__actions cluster">
          <GameButton variant="secondary" onClick={() => setChoice(null)}>Clear choice</GameButton>
          <GameButton disabled={!choice} icon="arrowRight" onClick={() => onNavigate("game-drawer")}>Draw {choice || "selected word"}</GameButton>
        </div>
      </section>
    </div>
  );
}

function WordSelectionScreen({ role = "drawer", ...props }) {
  return <GameScreen {...props} mode={role === "drawer" ? "drawer" : "guesser"} phase="selecting" />;
}

function NetworkBanner({ networkState, onNavigate, onRecovered }) {
  if (networkState === "reconnecting") {
    return (
      <GameBanner
        tone="warning"
        icon="refresh"
        title="Reconnecting and resyncing"
        actions={<GameButton variant="secondary" icon="logOut" onClick={() => onNavigate("home")}>Leave room</GameButton>}
      >
        Restoring 184 confirmed strokes and the latest score order. Drawing and guesses stay disabled until sync completes.
      </GameBanner>
    );
  }
  if (networkState === "paused") {
    return (
      <GameBanner tone="danger" icon="wifiOff" title="Drawer disconnected · round paused" role="alert">
        Maya has 23 seconds to reconnect. The last synchronized canvas remains visible and no one can submit a guess.
      </GameBanner>
    );
  }
  if (networkState === "stale") {
    return (
      <GameBanner
        tone="warning"
        icon="refresh"
        title="A newer room state is available"
        actions={<GameButton variant="secondary" icon="refresh" onClick={onRecovered}>Apply latest state</GameButton>}
      >
        This view is 7 seconds behind. Applying the latest state preserves confirmed scores and replaces stale chat.
      </GameBanner>
    );
  }
  if (networkState === "recovered") {
    return (
      <GameBanner tone="success" icon="checkCircle" title="Room state restored">
        Scores, chat, and the drawing now match the server’s latest confirmed state.
      </GameBanner>
    );
  }
  return null;
}

function MobileGuessDock({ guessed, disabled, selecting = false, onAnnounce }) {
  const [guess, setGuess] = useGameState("");
  const submit = (event) => {
    event.preventDefault();
    if (!guess.trim() || guessed || disabled) return;
    onAnnounce?.("Mock guess submitted from the mobile composer.");
    setGuess("");
  };
  return (
    <form className="mobile-guess-dock" onSubmit={submit}>
      <label htmlFor="mobile-guess-input">{selecting ? "Guessing opens when drawing begins" : guessed ? "Correct guess recorded" : "Your guess"}</label>
      <div>
        <input
          id="mobile-guess-input"
          value={guess}
          placeholder={selecting ? "Waiting for the drawing" : guessed ? "Answer-equivalent input suppressed" : "Type a guess"}
          disabled={guessed || disabled}
          onChange={(event) => setGuess(event.target.value)}
        />
        <button type="submit" className="icon-button" aria-label="Send guess" disabled={guessed || disabled || !guess.trim()}><GameIcon name="send" size={22} /></button>
      </div>
    </form>
  );
}

function GameScreen({ mode = "guesser", phase = "drawing", gameMode = "classic", penalty = false, networkState: initialNetwork = "connected", onNavigate, onAnnounce }) {
  const isDrawer = mode === "drawer";
  const selecting = phase === "selecting";
  const drawerChoosing = isDrawer && selecting;
  const closeFeedback = mode === "close";
  const guessed = mode === "guessed";
  const [clearDialog, setClearDialog] = useGameState(false);
  const [cleared, setCleared] = useGameState(false);
  const [networkState, setNetworkState] = useGameState(initialNetwork);
  const players = gamePlayersFor(mode, phase, gameMode, penalty);
  const penaltyPlayer = penalty ? players.find((player) => player.name === "Priya") : null;
  const penaltyStartScore = penalty ? GAME_BASE_PLAYERS.find((player) => player.name === "Priya")?.score : null;
  const penaltyDelta = penaltyPlayer?.delta ?? 0;
  const penaltyDeltaLabel = penaltyDelta < 0 ? `−${Math.abs(penaltyDelta)}` : `${penaltyDelta}`;
  const disabled = networkState !== "connected";
  const clearCanvas = () => {
    setClearDialog(false);
    setCleared(true);
    onAnnounce?.("Canvas cleared in the prototype. Undo is available.");
  };
  const undoClear = () => {
    setCleared(false);
    onAnnounce?.("Canvas clear undone.");
  };
  return (
    <main
      id="main-content"
      className={`game-page game-page--${mode} game-page--${gameMode} ${selecting ? "game-page--selecting" : "game-page--drawing"}`}
      aria-labelledby="game-heading"
      data-od-id={`${gameMode}-game-${mode}-${phase}-screen`}
    >
      <h1 id="game-heading" className="sr-only">
        {drawerChoosing
          ? "Drawer choosing a word in the live game room"
          : selecting
            ? "Guesser view while Maya chooses a word"
            : isDrawer
              ? `Active ${gameMode} drawer game room`
              : guessed
                ? "Already-guessed game room"
                : `Active ${gameMode} guesser game room`}
      </h1>
      <div className="game-live sr-only" aria-live="polite">
        {drawerChoosing
          ? "Choose one of three words. The new turn canvas is empty."
          : selecting
            ? "Maya is choosing a word. The new turn canvas is empty."
            : isDrawer
              ? "You are drawing lighthouse."
              : guessed
                ? "You guessed correctly. The answer remains private."
                : "Maya is drawing. Enter your guess."}
      </div>
      <NetworkBanner
        networkState={networkState}
        onNavigate={onNavigate}
        onRecovered={() => {
          setNetworkState("recovered");
          onAnnounce?.("Latest room state applied.");
        }}
      />
      {cleared ? (
        <GameBanner
          tone="success"
          icon="checkCircle"
          title="Canvas cleared"
          actions={<GameButton variant="secondary" icon="undo" onClick={undoClear}>Undo clear</GameButton>}
        >
          The clear remains reversible until the next drawing action.
        </GameBanner>
      ) : null}
      {gameMode === "pro" && !penalty ? (
        <GameBanner tone="warning" icon="circleAlert" title="Pro rule · incorrect guesses cost 25 points">
          The server validates each submission. Incorrect guesses stay in public chat; only signed penalty feedback is private.
        </GameBanner>
      ) : null}
      <div className="game-shell" inert={drawerChoosing ? "" : undefined}>
        <GamePlayersPanel players={players} ranked />
        <section className="play-column" aria-label="Current drawing turn">
          <GameStatusBar mode={isDrawer ? "drawer" : "guesser"} phase={phase} networkState={networkState} gameMode={gameMode} />
          {selecting ? (
            <EmptyTurnCanvas />
          ) : cleared ? (
            <figure className="drawing-canvas drawing-canvas--cleared" data-od-id="drawing-canvas">
              <div><GameIcon name="undo" size={36} /><strong>Canvas cleared</strong><span>Use Undo clear to restore the previous static drawing.</span></div>
            </figure>
          ) : (
            <GameStaticDrawing dimmed={disabled} revealSubject={isDrawer} />
          )}
          {selecting ? (
            <div className="guesser-action-row">
              <span className="canvas-caption"><GameIcon name="clock" size={18} /> Canvas ready · Maya is choosing a word</span>
            </div>
          ) : isDrawer ? (
            <GameDrawingToolbar disabled={disabled} onClear={() => setClearDialog(true)} />
          ) : (
            <div className="guesser-action-row">
              {penalty ? (
                <GameBanner
                  tone="danger"
                  icon="circleX"
                  title={`Incorrect guess · ${penaltyDeltaLabel} points`}
                  privateNote="Only you can see this penalty feedback."
                  data-private-feedback="pro-penalty"
                >
                  “Beacon” remains visible in public chat. The server confirmed your score changed from {penaltyStartScore?.toLocaleString("en-US")} to {penaltyPlayer?.score.toLocaleString("en-US")}.
                </GameBanner>
              ) : guessed ? (
                <GameBanner
                  tone="success"
                  icon="checkCircle"
                  title="You got it"
                  privateNote="Only you can see this."
                  data-private-feedback="correct"
                >
                  Your correct answer is suppressed from public chat.
                </GameBanner>
              ) : closeFeedback ? (
                <GameBanner
                  tone="warning"
                  icon="lightbulb"
                  title="Very close"
                  privateNote="Only you can see this."
                  data-private-feedback="close"
                >
                  Check the spelling. Your guess was not published.
                </GameBanner>
              ) : (
                <span className="canvas-caption"><GameIcon name="eye" size={18} /> Drawing in progress · public guesses appear after validation</span>
              )}
            </div>
          )}
          {!isDrawer ? <MobileGuessDock guessed={guessed} disabled={disabled || selecting} selecting={selecting} onAnnounce={onAnnounce} /> : null}
          <GameMobileSupport players={players} mode={isDrawer ? "drawer" : "guesser"} guessed={guessed} penalty={penalty} selecting={selecting} />
        </section>
        <GameChatPanel mode={isDrawer ? "drawer" : "guesser"} guessed={guessed} penalty={penalty} selecting={selecting} />
      </div>
      {drawerChoosing ? <WordChoiceDialog onNavigate={onNavigate} /> : null}
      <GameConfirmDialog
        open={clearDialog}
        title="Clear the canvas?"
        description="The current static drawing will disappear, but this prototype keeps one undoable clear step."
        confirmLabel="Clear canvas"
        onClose={() => setClearDialog(false)}
        onConfirm={clearCanvas}
      />
    </main>
  );
}

const PHONE_PHASES = {
  write: {
    number: 1,
    title: "Write a sentence",
    instruction: "Start a scene that another player can draw.",
    action: "Submit sentence",
    timerName: "Text timer",
    timerTotal: 60
  },
  "draw-prompt": {
    number: 2,
    title: "Draw an assigned prompt",
    instruction: "Only you can see the sentence assigned to this canvas.",
    action: "Submit drawing",
    timerName: "Drawing timer",
    timerTotal: 120
  },
  "guess-drawing": {
    number: 3,
    title: "Guess an assigned drawing",
    instruction: "Describe what you think the private drawing shows.",
    action: "Submit guess",
    timerName: "Text timer",
    timerTotal: 60
  },
  "draw-guess": {
    number: 4,
    title: "Draw an assigned guess",
    instruction: "Turn the private guess into the final drawing in this chain.",
    action: "Submit final drawing",
    timerName: "Drawing timer",
    timerTotal: 120
  }
};

const PHONE_TEXT_LIMIT = 180;

function PhonePhaseProgress({ active }) {
  const labels = ["Write", "Draw", "Guess", "Draw"];
  return (
    <ol className="phone-phase-progress" aria-label={`Phase ${active} of 4`}>
      {labels.map((label, index) => (
        <li key={`${label}-${index}`} className={index + 1 === active ? "is-current" : index + 1 < active ? "is-complete" : ""}>
          <span className="numeric">{index + 1}</span>
          <strong>{label}</strong>
          {index + 1 < active ? <GameIcon name="check" size={15} /> : null}
        </li>
      ))}
    </ol>
  );
}

function PhoneStatusRoster({ phase, submitted, networkState }) {
  const phaseStatus = {
    write: ["Submitted", "Working", "Submitted", "Working", "Skipped"],
    "draw-prompt": ["Submitted", "Working", "Working", "Skipped", "Submitted"],
    "guess-drawing": ["Submitted", "Working", "Submitted", "Working", "Skipped"],
    "draw-guess": ["Submitted", "Working", "Submitted", "Skipped", "Working"]
  };
  const statuses = phaseStatus[phase];
  const players = GAME_BASE_PLAYERS.map((player, index) => {
    const isYou = player.name === "Priya";
    const status = isYou && networkState === "reconnecting"
      ? "Disconnected"
      : isYou && submitted
        ? "Submitted"
        : statuses[index];
    return { ...player, score: undefined, isYou, phoneStatus: status };
  });
  const iconFor = (status) => status === "Submitted"
    ? "checkCircle"
    : status === "Disconnected"
      ? "wifiOff"
      : status === "Skipped"
        ? "link"
        : "pencil";
  const toneFor = (status) => status === "Submitted"
    ? "success"
    : status === "Disconnected" || status === "Skipped"
      ? "warning"
      : "primary";
  return (
    <GamePanel as="aside" className="phone-roster" aria-labelledby="phone-roster-title" data-od-id="phone-player-statuses">
      <div className="split panel__heading">
        <h2 id="phone-roster-title">Player status</h2>
        <span className="muted numeric">{networkState === "reconnecting" ? "4/5 connected" : "5/5 connected"}</span>
      </div>
      <ul>
        {players.map((player) => (
          <li key={player.name}>
            <GameAvatar name={player.name} size={42} {...player.avatar} />
            <div><strong>{player.name}{player.isYou ? " · You" : ""}</strong><span>Phase {PHONE_PHASES[phase].number}</span></div>
            <GameStatusBadge tone={toneFor(player.phoneStatus)} icon={iconFor(player.phoneStatus)}>{player.phoneStatus}</GameStatusBadge>
          </li>
        ))}
      </ul>
      <p className="phone-roster__note"><GameIcon name="lock" size={16} /> Prompts and authors stay private while phases are active.</p>
    </GamePanel>
  );
}

function PhonePrivatePrompt({ label, children }) {
  return (
    <section className="phone-private-prompt" aria-labelledby="phone-private-prompt-title" data-author-hidden="true" data-od-id="phone-private-prompt">
      <div>
        <span className="eyebrow"><GameIcon name="lock" size={15} /> {label}</span>
        <strong id="phone-private-prompt-title">{children}</strong>
      </div>
      <span>Author hidden until story summary</span>
    </section>
  );
}

function PhoneWriteSurface({ value, onChange, disabled }) {
  const trimmedLength = value.trim().length;
  return (
    <section className="phone-writing-surface" aria-labelledby="phone-writing-title" data-od-id="phone-sentence-composer">
      <div className="split">
        <h2 id="phone-writing-title">Your opening sentence</h2>
        <span id="phone-sentence-count" className="phone-character-count numeric muted">{trimmedLength}/{PHONE_TEXT_LIMIT}</span>
      </div>
      <label htmlFor="phone-sentence">Write one clear, drawable scene</label>
      <textarea
        id="phone-sentence"
        value={value}
        maxLength={PHONE_TEXT_LIMIT}
        rows="5"
        disabled={disabled}
        aria-describedby="phone-sentence-help phone-sentence-count"
        aria-invalid={trimmedLength < 1}
        onChange={(event) => onChange(event.target.value)}
      />
      <p id="phone-sentence-help"><GameIcon name="eye" size={17} /> Use 1–180 characters after trimming. Other players cannot see this sentence until the synchronized summary.</p>
    </section>
  );
}

function PhoneGuessSurface({ value, onChange, disabled }) {
  const trimmedLength = value.trim().length;
  return (
    <>
      <div className="phone-assigned-canvas" data-od-id="phone-assigned-drawing">
        <GameStaticDrawing />
      </div>
      <section className="phone-guess-composer" aria-labelledby="phone-guess-title">
        <div className="phone-guess-composer__intro">
          <div className="split">
            <h2 id="phone-guess-title">What does this drawing say?</h2>
            <span id="phone-guess-count" className="phone-character-count numeric muted">{trimmedLength}/{PHONE_TEXT_LIMIT}</span>
          </div>
          <p id="phone-guess-help">Write 1–180 characters after trimming. The drawing’s author stays hidden.</p>
        </div>
        <label htmlFor="phone-private-guess">Your private guess</label>
        <div className="phone-guess-composer__row">
          <textarea
            id="phone-private-guess"
            value={value}
            maxLength={PHONE_TEXT_LIMIT}
            rows="3"
            disabled={disabled}
            aria-describedby="phone-guess-help phone-guess-count"
            aria-invalid={trimmedLength < 1}
            onChange={(event) => onChange(event.target.value)}
          />
        </div>
      </section>
    </>
  );
}

function PhoneDrawingSurface({ phase, disabled, onClear }) {
  const prompt = phase === "draw-prompt"
    ? "A lighthouse hosting a midnight dance party"
    : "A rocky lighthouse by the sea";
  return (
    <>
      <PhonePrivatePrompt label={phase === "draw-prompt" ? "Assigned sentence" : "Assigned guess"}>{prompt}</PhonePrivatePrompt>
      <div className="phone-drawing-canvas" data-od-id={`phone-${phase}-canvas`}>
        <GameStaticDrawing dimmed={disabled} revealSubject />
      </div>
      <GameDrawingToolbar disabled={disabled} onClear={onClear} />
    </>
  );
}

function PhonePhaseScreen({
  phase = "write",
  initialNetwork = "connected",
  skippedLink = false,
  onNavigate,
  onAnnounce
}) {
  const phaseData = PHONE_PHASES[phase];
  const [submitted, setSubmitted] = useGameState(false);
  const [networkState, setNetworkState] = useGameState(initialNetwork);
  const [sentence, setSentence] = useGameState("A cat tries to bake a birthday cake during a thunderstorm.");
  const [guess, setGuess] = useGameState("A lighthouse throwing a party at midnight");
  const [clearDialog, setClearDialog] = useGameState(false);
  const disabled = networkState !== "connected" || submitted;
  const textValue = phase === "write" ? sentence : phase === "guess-drawing" ? guess : "";
  const requiresText = phase === "write" || phase === "guess-drawing";
  const trimmedTextLength = textValue.trim().length;
  const validText = !requiresText || (trimmedTextLength >= 1 && trimmedTextLength <= PHONE_TEXT_LIMIT);
  const seconds = networkState === "reconnecting"
    ? phaseData.timerTotal === 120 ? 92 : 42
    : phase === "write"
      ? 52
      : phase === "draw-prompt"
        ? 98
        : phase === "guess-drawing"
          ? 47
          : 74;
  const submit = () => {
    if (disabled || !validText) return;
    setSubmitted(true);
    onAnnounce?.(`${phaseData.title} submitted. Waiting for the remaining players.`);
  };
  return (
    <main
      id="main-content"
      className={`phone-page phone-page--${phase}`}
      aria-labelledby="phone-phase-heading"
      data-od-id={`phone-phase-${phase}-screen`}
      data-phone-excludes="chat scores"
    >
      <h1 id="phone-phase-heading" className="sr-only">Phone Mode · {phaseData.title} · phase {phaseData.number} of 4</h1>
      <div className="sr-only" aria-live="polite">
        Phase {phaseData.number} of 4. {phaseData.title}. {seconds} seconds remain on the synchronized room timer.
      </div>
      {networkState === "reconnecting" ? (
        <GameBanner
          tone="warning"
          icon="refresh"
          title="Reconnecting to the Phone round"
          actions={<GameButton variant="secondary" icon="refresh" onClick={() => setNetworkState("connected")}>Retry sync</GameButton>}
        >
          Your local work is preserved. Submission stays locked until the authoritative room timer and assignment are synchronized.
        </GameBanner>
      ) : networkState === "connected" && initialNetwork === "reconnecting" ? (
        <GameBanner tone="success" icon="wifi" title="Back online">
          The assignment and server deadline match the room. You can submit safely.
        </GameBanner>
      ) : null}
      {skippedLink ? (
        <GameBanner
          tone="warning"
          icon="link"
          title="1 skipped step · continue this task"
          role="status"
        >
          Continue from the most recent valid {phase === "guess-drawing" ? "drawing" : "prompt"} shown below. The skipped step stays recorded, authoring remains available, and the existing authoritative {phaseData.timerName.toLowerCase()} deadline is unchanged.
        </GameBanner>
      ) : null}
      <div className="phone-shell">
        <PhoneStatusRoster phase={phase} submitted={submitted} networkState={networkState} />
        <section className="phone-play-column" aria-label={`${phaseData.title} activity`}>
          <header className="phone-phase-header" data-od-id="phone-phase-status">
            <div>
              <span className="eyebrow">Phone Mode · Phase {phaseData.number} of 4</span>
              <h2>{phaseData.title}</h2>
              <p>{phaseData.instruction}</p>
            </div>
            <div className="phone-authority">
              <GameTimer seconds={seconds} total={phaseData.timerTotal} label={`seconds remaining on the authoritative ${phaseData.timerName.toLowerCase()}`} />
              <GameStatusBadge tone={networkState === "connected" ? "success" : "warning"} icon={networkState === "connected" ? "wifi" : "refresh"}>
                {networkState === "connected" ? phaseData.timerName : "Resyncing"}
              </GameStatusBadge>
              <span>Shared server deadline for all players</span>
            </div>
          </header>
          <PhonePhaseProgress active={phaseData.number} />
          {phase === "write" ? (
            <PhoneWriteSurface value={sentence} onChange={setSentence} disabled={disabled} />
          ) : phase === "guess-drawing" ? (
            <>
              <PhonePrivatePrompt label="Assigned drawing">Describe the picture without seeing its earlier sentence</PhonePrivatePrompt>
              <PhoneGuessSurface value={guess} onChange={setGuess} disabled={disabled} />
            </>
          ) : (
            <PhoneDrawingSurface phase={phase} disabled={disabled} onClear={() => setClearDialog(true)} />
          )}
          {submitted ? (
            <div className="phone-submitted-state" role="status" data-od-id="phone-submitted-state">
              <GameIcon name="checkCircle" size={24} />
              <div><strong>Submitted</strong><span>Your private link is locked. Waiting for 2 players before the room advances together.</span></div>
            </div>
          ) : (
            <div className="phone-submit-row">
              <span><GameIcon name="lock" size={17} /> Private submission · author hidden</span>
              <GameButton
                icon="arrowRight"
                disabled={disabled || !validText}
                onClick={submit}
              >
                {phaseData.action}
              </GameButton>
            </div>
          )}
        </section>
      </div>
      <GameConfirmDialog
        open={clearDialog}
        title="Clear this private drawing?"
        description="The current Phone Mode canvas will be cleared. This static prototype keeps the confirmation behavior reviewable."
        confirmLabel="Clear drawing"
        onClose={() => setClearDialog(false)}
        onConfirm={() => {
          setClearDialog(false);
          onAnnounce?.("Private drawing cleared.");
        }}
      />
    </main>
  );
}

const PHONE_STORY_ITEMS = [
  { type: "sentence", by: "Maya", verb: "wrote", content: "A cat tries to bake a birthday cake during a thunderstorm." },
  { type: "drawing", by: "Priya", verb: "drew", content: "Birthday cake drawing" },
  { type: "sentence", by: "Noah", verb: "guessed", content: "A lighthouse throwing a party at midnight." },
  { type: "drawing", by: "Leo", verb: "drew", content: "Midnight lighthouse drawing" }
];

function PhoneStorySummaryScreen({ role = "host", initialStep = 1, onNavigate }) {
  const isHost = role === "host";
  const [step, setStep] = useGameState(Math.max(0, Math.min(PHONE_STORY_ITEMS.length - 1, initialStep - 1)));
  const item = PHONE_STORY_ITEMS[step];
  const last = step === PHONE_STORY_ITEMS.length - 1;
  return (
    <main id="main-content" className={`phone-summary-page phone-summary-page--${role}`} aria-labelledby="phone-summary-title" data-od-id={`phone-summary-${role}-screen`}>
      <header className="phone-summary-heading">
        <div>
          <span className="eyebrow">Phone Mode · Story summary</span>
          <h1 id="phone-summary-title">The birthday cake chain</h1>
          <p>{isHost ? "Reveal one link at a time. Everyone’s view stays synchronized to your controls." : "Maya is revealing this story. Your view follows the host automatically."}</p>
        </div>
        <GameStatusBadge tone="success" icon="wifi">Synchronized</GameStatusBadge>
      </header>
      <ol className="story-reveal-progress" aria-label={`Story item ${step + 1} of 4`}>
        {PHONE_STORY_ITEMS.map((storyItem, index) => (
          <li key={`${storyItem.type}-${index}`} className={index === step ? "is-current" : index < step ? "is-revealed" : ""}>
            <span className="numeric">{index + 1}</span>
            <strong>{storyItem.type === "sentence" ? "Sentence" : "Drawing"}</strong>
          </li>
        ))}
      </ol>
      <section className={`story-stage story-stage--${item.type}`} aria-live="polite" data-od-id={`story-item-${step + 1}`}>
        <div className="story-stage__meta">
          <span className="numeric">Item {step + 1} of 4</span>
          <strong>{item.by} {item.verb}</strong>
          <span>Attribution is visible during summary only</span>
        </div>
        {item.type === "sentence" ? (
          <blockquote>{item.content}</blockquote>
        ) : (
          <div className="story-stage__drawing" aria-label={item.content}><GameStaticDrawing revealSubject /></div>
        )}
      </section>
      {isHost ? (
        <div className="story-host-controls" aria-label="Story reveal controls" data-od-id="story-host-controls">
          <GameButton variant="secondary" icon="arrowLeft" disabled={step === 0} onClick={() => setStep((current) => Math.max(0, current - 1))}>Previous</GameButton>
          <span className="numeric" aria-label={`Showing item ${step + 1} of 4`}>{step + 1}/4</span>
          {last ? (
            <GameButton icon="check" onClick={() => onNavigate("phone-complete-host")}>Finish story</GameButton>
          ) : (
            <GameButton icon="arrowRight" onClick={() => setStep((current) => Math.min(PHONE_STORY_ITEMS.length - 1, current + 1))}>Next item</GameButton>
          )}
        </div>
      ) : (
        <div className="story-guest-waiting" role="status" data-od-id="story-guest-waiting">
          <GameIcon name="clock" size={24} />
          <div><strong>Waiting for Maya</strong><span>The host controls previous, next, and finish. This view will advance automatically.</span></div>
        </div>
      )}
    </main>
  );
}

function PhoneCompletionScreen({ role = "host", onNavigate }) {
  const isHost = role === "host";
  return (
    <main id="main-content" className="phone-completion-page page-shell" aria-labelledby="phone-completion-title" data-od-id={`phone-completion-${role}-screen`}>
      <section className="phone-completion-copy">
        <span className="completion-mark"><GameIcon name="checkCircle" size={44} /></span>
        <p className="page-kicker">Phone Mode complete</p>
        <h1 id="phone-completion-title">Every story found an ending</h1>
        <p className="lede">There is no leaderboard in Phone Mode. Keep the room together for a fresh set of private chains, or leave when you’re done.</p>
      </section>
      <GamePanel className="rematch-panel" aria-labelledby="rematch-title">
        <div className="split panel__heading">
          <h2 id="rematch-title">Next round</h2>
          <GameStatusBadge tone={isHost ? "primary" : "warning"} icon={isHost ? "crown" : "clock"}>{isHost ? "Host controls" : "Waiting for host"}</GameStatusBadge>
        </div>
        {isHost ? (
          <>
            <p>Only the host can start another four-phase chain for everyone in this room.</p>
            <div className="final-actions">
              <GameButton icon="refresh" onClick={() => onNavigate("phone-phase-write")}>Play again</GameButton>
              <GameButton variant="secondary" icon="settings" onClick={() => onNavigate("lobby-phone-host")}>Change settings</GameButton>
              <GameButton variant="quiet" icon="logOut" onClick={() => onNavigate("home")}>Leave room</GameButton>
            </div>
          </>
        ) : (
          <>
            <div className="story-guest-waiting" role="status" data-od-id="phone-completion-guest-waiting">
              <GameIcon name="clock" size={24} />
              <div><strong>Waiting for Maya</strong><span>The host decides whether to play again. No response is required from you.</span></div>
            </div>
            <div className="final-actions">
              <GameButton variant="quiet" icon="logOut" onClick={() => onNavigate("home")}>Leave room</GameButton>
            </div>
          </>
        )}
      </GamePanel>
    </main>
  );
}

function ServerOutageScreen({ onNavigate, onAnnounce }) {
  const [checking, setChecking] = useGameState(false);
  const retry = () => {
    setChecking(true);
    onAnnounce?.("Retrying server connection.");
    window.setTimeout(() => setChecking(false), 900);
  };
  return (
    <main id="main-content" className="system-state-page" aria-labelledby="outage-title" data-od-id="server-outage-screen">
      <section className="system-state-card" role="alert">
        <span className="system-state-card__icon"><GameIcon name="cloudOff" size={46} /></span>
        <p className="eyebrow">Connection interrupted</p>
        <h1 id="outage-title">The game server is unavailable</h1>
        <p>We kept the last confirmed room state in this prototype. We cannot promise that new drawing strokes or guesses were delivered.</p>
        <dl className="outage-facts">
          <div><dt>Room</dt><dd>SKETCH</dd></div>
          <div><dt>Last sync</dt><dd>8:43 PM</dd></div>
          <div><dt>Unsynced input</dt><dd>Not submitted</dd></div>
        </dl>
        <div className="cluster">
          <GameButton icon="refresh" disabled={checking} aria-busy={checking} onClick={retry}>{checking ? "Checking…" : "Try again"}</GameButton>
          <GameButton variant="secondary" icon="home" onClick={() => onNavigate("home")}>Back home</GameButton>
        </div>
      </section>
    </main>
  );
}

function TurnResultsScreen({ onNavigate }) {
  const players = [
    { ...GAME_BASE_PLAYERS[0], delta: 220, score: 2060 },
    { ...GAME_BASE_PLAYERS[1], delta: 180, score: 1790, isYou: true },
    { ...GAME_BASE_PLAYERS[2], delta: 150, score: 1530 },
    { ...GAME_BASE_PLAYERS[3], delta: 0, score: 1120 },
    { ...GAME_BASE_PLAYERS[4], delta: 80, score: 1060 }
  ];
  return (
    <main id="main-content" className="results-page page-shell page-shell--wide" aria-labelledby="turn-results-title" data-od-id="turn-results-screen">
      <section className="turn-result-summary">
        <p className="page-kicker">Turn 4 complete</p>
        <h1 id="turn-results-title">The word was <span>LIGHTHOUSE</span></h1>
        <p className="lede">Maya drew it. Priya, Noah, and Amara found the answer before time ran out.</p>
        <div className="result-sketch"><GameStaticDrawing revealSubject /></div>
        <div className="result-facts">
          <div><span>Fastest guess</span><strong>Priya · 31 sec</strong></div>
          <div><span>Drawer points</span><strong className="numeric">+220</strong></div>
          <div><span>Next turn</span><strong>Leo draws</strong></div>
        </div>
      </section>
      <GamePanel className="round-score-panel" aria-labelledby="round-score-title">
        <div className="split panel__heading"><h2 id="round-score-title">Round scores</h2><GameStatusBadge icon="clock">Next turn in 8 sec</GameStatusBadge></div>
        <GameLeaderboard players={players} />
        <div className="form-actions">
          <GameButton variant="secondary" icon="logOut" onClick={() => onNavigate("home")}>Leave room</GameButton>
          <GameButton icon="arrowRight" onClick={() => onNavigate("game-guesser")}>Continue to Leo’s turn</GameButton>
        </div>
      </GamePanel>
    </main>
  );
}

function FinalResultsScreen({ onNavigate }) {
  const players = [
    { ...GAME_BASE_PLAYERS[0], delta: 480, score: 5240 },
    { ...GAME_BASE_PLAYERS[1], delta: 410, score: 5010, isYou: true },
    { ...GAME_BASE_PLAYERS[2], delta: 360, score: 4620 },
    { ...GAME_BASE_PLAYERS[4], delta: 290, score: 4190 },
    { ...GAME_BASE_PLAYERS[3], delta: 250, score: 3970 }
  ];
  return (
    <main id="main-content" className="results-page final-page page-shell page-shell--wide" aria-labelledby="final-title" data-od-id="final-leaderboard-screen">
      <section className="winner-summary">
        <span className="winner-mark"><GameIcon name="trophy" size={46} /></span>
        <p className="page-kicker">Three cycles complete</p>
        <h1 id="final-title">Maya takes the table</h1>
        <p className="lede">A close finish: just 230 points separated first and second place.</p>
        <div className="winner-score numeric">5,240</div>
        <span>final points</span>
      </section>
      <GamePanel className="final-leaderboard-panel" aria-labelledby="final-leaderboard-title">
        <div className="split panel__heading"><h2 id="final-leaderboard-title">Final leaderboard</h2><GameStatusBadge tone="success" icon="checkCircle">Game complete</GameStatusBadge></div>
        <GameLeaderboard players={players} final />
        <div className="final-actions">
          <GameButton icon="refresh" onClick={() => onNavigate("lobby-host")}>Play again</GameButton>
          <GameButton variant="secondary" icon="settings" onClick={() => onNavigate("create")}>Change settings</GameButton>
          <GameButton variant="quiet" icon="logOut" onClick={() => onNavigate("home")}>Leave room</GameButton>
        </div>
      </GamePanel>
    </main>
  );
}

Object.assign(window, {
  GTDGameScreens: {
    FinalResultsScreen,
    GameScreen,
    PhoneCompletionScreen,
    PhonePhaseScreen,
    PhoneStorySummaryScreen,
    ServerOutageScreen,
    TurnResultsScreen,
    WordSelectionScreen
  }
});
})();
