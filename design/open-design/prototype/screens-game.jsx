(() => {
const {
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

function gamePlayersFor(mode, phase = "drawing") {
  return GAME_BASE_PLAYERS
    .map((player) => ({
      ...player,
      isDrawer: player.name === "Maya",
      isYou: mode === "drawer" ? player.name === "Maya" : player.name === "Priya",
      drawerStatus: player.name === "Maya" ? (phase === "selecting" ? "Choosing" : "Drawing") : undefined,
      status: mode === "guessed" && player.name === "Priya" ? "Guessed" : player.status
    }))
    .sort((a, b) => b.score - a.score);
}

function GameStatusBar({ mode, phase = "drawing", networkState }) {
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
        <span className="eyebrow">Cycle 2 of 3</span>
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

function GameScreen({ mode = "guesser", phase = "drawing", networkState: initialNetwork = "connected", onNavigate, onAnnounce }) {
  const isDrawer = mode === "drawer";
  const selecting = phase === "selecting";
  const drawerChoosing = isDrawer && selecting;
  const closeFeedback = mode === "close";
  const guessed = mode === "guessed";
  const [clearDialog, setClearDialog] = useGameState(false);
  const [cleared, setCleared] = useGameState(false);
  const [networkState, setNetworkState] = useGameState(initialNetwork);
  const players = gamePlayersFor(mode, phase);
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
      className={`game-page game-page--${mode} ${selecting ? "game-page--selecting" : "game-page--drawing"}`}
      aria-labelledby="game-heading"
      data-od-id={`game-${mode}-${phase}-screen`}
    >
      <h1 id="game-heading" className="sr-only">
        {drawerChoosing
          ? "Drawer choosing a word in the live game room"
          : selecting
            ? "Guesser view while Maya chooses a word"
            : isDrawer
              ? "Active drawer game room"
              : guessed
                ? "Already-guessed game room"
                : "Active guesser game room"}
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
      <div className="game-shell" inert={drawerChoosing ? "" : undefined}>
        <GamePlayersPanel players={players} ranked />
        <section className="play-column" aria-label="Current drawing turn">
          <GameStatusBar mode={isDrawer ? "drawer" : "guesser"} phase={phase} networkState={networkState} />
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
              {guessed ? (
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
                <span className="canvas-caption"><GameIcon name="eye" size={18} /> Drawing in progress · guesses stay private until evaluated</span>
              )}
            </div>
          )}
          {!isDrawer ? <MobileGuessDock guessed={guessed} disabled={disabled || selecting} selecting={selecting} onAnnounce={onAnnounce} /> : null}
          <GameMobileSupport players={players} mode={isDrawer ? "drawer" : "guesser"} guessed={guessed} selecting={selecting} />
        </section>
        <GameChatPanel mode={isDrawer ? "drawer" : "guesser"} guessed={guessed} selecting={selecting} />
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
    ServerOutageScreen,
    TurnResultsScreen,
    WordSelectionScreen
  }
});
})();
