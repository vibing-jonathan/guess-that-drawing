(() => {
const { useEffect, useId, useRef, useState } = React;
const { Icon } = window.GTDIcons;

function handleRovingKeys(event) {
  if (!["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const controls = [...event.currentTarget.querySelectorAll("button:not(:disabled)")];
  if (!controls.length) return;
  const currentIndex = Math.max(0, controls.indexOf(document.activeElement));
  const nextIndex = event.key === "Home"
    ? 0
    : event.key === "End"
      ? controls.length - 1
      : (currentIndex + (["ArrowRight", "ArrowDown"].includes(event.key) ? 1 : -1) + controls.length) % controls.length;
  event.preventDefault();
  controls[nextIndex].focus();
}

function Button({
  children,
  icon,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}) {
  return (
    <button type={type} className={`button button--${variant} ${className}`} {...props}>
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </button>
  );
}

function IconButton({ icon, label, selected, tooltip, className = "", inputRef, ...props }) {
  const isToggle = selected !== undefined;
  return (
    <button
      ref={inputRef}
      type="button"
      className={`icon-button ${selected ? "is-selected" : ""} ${className}`}
      aria-label={label}
      aria-pressed={isToggle ? selected : undefined}
      data-tooltip={tooltip || label}
      {...props}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

function Panel({ as: Tag = "section", className = "", children, ...props }) {
  return (
    <Tag className={`panel ${className}`} {...props}>
      {children}
    </Tag>
  );
}

function PageHeader({ kicker, title, description, actions, id = "page-title" }) {
  return (
    <header className="page-heading" data-od-id="page-heading">
      {kicker ? <p className="page-kicker">{kicker}</p> : null}
      <div className="split page-heading__row">
        <div>
          <h1 id={id}>{title}</h1>
          {description ? <p className="lede">{description}</p> : null}
        </div>
        {actions ? <div className="cluster page-heading__actions">{actions}</div> : null}
      </div>
    </header>
  );
}

function Field({
  id,
  label,
  help,
  error,
  success,
  className = "",
  children,
  ...inputProps
}) {
  const descriptionId = `${id}-description`;
  const message = error || success || help;
  return (
    <div className={`field ${error ? "field--error" : ""} ${success ? "field--success" : ""} ${className}`}>
      <label htmlFor={id}>{label}</label>
      {children || (
        <input
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={message ? descriptionId : undefined}
          {...inputProps}
        />
      )}
      {message ? (
        <p id={descriptionId} className="field__message">
          {error ? <Icon name="circleAlert" size={16} /> : null}
          {success ? <Icon name="checkCircle" size={16} /> : null}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

function SelectField({ id, label, value, onChange, children, help }) {
  return (
    <Field id={id} label={label} help={help}>
      <select id={id} value={value} onChange={onChange} aria-describedby={help ? `${id}-description` : undefined}>
        {children}
      </select>
    </Field>
  );
}

const SKINS = {
  warm: "oklch(0.78 0.09 63)",
  deep: "oklch(0.50 0.10 45)",
  light: "oklch(0.91 0.06 75)",
  olive: "oklch(0.70 0.07 85)"
};

const BACKGROUNDS = {
  cobalt: "var(--color-primary-subtle)",
  coral: "var(--color-accent-subtle)",
  teal: "var(--color-success-subtle)",
  yellow: "var(--color-highlight-subtle)"
};

function Avatar({
  name = "Guest",
  size = 56,
  face = "round",
  skin = "warm",
  hair = "wave",
  eyes = "round",
  mouth = "smile",
  accessory = "none",
  background = "cobalt",
  className = ""
}) {
  const eyeNodes = eyes === "wink"
    ? <><path d="M31 42h7" /><circle cx="54" cy="42" r="3" /></>
    : eyes === "bright"
      ? <><circle cx="34" cy="41" r="4" /><circle cx="54" cy="41" r="4" /><circle cx="33" cy="40" r="1" fill="white" stroke="none" /><circle cx="53" cy="40" r="1" fill="white" stroke="none" /></>
      : <><circle cx="34" cy="42" r="3" /><circle cx="54" cy="42" r="3" /></>;
  const mouthNode = mouth === "open"
    ? <path d="M38 55c3 5 9 5 12 0Z" fill="var(--color-accent-subtle)" />
    : mouth === "calm"
      ? <path d="M39 56h10" />
      : <path d="M37 54c4 6 11 6 15 0" />;
  const faceNode = face === "oval"
    ? <ellipse cx="44" cy="46" rx="24" ry="29" fill={SKINS[skin]} stroke="var(--color-ink)" strokeWidth="2.5" />
    : face === "soft-square"
      ? <rect x="18" y="18" width="52" height="56" rx="19" fill={SKINS[skin]} stroke="var(--color-ink)" strokeWidth="2.5" />
      : <circle cx="44" cy="45" r="27" fill={SKINS[skin]} stroke="var(--color-ink)" strokeWidth="2.5" />;
  const hairNode = hair === "crop"
    ? <path d="M23 35c1-15 10-23 23-23 12 0 20 7 22 18-10-2-18-6-24-12-5 8-12 14-21 17Z" fill="var(--color-ink)" />
    : hair === "curls"
      ? <path d="M22 34c-3-9 1-22 11-24 3-7 15-5 18 0 12-2 19 13 13 24-5-7-9-10-19-15-6 7-13 12-23 15Z" fill="var(--color-ink)" />
      : <path d="M21 35c0-15 9-25 23-25 13 0 22 9 23 22-8 0-18-5-22-12-5 8-13 13-24 15Z" fill="var(--color-ink)" />;
  return (
    <svg
      className={`avatar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 88 88"
      role="img"
      aria-label={`${name} avatar`}
    >
      <rect x="2" y="2" width="84" height="84" rx="24" fill={BACKGROUNDS[background]} stroke="var(--color-ink)" strokeWidth="3" />
      {faceNode}
      {hairNode}
      <g fill="var(--color-ink)" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinecap="round">
        {eyeNodes}
        {mouthNode}
      </g>
      {accessory === "glasses" ? (
        <g fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
          <circle cx="34" cy="42" r="8" />
          <circle cx="54" cy="42" r="8" />
          <path d="M42 42h4M26 40l-5-2M62 40l5-2" />
        </g>
      ) : null}
      {accessory === "cap" ? (
        <path d="M21 30c4-14 15-20 27-18 10 1 17 7 20 17-15-1-31 0-47 1Zm28-1c8 0 17 2 23 6" fill="var(--color-primary)" stroke="var(--color-ink)" strokeWidth="2.5" strokeLinejoin="round" />
      ) : null}
    </svg>
  );
}

function StatusBadge({ icon = "checkCircle", children, tone = "neutral", className = "" }) {
  return (
    <span className={`status-badge status-badge--${tone} ${className}`}>
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </span>
  );
}

function Banner({
  tone = "info",
  icon = "circleAlert",
  title,
  children,
  privateNote,
  actions,
  role = "status",
  ...props
}) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
      {...props}
    >
      <Icon name={icon} size={22} />
      <div className="banner__body">
        <strong>{title}</strong>
        {children ? <div className="banner__copy">{children}</div> : null}
        {privateNote ? (
          <span className="banner__private"><Icon name="lock" size={14} /> {privateNote}</span>
        ) : null}
      </div>
      {actions ? <div className="banner__actions">{actions}</div> : null}
    </div>
  );
}

function RoomCode({ code = "SKETCH", onCopy, copied = false }) {
  return (
    <div className="room-code" aria-labelledby="room-code-label" data-od-id="room-code">
      <span id="room-code-label" className="room-code__label">Room code</span>
      <strong className="room-code__value numeric" aria-label={`Room code ${code.split("").join(" ")}`}>{code}</strong>
      <Button variant="secondary" icon={copied ? "check" : "copy"} onClick={onCopy}>
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

function PlayerRow({ player, rank, showKick = false, onKick }) {
  const { name, score, delta, status, isHost, isYou, isDrawer, avatar = {} } = player;
  return (
    <li className={`player-row ${isYou ? "player-row--you" : ""}`} data-od-id={`player-${name.toLowerCase().replace(/\W+/g, "-")}`}>
      {rank ? <span className="player-row__rank numeric">{rank}</span> : null}
      <Avatar name={name} size={44} {...avatar} />
      <div className="player-row__identity">
        <strong>{name}{isYou ? " · You" : ""}</strong>
        <span className="player-row__meta">
          {isHost ? <><Icon name="crown" size={14} /> Host</> : null}
          {isDrawer ? <><Icon name="pencil" size={14} /> Drawing</> : null}
          {!isHost && !isDrawer ? <><Icon name={status === "reconnecting" ? "wifiOff" : "wifi"} size={14} /> {status === "reconnecting" ? "Reconnecting" : status || "Ready"}</> : null}
        </span>
      </div>
      {delta ? <span className="player-row__delta numeric">+{delta}</span> : null}
      {typeof score === "number" ? <strong className="player-row__score numeric">{score}</strong> : null}
      {showKick && !isHost && !isYou ? (
        <IconButton icon="logOut" label={`Remove ${name} from room`} tooltip={`Kick ${name}`} onClick={() => onKick?.(name)} />
      ) : null}
    </li>
  );
}

function PlayersPanel({
  players,
  title = "Players",
  titleId = "players-panel-title",
  odId = "players-panel",
  showKick = false,
  onKick,
  ranked = false
}) {
  return (
    <Panel as="aside" className="players-panel" aria-labelledby={titleId} data-od-id={odId}>
      <div className="split panel__heading">
        <h2 id={titleId}>{title}</h2>
        <span className="muted numeric">{players.length}/12</span>
      </div>
      <ol className="player-list">
        {players.map((player, index) => (
          <PlayerRow key={player.name} player={player} rank={ranked ? index + 1 : undefined} showKick={showKick} onKick={onKick} />
        ))}
      </ol>
    </Panel>
  );
}

function Timer({ seconds, total = 90, label = "seconds remaining" }) {
  const urgent = seconds <= 5;
  const warning = seconds <= 10 && !urgent;
  return (
    <div className={`timer ${urgent ? "timer--urgent" : warning ? "timer--warning" : ""}`} aria-label={`${seconds} ${label}`}>
      <Icon name={urgent ? "circleAlert" : "clock"} size={20} />
      <strong className="numeric">{seconds}</strong>
      <span className="timer__unit">sec</span>
      <span className="timer__track" aria-hidden="true">
        <span style={{ inlineSize: `${Math.max(0, Math.min(100, (seconds / total) * 100))}%` }} />
      </span>
    </div>
  );
}

function MaskedWord({ drawer = false }) {
  return drawer ? (
    <div className="word-display word-display--drawer">
      <span>Your word</span>
      <strong>LIGHTHOUSE</strong>
    </div>
  ) : (
    <div className="word-display" aria-label="One word, ten letters">
      <span>One word · 10 letters</span>
      <strong aria-hidden="true">_ _ _ _ _ _ _ _ _ _</strong>
    </div>
  );
}

function StaticDrawing({ dimmed = false, revealSubject = false }) {
  const titleId = useId();
  const descriptionId = useId();
  return (
    <figure className={`drawing-canvas ${dimmed ? "drawing-canvas--dimmed" : ""}`} data-od-id="drawing-canvas">
      <svg viewBox="0 0 820 520" role="img" aria-labelledby={`${titleId} ${descriptionId}`}>
        <title id={titleId}>A sample drawing in progress</title>
        <desc id={descriptionId}>
          {revealSubject
            ? "A rocky lighthouse by the sea beneath a crescent moon and two clouds."
            : "A static drawing with blue and teal waves, a striped tower-like shape, a yellow beam, a crescent moon, and two clouds."}
        </desc>
        <path d="M72 398c100-34 182-30 267 8 92 40 195 38 402-20" fill="none" stroke="oklch(0.488 0.217 264.4)" strokeWidth="16" strokeLinecap="round" />
        <path d="M54 438c117-31 215-24 310 10 103 36 204 34 395-20" fill="none" stroke="oklch(0.511 0.086 186.4)" strokeWidth="12" strokeLinecap="round" />
        <path d="M430 394 475 174h92l54 220Z" fill="oklch(0.969 0.015 12.4)" stroke="oklch(0.278 0.03 256.8)" strokeWidth="10" strokeLinejoin="round" />
        <path d="M461 247h120M447 317h151" fill="none" stroke="oklch(0.564 0.164 12.7)" strokeWidth="18" />
        <path d="M462 174 481 113h81l22 61Z" fill="oklch(0.973 0.069 103.2)" stroke="oklch(0.278 0.03 256.8)" strokeWidth="10" strokeLinejoin="round" />
        <path d="M505 111V74h31v37" fill="none" stroke="oklch(0.278 0.03 256.8)" strokeWidth="10" />
        <path d="M416 394h222l38 48H376Z" fill="oklch(0.637 0.017 77)" stroke="oklch(0.278 0.03 256.8)" strokeWidth="10" strokeLinejoin="round" />
        <path d="M584 143 744 101" fill="none" stroke="oklch(0.861 0.173 91.9)" strokeWidth="24" strokeLinecap="round" opacity=".75" />
        <path d="M114 130c32-36 66-37 99-2 31-24 66-17 83 15H110" fill="none" stroke="oklch(0.278 0.03 256.8)" strokeWidth="9" strokeLinecap="round" />
        <path d="M242 86c17-23 40-29 65-10 25-18 57-5 64 21H238" fill="none" stroke="oklch(0.278 0.03 256.8)" strokeWidth="8" strokeLinecap="round" />
        <path d="M700 57c-29 13-37 43-19 67-30-9-45-44-28-69 11-18 31-27 47-27-4 8-4 19 0 29Z" fill="oklch(0.973 0.069 103.2)" stroke="oklch(0.278 0.03 256.8)" strokeWidth="8" />
      </svg>
      <figcaption className="sr-only">Static presentational artwork; drawing input is intentionally outside this prototype.</figcaption>
    </figure>
  );
}

function DrawingToolbar({ disabled = false, onClear }) {
  const [tool, setTool] = useState("brush");
  const [fillMode, setFillMode] = useState("outline");
  const [color, setColor] = useState("ink");
  const [size, setSize] = useState(8);
  const tools = [
    ["brush", "brush", "Brush"],
    ["eraser", "eraser", "Eraser"],
    ["line", "line", "Line"],
    ["rectangle", "rectangle", "Rectangle"],
    ["ellipse", "ellipse", "Ellipse"]
  ];
  const colors = [
    ["ink", "Ink", "var(--color-ink)"],
    ["cobalt", "Cobalt blue", "var(--color-primary)"],
    ["coral", "Coral red", "var(--color-accent)"],
    ["teal", "Teal green", "var(--color-success)"],
    ["yellow", "Pencil yellow", "var(--color-highlight)"]
  ];
  return (
    <section className="drawing-tools" aria-labelledby="drawing-tools-title" data-od-id="drawing-toolbar">
      <div className="drawing-tools__title">
        <strong id="drawing-tools-title">Drawing tools</strong>
        <span className="muted">Static controls for review</span>
      </div>
      <div className="tool-row tool-row--primary" role="toolbar" aria-label="Drawing tool selection" onKeyDown={handleRovingKeys}>
        {tools.map(([value, icon, label]) => (
          <IconButton key={value} icon={icon} label={label} selected={tool === value} disabled={disabled} onClick={() => setTool(value)} />
        ))}
      </div>
      <div className="tool-row tool-row--mode" role="group" aria-label="Outline or fill" onKeyDown={handleRovingKeys}>
        <button type="button" className={`tool-choice ${fillMode === "outline" ? "is-selected" : ""}`} aria-pressed={fillMode === "outline"} disabled={disabled} onClick={() => setFillMode("outline")}>
          <Icon name="rectangle" size={20} /> Outline
        </button>
        <button type="button" className={`tool-choice ${fillMode === "fill" ? "is-selected" : ""}`} aria-pressed={fillMode === "fill"} disabled={disabled} onClick={() => setFillMode("fill")}>
          <Icon name="fill" size={20} /> Fill
        </button>
      </div>
      <fieldset className="swatch-fieldset" disabled={disabled}>
        <legend>Stroke color</legend>
        <div className="swatch-row" role="radiogroup" aria-label="Stroke color" onKeyDown={handleRovingKeys}>
          {colors.map(([value, label, swatch]) => (
            <button
              type="button"
              key={value}
              className={`swatch ${color === value ? "is-selected" : ""}`}
              style={{ "--swatch": swatch }}
              role="radio"
              aria-checked={color === value}
              aria-label={label}
              disabled={disabled}
              onClick={() => setColor(value)}
            >
              {color === value ? <Icon name="check" size={18} /> : null}
            </button>
          ))}
          <label className="custom-color">
            <span className="sr-only">Custom stroke color</span>
            <Icon name="palette" size={20} />
            <input type="color" defaultValue="#1D4ED8" disabled={disabled} />
          </label>
        </div>
      </fieldset>
      <label className="size-control">
        <span>Brush size <strong className="numeric">{size}px</strong></span>
        <input type="range" min="2" max="28" step="2" value={size} disabled={disabled} onChange={(event) => setSize(event.target.value)} />
      </label>
      <div className="tool-row tool-row--history" role="toolbar" aria-label="Drawing history" onKeyDown={handleRovingKeys}>
        <IconButton icon="undo" label="Undo last stroke" disabled={disabled} />
        <IconButton icon="redo" label="Redo stroke" disabled />
        <Button variant="danger-quiet" icon="trash" aria-label="Clear canvas" disabled={disabled} onClick={onClear}>Clear</Button>
      </div>
    </section>
  );
}

function ChatPanel({
  mode = "guesser",
  guessed = false,
  titleId = "chat-title",
  inputId = "guess-input",
  odId = "chat-panel"
}) {
  const [guess, setGuess] = useState("");
  const [sent, setSent] = useState(false);
  const submit = (event) => {
    event.preventDefault();
    if (!guess.trim()) return;
    setSent(true);
    setGuess("");
  };
  return (
    <Panel as="aside" className="chat-panel" aria-labelledby={titleId} data-od-id={odId}>
      <div className="split panel__heading">
        <h2 id={titleId}>Guesses & chat</h2>
        <StatusBadge icon="users">5 here</StatusBadge>
      </div>
      <div
        className="chat-log"
        role="log"
        aria-label="Public room messages"
        aria-live="polite"
        aria-relevant="additions text"
      >
        <div className="chat-event"><Icon name="checkCircle" size={16} /><span><strong>Priya</strong> guessed the word.</span></div>
        <div className="chat-message"><strong>Leo</strong><span>beacon?</span><time>8:42</time></div>
        <div className="chat-message"><strong>Noah</strong><span>tower by the sea</span><time>8:42</time></div>
        <div className="chat-event"><Icon name="checkCircle" size={16} /><span><strong>Noah</strong> guessed the word.</span></div>
        <div className="chat-message"><strong>Amara</strong><span>coast guard?</span><time>8:43</time></div>
        {sent ? <div className="chat-message chat-message--own"><strong>You</strong><span>Your mock guess was sent.</span><time>now</time></div> : null}
      </div>
      {mode === "drawer" ? (
        <div className="composer composer--disabled">
          <Icon name="lock" size={20} />
          <div><strong>Chat is paused while you draw</strong><span>Keep the word secret until the turn ends.</span></div>
        </div>
      ) : guessed ? (
        <div className="composer composer--disabled">
          <Icon name="eye" size={20} />
          <div><strong>Answer-equivalent messages are suppressed</strong><span>You can watch the drawing without revealing the word.</span></div>
        </div>
      ) : (
        <form className="composer" onSubmit={submit}>
          <label htmlFor={inputId}>Your guess</label>
          <div className="composer__row">
            <input id={inputId} value={guess} maxLength="60" placeholder="Type a guess" onChange={(event) => setGuess(event.target.value)} />
            <IconButton icon="send" label="Send guess" type="submit" />
          </div>
        </form>
      )}
    </Panel>
  );
}

function ConfirmDialog({ open, title, description, confirmLabel, tone = "danger", onConfirm, onClose }) {
  const closeRef = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handler = (event) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab") return;
      const focusable = dialogRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]");
      if (!focusable?.length) return;
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
      window.removeEventListener("keydown", handler);
      openerRef.current?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="dialog-layer" role="presentation">
      <div className="dialog-scrim" onClick={onClose} />
      <section ref={dialogRef} className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
        <div className="split">
          <h2 id="confirm-dialog-title">{title}</h2>
          <IconButton inputRef={closeRef} icon="x" label="Close dialog" onClick={onClose} />
        </div>
        <p id="confirm-dialog-description">{description}</p>
        <div className="cluster dialog__actions">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </section>
    </div>
  );
}

function MobileSupport({ players, mode, guessed }) {
  const [sheet, setSheet] = useState(null);
  const closeRef = useRef(null);
  const sheetRef = useRef(null);
  const openerRef = useRef(null);
  useEffect(() => {
    if (!sheet) return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    const handler = (event) => {
      if (event.key === "Escape") setSheet(null);
      if (event.key !== "Tab") return;
      const focusable = sheetRef.current?.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href]");
      if (!focusable?.length) return;
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
      window.removeEventListener("keydown", handler);
      openerRef.current?.focus();
    };
  }, [sheet]);
  return (
    <>
      <div className="mobile-support-tabs" role="group" aria-label="Open game information">
        <Button variant="secondary" icon="users" onClick={() => setSheet("players")}>Players</Button>
        <Button variant="secondary" icon="menu" onClick={() => setSheet("chat")}>Chat · 2 new</Button>
      </div>
      {sheet ? (
        <div className="sheet-layer">
          <div className="sheet-scrim" onClick={() => setSheet(null)} />
          <section ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-sheet-title">
            <div className="split sheet__heading">
              <h2 id="mobile-sheet-title">{sheet === "players" ? "Players & scores" : "Guesses & chat"}</h2>
              <button ref={closeRef} type="button" className="icon-button" aria-label="Close sheet" onClick={() => setSheet(null)}><Icon name="x" size={22} /></button>
            </div>
            {sheet === "players" ? (
              <PlayersPanel players={players} ranked titleId="mobile-players-title" odId="mobile-players-panel" />
            ) : (
              <ChatPanel
                mode={mode}
                guessed={guessed}
                titleId="mobile-chat-title"
                inputId="mobile-sheet-guess-input"
                odId="mobile-chat-panel"
              />
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}

function Leaderboard({ players, final = false }) {
  return (
    <ol className={`leaderboard ${final ? "leaderboard--final" : ""}`}>
      {players.map((player, index) => (
        <li key={player.name} className={index === 0 ? "leaderboard__winner" : ""}>
          <span className="leaderboard__place numeric">{index + 1}</span>
          <Avatar name={player.name} size={48} {...player.avatar} />
          <div><strong>{player.name}{player.isYou ? " · You" : ""}</strong>{index === 0 && final ? <span><Icon name="trophy" size={15} /> Winner</span> : <span>{player.status || "Finished"}</span>}</div>
          {player.delta ? <span className="leaderboard__delta numeric">+{player.delta}</span> : null}
          <strong className="leaderboard__score numeric">{player.score}</strong>
        </li>
      ))}
    </ol>
  );
}

Object.assign(window, {
  GTDComponents: {
    Avatar,
    Banner,
    Button,
    ChatPanel,
    ConfirmDialog,
    DrawingToolbar,
    Field,
    IconButton,
    Leaderboard,
    MaskedWord,
    MobileSupport,
    PageHeader,
    Panel,
    PlayerRow,
    PlayersPanel,
    RoomCode,
    SelectField,
    StaticDrawing,
    StatusBadge,
    Timer
  }
});
})();
