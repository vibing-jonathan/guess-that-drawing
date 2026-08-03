(() => {
const {
  Avatar,
  Banner,
  Button,
  Field,
  IconButton,
  PageHeader,
  Panel,
  PlayerRow,
  PlayersPanel,
  RoomCode,
  SelectField,
  StatusBadge
} = window.GTDComponents;
const { Icon } = window.GTDIcons;
const { useMemo, useState } = React;

const BASE_PLAYERS = [
  { name: "Maya", score: 1840, status: "Ready", isHost: true, avatar: { skin: "deep", hair: "curls", eyes: "bright", mouth: "smile", accessory: "glasses", background: "yellow" } },
  { name: "Priya", score: 1610, status: "Ready", avatar: { skin: "warm", hair: "wave", eyes: "wink", mouth: "smile", accessory: "none", background: "teal" } },
  { name: "Noah", score: 1380, status: "Ready", avatar: { skin: "light", hair: "crop", eyes: "round", mouth: "calm", accessory: "cap", background: "cobalt" } },
  { name: "Leo", score: 1120, status: "Choosing avatar", avatar: { skin: "olive", hair: "wave", eyes: "bright", mouth: "open", accessory: "none", background: "coral" } },
  { name: "Amara", score: 980, status: "Ready", avatar: { skin: "deep", hair: "wave", eyes: "round", mouth: "smile", accessory: "none", background: "cobalt" } }
];

const BUNDLED_THEMES = [
  { id: "general", name: "General", icon: "sparkles", description: "Everyday objects, actions, and ideas.", examples: "Backpack · Parade · Lighthouse", count: 860 },
  { id: "animals", name: "Animals", icon: "users", description: "Wild, domestic, tiny, and enormous.", examples: "Axolotl · Meerkat · Walrus", count: 310 },
  { id: "food", name: "Food", icon: "ellipse", description: "Dishes, ingredients, and kitchen favorites.", examples: "Dumplings · Avocado · Tiramisu", count: 280 },
  { id: "places", name: "Places", icon: "home", description: "Landmarks, landscapes, and destinations.", examples: "Venice · Volcano · Treehouse", count: 240 },
  { id: "games", name: "Video Game Characters", icon: "user", description: "Recognizable characters across game eras.", examples: "Kirby · Lara Croft · Sonic", count: 190 },
  { id: "music", name: "Songs / Music", icon: "music", description: "Songs, instruments, genres, and stage moments.", examples: "Bohemian Rhapsody · Banjo · Jazz", count: 220 }
];

const INITIAL_CUSTOM_WORDS = [
  "Lighthouse", "Roller skates", "Picnic basket", "Rain boots", "Hot-air balloon",
  "Treasure map", "Snow globe", "Garden hose", "Paper airplane", "Disco ball",
  "Campfire", "Telescope", "Wind chime", "Treehouse", "Coffee grinder",
  "Bowling alley", "Bookmobile", "Sandcastle", "Umbrella stand", "Record player",
  "Lighthouse", "Watering can", "Pocket watch"
];

function HomeScreen({ onNavigate }) {
  return (
    <main id="main-content" className="home-screen" aria-labelledby="home-title" data-od-id="home-screen">
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="page-kicker">Draw together · guess out loud</p>
          <h1 id="home-title">A blank page.<br />A room full of guesses.</h1>
          <p className="lede">Make a private room, choose a theme, and turn delightfully imperfect drawings into the best part of game night.</p>
          <div className="home-actions">
            <Button icon="plus" onClick={() => onNavigate("profile")}>Create a room</Button>
            <Button variant="secondary" icon="key" onClick={() => onNavigate("join")}>Join a room</Button>
          </div>
          <p className="home-note"><Icon name="users" size={18} /> 2–12 players · no account required</p>
        </div>
        <div className="tabletop-preview" aria-label="A sample drawing prompt on a tabletop" data-od-id="home-preview">
          <div className="prompt-slip">
            <span>Your word</span>
            <strong>LIGHTHOUSE</strong>
          </div>
          <svg className="home-sketch" viewBox="0 0 560 390" role="img" aria-labelledby="home-sketch-title">
            <title id="home-sketch-title">A simple line drawing of a lighthouse and waves</title>
            <rect x="12" y="12" width="536" height="366" rx="16" fill="var(--color-canvas)" stroke="var(--color-ink)" strokeWidth="6" />
            <path d="M54 310c90-33 173-26 236 9 77 42 132 39 217 3M51 342c82-24 162-20 228 8 81 35 147 33 235-2" fill="none" stroke="var(--color-primary)" strokeWidth="12" strokeLinecap="round" />
            <path d="M255 304 286 126h72l39 178Z" fill="var(--color-accent-subtle)" stroke="var(--color-ink)" strokeWidth="7" />
            <path d="M275 199h101M265 251h123" stroke="var(--color-accent)" strokeWidth="13" />
            <path d="M279 126 293 81h57l16 45ZM310 80V54h23v26" fill="var(--color-highlight-subtle)" stroke="var(--color-ink)" strokeWidth="7" />
            <path d="M359 105 476 71" stroke="var(--color-highlight)" strokeWidth="18" strokeLinecap="round" />
          </svg>
          <span className="preview-caption">The canvas stays clean. The room brings the chaos.</span>
        </div>
      </section>
    </main>
  );
}

const AVATAR_OPTIONS = {
  face: [["round", "Round"], ["oval", "Oval"], ["soft-square", "Soft square"]],
  skin: [["light", "Light"], ["warm", "Warm"], ["olive", "Olive"], ["deep", "Deep"]],
  hair: [["wave", "Wave"], ["crop", "Crop"], ["curls", "Curls"]],
  eyes: [["round", "Round"], ["bright", "Bright"], ["wink", "Wink"]],
  mouth: [["smile", "Smile"], ["calm", "Calm"], ["open", "Open"]],
  accessory: [["none", "None"], ["glasses", "Glasses"], ["cap", "Cap"]],
  background: [["cobalt", "Cobalt"], ["teal", "Teal"], ["yellow", "Yellow"], ["coral", "Coral"]]
};

function LayerControl({ label, value, options, onChange }) {
  const onKeyDown = (event) => {
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
  };
  return (
    <fieldset className="layer-control">
      <legend>{label}</legend>
      <div className="segmented" role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            className={value === optionValue ? "is-selected" : ""}
            role="radio"
            aria-checked={value === optionValue}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function ProfileScreen({ onNavigate }) {
  const [name, setName] = useState("Priya");
  const [submitted, setSubmitted] = useState(false);
  const [avatar, setAvatar] = useState({
    face: "round", skin: "warm", hair: "wave", eyes: "wink",
    mouth: "smile", accessory: "none", background: "teal"
  });
  const trimmed = name.trim();
  const nameError = submitted && trimmed.length < 2
    ? "Use at least 2 characters."
    : submitted && trimmed.length > 18
      ? "Keep your guest name to 18 characters."
      : submitted && /^(guest|player)$/i.test(trimmed)
        ? "Choose a name your friends will recognize."
        : "";
  const submit = (event) => {
    event.preventDefault();
    setSubmitted(true);
    if (trimmed.length >= 2 && trimmed.length <= 18 && !/^(guest|player)$/i.test(trimmed)) {
      onNavigate("create");
    }
  };
  return (
    <main id="main-content" className="page-shell profile-screen" aria-labelledby="profile-title" data-od-id="profile-screen">
      <PageHeader kicker="Guest profile" title="Make yourself recognizable" description="This name and avatar stay with you for the room. No account or upload needed." id="profile-title" />
      <form className="profile-workspace" onSubmit={submit} noValidate>
        <Panel className="avatar-preview-panel">
          <span className="eyebrow">Live preview</span>
          <Avatar name={trimmed || "Guest"} size={176} {...avatar} />
          <strong>{trimmed || "Your name"}</strong>
          <StatusBadge icon="user" tone="primary">Guest player</StatusBadge>
        </Panel>
        <div className="profile-controls">
          <Field
            id="guest-name"
            label="Display name"
            value={name}
            maxLength="24"
            autoComplete="nickname"
            error={nameError}
            help={!nameError ? "2–18 characters. You can change it before joining." : undefined}
            onChange={(event) => setName(event.target.value)}
          />
          <div className="avatar-layers" aria-label="Avatar maker controls">
            {Object.entries(AVATAR_OPTIONS).map(([key, options]) => (
              <LayerControl
                key={key}
                label={key.charAt(0).toUpperCase() + key.slice(1)}
                value={avatar[key]}
                options={options}
                onChange={(value) => setAvatar((current) => ({ ...current, [key]: value }))}
              />
            ))}
          </div>
          <div className="form-actions">
            <Button variant="secondary" icon="arrowLeft" onClick={() => onNavigate("home")}>Back</Button>
            <Button type="submit" icon="arrowRight">Save and create room</Button>
          </div>
        </div>
      </form>
    </main>
  );
}

const GAME_MODES = {
  classic: {
    name: "Classic",
    icon: "brush",
    description: "Take turns drawing while everyone else races to guess.",
    note: "Scores reward quick correct guesses."
  },
  pro: {
    name: "Pro",
    icon: "trophy",
    description: "Classic play with a cost for throwing out incorrect guesses.",
    note: "Each incorrect guess subtracts 25 points."
  },
  phone: {
    name: "Phone",
    icon: "link",
    description: "Everyone writes, draws, and guesses at the same time in private chains.",
    note: "Four links · no theme, chat, or scores."
  }
};

function SetupSteps({ active = 2, mode = "classic" }) {
  const steps = mode === "phone"
    ? ["Profile", "Mode & settings", "Review"]
    : ["Profile", "Mode & settings", "Theme", "Review"];
  return (
    <ol className="setup-steps" aria-label={`Step ${active} of ${steps.length}`}>
      {steps.map((step, index) => (
        <li key={step} className={index + 1 === active ? "is-current" : index + 1 < active ? "is-complete" : ""}>
          <span className="numeric">{index + 1}</span>
          <strong>{step}</strong>
          {index + 1 < active ? <Icon name="check" size={16} /> : null}
        </li>
      ))}
    </ol>
  );
}

function ModeCards({ mode, onChange }) {
  const options = Object.entries(GAME_MODES);
  const onKeyDown = (event) => {
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
  };
  return (
    <fieldset className="mode-picker">
      <legend>Game mode</legend>
      <div className="mode-grid" role="radiogroup" aria-label="Game mode" onKeyDown={onKeyDown}>
        {options.map(([value, option], index) => (
          <button
            key={value}
            type="button"
            className={`mode-card ${mode === value ? "is-selected" : ""}`}
            role="radio"
            aria-checked={mode === value}
            tabIndex={mode === value || (!mode && index === 0) ? 0 : -1}
            onClick={() => onChange(value)}
            data-od-id={`mode-card-${value}`}
          >
            <span className="mode-card__icon"><Icon name={option.icon} size={24} /></span>
            <span className="mode-card__copy">
              <strong>{option.name}</strong>
              <span>{option.description}</span>
              <small>{option.note}</small>
            </span>
            {mode === value ? <span className="mode-card__selected"><Icon name="check" size={16} /> Selected</span> : null}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CreateRoomScreen({ onNavigate, initialMode = "classic" }) {
  const [mode, setMode] = useState(initialMode);
  const [cap, setCap] = useState("8");
  const [cycles, setCycles] = useState("3");
  const [time, setTime] = useState("90");
  const [wordTime, setWordTime] = useState("15");
  const [textTime, setTextTime] = useState("60");
  const [drawingTime, setDrawingTime] = useState("120");
  const phoneMode = mode === "phone";
  const proMode = mode === "pro";
  const submit = (event) => {
    event.preventDefault();
    onNavigate(phoneMode ? "setup-review-phone" : `themes-${mode}`);
  };
  return (
    <main id="main-content" className={`page-shell create-screen create-screen--${mode}`} aria-labelledby="create-title" data-od-id={`create-room-${mode}-screen`}>
      <PageHeader
        kicker={`Step 2 of ${phoneMode ? 3 : 4}`}
        title="Choose how the room plays"
        description="Pick a mode, then set the room rules. The host can adjust these settings in the lobby."
        id="create-title"
      />
      <div className="setup-layout">
        <SetupSteps active={2} mode={mode} />
        <Panel className="settings-form" as="form" onSubmit={submit}>
          <ModeCards mode={mode} onChange={setMode} />
          {phoneMode ? (
            <div className="settings-grid">
              <SelectField id="phone-player-cap" label="Player cap" value={cap} onChange={(event) => setCap(event.target.value)} help="Phone Mode needs at least 4 players.">
                {[4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} players</option>)}
              </SelectField>
              <SelectField id="text-timer" label="Text timer" value={textTime} onChange={(event) => setTextTime(event.target.value)} help="Authoritative deadline for phases 1 and 3.">
                {[30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} seconds</option>)}
              </SelectField>
              <SelectField id="drawing-timer" label="Drawing timer" value={drawingTime} onChange={(event) => setDrawingTime(event.target.value)} help="Authoritative deadline for phases 2 and 4.">
                {[60, 90, 120, 150, 180].map((value) => <option key={value} value={value}>{value} seconds</option>)}
              </SelectField>
              <div className="fixed-setting"><span>Story chain</span><strong>4 links</strong><small>Sentence → drawing → sentence → drawing</small></div>
              <div className="fixed-setting"><span>Theme</span><strong>Not used</strong><small>Every starting sentence comes from a player.</small></div>
            </div>
          ) : (
            <div className="settings-grid">
              <SelectField id="player-cap" label="Player cap" value={cap} onChange={(event) => setCap(event.target.value)} help="Between 2 and 12 players.">
                {[2, 4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} players</option>)}
              </SelectField>
              <SelectField id="drawing-cycles" label="Drawing cycles" value={cycles} onChange={(event) => setCycles(event.target.value)}>
                {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} {value === 1 ? "cycle" : "cycles"}</option>)}
              </SelectField>
              <SelectField id="turn-time" label="Turn time" value={time} onChange={(event) => setTime(event.target.value)}>
                {[45, 60, 90, 120, 180].map((value) => <option key={value} value={value}>{value} seconds</option>)}
              </SelectField>
              <SelectField id="word-selection-time" label="Word selection time" value={wordTime} onChange={(event) => setWordTime(event.target.value)}>
                {[10, 15, 20, 30].map((value) => <option key={value} value={value}>{value} seconds</option>)}
              </SelectField>
            </div>
          )}
          {proMode ? (
            <Banner tone="warning" icon="circleAlert" title="Incorrect guesses cost 25 points">
              The −25 score change is immediate, signed, and visible only after a submitted guess is judged incorrect.
            </Banner>
          ) : phoneMode ? (
            <Banner tone="info" icon="lock" title="Private until the story summary">
              Players act simultaneously. Assigned prompts hide their author, and Phone Mode has no room chat or scores.
            </Banner>
          ) : null}
          <Banner tone="info" icon="lock" title="Private by default">Rooms are not listed publicly. Only people with the code can enter.</Banner>
          <div className="form-actions">
            <Button variant="secondary" icon="arrowLeft" onClick={() => onNavigate("profile")}>Back</Button>
            <Button type="submit" icon="arrowRight">{phoneMode ? "Review Phone room" : "Choose a theme"}</Button>
          </div>
        </Panel>
        <aside className="setup-summary" aria-label="Room summary">
          <span className="eyebrow">Current setup</span>
          <dl>
            <div><dt>Mode</dt><dd>{GAME_MODES[mode].name}</dd></div>
            <div><dt>Players</dt><dd>Up to {cap}</dd></div>
            {phoneMode ? (
              <>
                <div><dt>Phases</dt><dd>4 simultaneous</dd></div>
                <div><dt>Text timer</dt><dd>{textTime} sec</dd></div>
                <div><dt>Drawing timer</dt><dd>{drawingTime} sec</dd></div>
                <div><dt>Theme</dt><dd>Skipped</dd></div>
              </>
            ) : (
              <>
                <div><dt>Cycles</dt><dd>{cycles}</dd></div>
                <div><dt>Turn</dt><dd>{time} sec</dd></div>
                <div><dt>Word selection</dt><dd>{wordTime} sec</dd></div>
                {proMode ? <div><dt>Wrong guess</dt><dd>−25 points</dd></div> : null}
              </>
            )}
          </dl>
        </aside>
      </div>
    </main>
  );
}

const JOIN_ERRORS = {
  duplicate: { icon: "user", title: "That name is already in this room", copy: "Try “Priya R.” or choose another guest name.", action: "Update name" },
  invalid: { icon: "circleX", title: "Room not found", copy: "Check the code and try again. Room codes are six letters.", action: "Try another code" },
  expired: { icon: "clock", title: "This room has ended", copy: "The host closed it or the session expired.", action: "Create a new room" },
  full: { icon: "users", title: "Room is full", copy: "All 8 player spots are taken.", action: "Try another room" },
  kicked: { icon: "logOut", title: "You were removed", copy: "The host removed you from this room. No private room data was kept.", action: "Back home" },
  server: { icon: "cloudOff", title: "The game server is unavailable", copy: "We could not check this room. Your code is still here when you retry.", action: "Try again" }
};

function JoinScreen({ onNavigate, errorType }) {
  const [code, setCode] = useState("SKETCH");
  const [name, setName] = useState("Priya");
  const error = JOIN_ERRORS[errorType];
  const submit = (event) => {
    event.preventDefault();
    if (!error) onNavigate("lobby-guest");
    else onNavigate("join");
  };
  return (
    <main id="main-content" className="page-shell join-screen" aria-labelledby="join-title" data-od-id="join-room-screen">
      <PageHeader kicker="Join by code" title="Pull up a chair" description="Enter the code from your host. Spaces and hyphens are ignored." id="join-title" />
      <Panel className="join-card" as="form" onSubmit={submit}>
        {error ? (
          <Banner tone={errorType === "server" ? "danger" : "warning"} icon={error.icon} title={error.title} role="alert">
            {error.copy}
          </Banner>
        ) : null}
        <Field id="join-code" label="Room code" help="Six letters, shown on the host’s lobby screen.">
          <input
            id="join-code"
            className="join-code-input numeric"
            value={code}
            maxLength="6"
            autoCapitalize="characters"
            autoComplete="off"
            aria-invalid={errorType === "invalid" ? true : undefined}
            aria-describedby="join-code-description"
            onChange={(event) => setCode(event.target.value.toUpperCase().replace(/[^A-Z]/g, ""))}
          />
        </Field>
        <Field
          id="join-name"
          label="Display name"
          value={name}
          maxLength="18"
          autoComplete="nickname"
          error={errorType === "duplicate" ? error.copy : undefined}
          onChange={(event) => setName(event.target.value)}
        />
        <div className="join-identity">
          <Avatar name={name || "Guest"} size={56} skin="warm" hair="wave" eyes="wink" background="teal" />
          <div><strong>{name || "Guest"}</strong><span>Guest profile · editable before joining</span></div>
          <IconButton icon="settings" label="Edit guest profile" onClick={() => onNavigate("profile")} />
        </div>
        <div className="form-actions">
          <Button variant="secondary" icon="arrowLeft" onClick={() => onNavigate("home")}>Back</Button>
          {errorType === "kicked" ? (
            <Button onClick={() => onNavigate("home")}>{error.action}</Button>
          ) : errorType === "expired" ? (
            <Button onClick={() => onNavigate("create")}>{error.action}</Button>
          ) : (
            <Button type="submit" icon={errorType === "server" ? "refresh" : "arrowRight"}>{error ? error.action : "Join room"}</Button>
          )}
        </div>
      </Panel>
    </main>
  );
}

function ThemeLibraryScreen({ onNavigate, mode = "classic" }) {
  const [selected, setSelected] = useState("general");
  return (
    <main id="main-content" className="page-shell page-shell--wide theme-screen" aria-labelledby="themes-title" data-od-id={`theme-library-${mode}-screen`}>
      <PageHeader
        kicker="Step 3 of 4"
        title={`Pick the ${GAME_MODES[mode].name} prompt deck`}
        description="Bundled themes are ready to play. Custom themes stay private to your room. Phone Mode skips this step."
        id="themes-title"
        actions={<Button variant="secondary" icon="plus" onClick={() => onNavigate(`theme-editor-${mode}`)}>New custom theme</Button>}
      />
      <div className="theme-grid" role="radiogroup" aria-label="Bundled themes">
        {BUNDLED_THEMES.map((theme) => (
          <button
            key={theme.id}
            type="button"
            className={`theme-card ${selected === theme.id ? "is-selected" : ""}`}
            role="radio"
            aria-checked={selected === theme.id}
            onClick={() => setSelected(theme.id)}
            data-od-id={`theme-${theme.id}`}
          >
            <span className="theme-card__icon"><Icon name={theme.icon} size={26} /></span>
            <span className="theme-card__body">
              <strong>{theme.name}</strong>
              <span>{theme.description}</span>
              <small>{theme.examples}</small>
            </span>
            <span className="theme-card__count numeric">{theme.count} words</span>
            {selected === theme.id ? <span className="theme-card__selected"><Icon name="check" size={16} /> Selected</span> : null}
          </button>
        ))}
      </div>
      <div className="form-actions">
        <Button variant="secondary" icon="arrowLeft" onClick={() => onNavigate(`setup-${mode}`)}>Back</Button>
        <Button icon="arrowRight" onClick={() => onNavigate(`setup-review-${mode}`)}>Review with {BUNDLED_THEMES.find((theme) => theme.id === selected)?.name}</Button>
      </div>
    </main>
  );
}

function ReviewRoomScreen({ onNavigate, mode = "classic" }) {
  const phoneMode = mode === "phone";
  const proMode = mode === "pro";
  const lobbyTarget = phoneMode ? "lobby-phone-host" : proMode ? "lobby-pro-host" : "lobby-host";
  return (
    <main id="main-content" className="page-shell review-screen" aria-labelledby="review-title" data-od-id={`setup-review-${mode}-screen`}>
      <PageHeader
        kicker={`Step ${phoneMode ? 3 : 4} of ${phoneMode ? 3 : 4}`}
        title={`Review the ${GAME_MODES[mode].name} room`}
        description="These are the rules players will see before the host starts."
        id="review-title"
      />
      <div className="setup-layout">
        <SetupSteps active={phoneMode ? 3 : 4} mode={mode} />
        <Panel className="review-panel" aria-labelledby="review-settings-title">
          <div className="split panel__heading">
            <h2 id="review-settings-title">Sunday sketch club</h2>
            <StatusBadge tone="primary" icon={GAME_MODES[mode].icon}>{GAME_MODES[mode].name}</StatusBadge>
          </div>
          <p>{GAME_MODES[mode].description}</p>
          <dl className="settings-summary">
            <div><dt>Players</dt><dd>{phoneMode ? "4–12" : "Up to 8"}</dd></div>
            {phoneMode ? (
              <>
                <div><dt>Flow</dt><dd>4 simultaneous phases</dd></div>
                <div><dt>Text timer</dt><dd>60 seconds</dd></div>
                <div><dt>Drawing timer</dt><dd>120 seconds</dd></div>
                <div><dt>Prompt source</dt><dd>Player sentences</dd></div>
                <div><dt>Chat & scores</dt><dd>Off</dd></div>
              </>
            ) : (
              <>
                <div><dt>Drawing cycles</dt><dd>3</dd></div>
                <div><dt>Turn time</dt><dd>90 seconds</dd></div>
                <div><dt>Word selection time</dt><dd>15 seconds</dd></div>
                <div><dt>Theme</dt><dd>General</dd></div>
                {proMode ? <div><dt>Incorrect guess</dt><dd>−25 points</dd></div> : null}
              </>
            )}
          </dl>
          <Banner tone={proMode ? "warning" : "info"} icon={phoneMode ? "lock" : proMode ? "circleAlert" : "brush"} title={phoneMode ? "Private chain rules" : proMode ? "Penalty is active" : "Classic room"}>
            {phoneMode
              ? "Assigned content hides its author until the synchronized story summary."
              : proMode
                ? "Every judged incorrect guess shows a signed −25 score delta."
                : "Players take turns drawing and guessing with the selected theme."}
          </Banner>
          <div className="form-actions">
            <Button variant="secondary" icon="arrowLeft" onClick={() => onNavigate(phoneMode ? "setup-phone" : `themes-${mode}`)}>Back</Button>
            <Button icon="arrowRight" onClick={() => onNavigate(lobbyTarget)}>Create {GAME_MODES[mode].name} room</Button>
          </div>
        </Panel>
        <aside className="setup-summary" aria-label="Mode review">
          <span className="eyebrow">What players see</span>
          <p>{GAME_MODES[mode].note}</p>
          <StatusBadge icon="lock">Private room code</StatusBadge>
        </aside>
      </div>
    </main>
  );
}

function ThemeEditorScreen({ onNavigate, mode = "classic" }) {
  const [themeName, setThemeName] = useState("Rainy-day favorites");
  const [words, setWords] = useState(INITIAL_CUSTOM_WORDS);
  const [newWord, setNewWord] = useState("");
  const [saved, setSaved] = useState(false);
  const normalized = words.map((word) => word.trim().toLocaleLowerCase()).filter(Boolean);
  const uniqueCount = new Set(normalized).size;
  const duplicateCount = normalized.length - uniqueCount;
  const valid = uniqueCount >= 20 && uniqueCount <= 500 && themeName.trim().length >= 3;
  const updateWord = (index, value) => setWords((current) => current.map((word, wordIndex) => wordIndex === index ? value : word));
  const removeWord = (index) => setWords((current) => current.filter((_, wordIndex) => wordIndex !== index));
  const addWord = (event) => {
    event.preventDefault();
    if (!newWord.trim()) return;
    setWords((current) => [...current, newWord.trim()]);
    setNewWord("");
  };
  const cleanup = () => {
    const seen = new Set();
    setWords((current) => current.filter((word) => {
      const key = word.trim().toLocaleLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    }));
  };
  const localThemes = [
    { name: "Weekend prompts", count: 34 },
    { name: "Travel stories", count: 26 }
  ];
  return (
    <main id="main-content" className="page-shell page-shell--wide editor-screen" aria-labelledby="editor-title" data-od-id={`custom-theme-editor-${mode}`}>
      <PageHeader kicker={`${GAME_MODES[mode].name} · Custom theme`} title="Build a private prompt deck" description="Edit locally, clean duplicates, then select the theme for this room." id="editor-title" />
      <div className="editor-layout">
        <aside className="saved-themes" aria-labelledby="saved-themes-title">
          <div className="split"><h2 id="saved-themes-title">Saved locally</h2><StatusBadge icon="save">2 themes</StatusBadge></div>
          <ul>
            {localThemes.map((theme) => (
              <li key={theme.name}>
                <button type="button"><strong>{theme.name}</strong><span className="numeric">{theme.count} words</span></button>
              </li>
            ))}
          </ul>
          <Button variant="secondary" icon="plus">New blank theme</Button>
        </aside>
        <Panel className="word-editor">
          <Field id="theme-name" label="Theme name" value={themeName} maxLength="40" onChange={(event) => setThemeName(event.target.value)} help="Visible only to people in this room." />
          <div className="word-editor__summary">
            <div><span>Unique words</span><strong className="numeric">{uniqueCount}</strong></div>
            <div><span>Allowed range</span><strong className="numeric">20–500</strong></div>
            <div><span>Duplicates</span><strong className="numeric">{duplicateCount}</strong></div>
          </div>
          {duplicateCount > 0 ? (
            <Banner
              tone="warning"
              icon="circleAlert"
              title={`${duplicateCount} duplicate ${duplicateCount === 1 ? "entry" : "entries"} found`}
              actions={<Button variant="secondary" icon="refresh" onClick={cleanup}>Clean duplicates</Button>}
            >
              Duplicate matching ignores capitalization and surrounding spaces.
            </Banner>
          ) : (
            <Banner tone="success" icon="checkCircle" title="No duplicates found">This deck has {uniqueCount} unique words.</Banner>
          )}
          <form className="add-word" onSubmit={addWord}>
            <Field id="new-word" label="Add a word or phrase" value={newWord} maxLength="48" placeholder="e.g. Solar eclipse" onChange={(event) => setNewWord(event.target.value)} />
            <Button type="submit" variant="secondary" icon="plus">Add</Button>
          </form>
          <div className="word-list-heading"><strong>Words</strong><span className="muted">Edit in place · one prompt per row</span></div>
          <ol className="word-list">
            {words.map((word, index) => {
              const key = word.trim().toLocaleLowerCase();
              const first = normalized.indexOf(key);
              const isDuplicate = key && first !== index;
              return (
                <li key={`${index}-${word}`}>
                  <span className="numeric">{index + 1}</span>
                  <label className="sr-only" htmlFor={`word-${index}`}>Prompt {index + 1}</label>
                  <input id={`word-${index}`} value={word} aria-invalid={isDuplicate} onChange={(event) => updateWord(index, event.target.value)} />
                  {isDuplicate ? <span className="duplicate-label"><Icon name="circleAlert" size={15} /> Duplicate</span> : null}
                  <IconButton icon="trash" label={`Delete ${word || `prompt ${index + 1}`}`} onClick={() => removeWord(index)} />
                </li>
              );
            })}
          </ol>
        </Panel>
        <aside className="editor-sidebar">
          <Panel>
            <h2>Private-room upload</h2>
            <p>Text and CSV lists are prepared locally for this room. They are not published or added to the bundled library.</p>
            <label className="file-control">
              <Icon name="fileUp" size={22} />
              <span>Choose .txt or .csv</span>
              <input type="file" accept=".txt,.csv,text/plain,text/csv" />
            </label>
            <small className="muted">Prototype only: file parsing and transfer are intentionally not implemented.</small>
          </Panel>
          <Panel className="validation-card">
            <h2>Ready check</h2>
            <ul>
              <li className={themeName.trim().length >= 3 ? "is-valid" : ""}><Icon name={themeName.trim().length >= 3 ? "checkCircle" : "circleAlert"} size={18} /> Named theme</li>
              <li className={uniqueCount >= 20 ? "is-valid" : ""}><Icon name={uniqueCount >= 20 ? "checkCircle" : "circleAlert"} size={18} /> At least 20 unique words</li>
              <li className={uniqueCount <= 500 ? "is-valid" : ""}><Icon name={uniqueCount <= 500 ? "checkCircle" : "circleAlert"} size={18} /> No more than 500 words</li>
              <li className={duplicateCount === 0 ? "is-valid" : ""}><Icon name={duplicateCount === 0 ? "checkCircle" : "circleAlert"} size={18} /> Duplicates removed</li>
            </ul>
            <Button icon={saved ? "check" : "save"} disabled={!valid} onClick={() => setSaved(true)}>{saved ? "Saved locally" : "Save theme"}</Button>
            <Button variant="secondary" icon="check" disabled={!valid} onClick={() => onNavigate(`setup-review-${mode}`)}>Save and review</Button>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function LobbyScreen({ onNavigate, role = "host", mode = "classic", phoneMinimum = false, onAnnounce }) {
  const isHost = role === "host";
  const phoneMode = mode === "phone";
  const proMode = mode === "pro";
  const [copied, setCopied] = useState(false);
  const [players, setPlayers] = useState(() => BASE_PLAYERS
    .slice(0, phoneMinimum ? 3 : BASE_PLAYERS.length)
    .map((player) => ({
    ...player,
    score: phoneMode ? undefined : player.score,
    isYou: isHost ? player.name === "Maya" : player.name === "Priya"
  })));
  const [cap, setCap] = useState("8");
  const [cycles, setCycles] = useState("3");
  const [time, setTime] = useState("90");
  const [wordTime, setWordTime] = useState("15");
  const [textTime, setTextTime] = useState("60");
  const [drawingTime, setDrawingTime] = useState("120");
  const copy = () => {
    setCopied(true);
    onAnnounce?.("Room code copied.");
    window.setTimeout(() => setCopied(false), 1800);
  };
  const kick = (name) => {
    setPlayers((current) => current.filter((player) => player.name !== name));
    onAnnounce?.(`${name} was removed from the prototype lobby.`);
  };
  return (
    <main id="main-content" className={`page-shell page-shell--wide lobby-screen lobby-screen--${mode}`} aria-labelledby="lobby-title" data-od-id={`${role}-${mode}-lobby-screen`}>
      <PageHeader
        kicker={`${GAME_MODES[mode].name} · ${isHost ? "Host lobby" : "Guest lobby"}`}
        title="Sunday sketch club"
        description={phoneMinimum
          ? "Phone Mode needs at least four players. Invite one more person to start the chain."
          : isHost
            ? "Everyone is here. Check the mode settings, then start when the room feels ready."
            : "You’re in. The host will start once everyone is ready."}
        id="lobby-title"
        actions={(
          <>
            <StatusBadge tone="primary" icon={GAME_MODES[mode].icon}>{GAME_MODES[mode].name}</StatusBadge>
            <StatusBadge tone="success" icon="wifi">Connected</StatusBadge>
          </>
        )}
      />
      <RoomCode code="SKETCH" copied={copied} onCopy={copy} />
      <div className="lobby-grid">
        <PlayersPanel players={players} showKick={isHost} onKick={kick} />
        <Panel className="lobby-settings" aria-labelledby="lobby-settings-title">
          <div className="split panel__heading">
            <h2 id="lobby-settings-title">Game settings</h2>
            <StatusBadge icon={isHost ? "settings" : "lock"}>{isHost ? "Host controls" : "Host locked"}</StatusBadge>
          </div>
          {isHost ? (
            phoneMode ? (
              <div className="settings-grid">
                <SelectField id="lobby-phone-cap" label="Player cap" value={cap} onChange={(event) => setCap(event.target.value)}>
                  {[4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} players</option>)}
                </SelectField>
                <SelectField id="lobby-text-timer" label="Text timer" value={textTime} onChange={(event) => setTextTime(event.target.value)} help="Authoritative deadline for phases 1 and 3.">
                  {[30, 45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} seconds</option>)}
                </SelectField>
                <SelectField id="lobby-drawing-timer" label="Drawing timer" value={drawingTime} onChange={(event) => setDrawingTime(event.target.value)} help="Authoritative deadline for phases 2 and 4.">
                  {[60, 90, 120, 150, 180].map((value) => <option key={value} value={value}>{value} seconds</option>)}
                </SelectField>
                <div className="fixed-setting"><span>Story chain</span><strong>4 links</strong><small>Sentence → drawing → sentence → drawing</small></div>
                <div className="fixed-setting"><span>Theme, chat & scores</span><strong>Off</strong><small>Content reveals only in the summary.</small></div>
              </div>
            ) : (
              <div className="settings-grid">
                <SelectField id="lobby-cap" label="Player cap" value={cap} onChange={(event) => setCap(event.target.value)}>
                  {[2, 4, 6, 8, 10, 12].map((value) => <option key={value} value={value}>{value} players</option>)}
                </SelectField>
                <SelectField id="lobby-cycles" label="Drawing cycles" value={cycles} onChange={(event) => setCycles(event.target.value)}>
                  {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>{value} cycles</option>)}
                </SelectField>
                <SelectField id="lobby-time" label="Turn time" value={time} onChange={(event) => setTime(event.target.value)}>
                  {[45, 60, 90, 120].map((value) => <option key={value} value={value}>{value} seconds</option>)}
                </SelectField>
                <SelectField id="lobby-word-time" label="Word selection time" value={wordTime} onChange={(event) => setWordTime(event.target.value)}>
                  {[10, 15, 20, 30].map((value) => <option key={value} value={value}>{value} seconds</option>)}
                </SelectField>
                <SelectField id="lobby-theme" label="Theme" value="general" onChange={() => {}}>
                  {BUNDLED_THEMES.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
                </SelectField>
                {proMode ? <div className="fixed-setting fixed-setting--penalty"><span>Incorrect guess</span><strong>−25 points</strong><small>Applied immediately after validation.</small></div> : null}
              </div>
            )
          ) : (
            <dl className="settings-summary">
              <div><dt>Mode</dt><dd>{GAME_MODES[mode].name}</dd></div>
              <div><dt>Player cap</dt><dd>8 players</dd></div>
              {phoneMode ? (
                <>
                  <div><dt>Flow</dt><dd>4 simultaneous phases</dd></div>
                  <div><dt>Text timer</dt><dd>60 seconds</dd></div>
                  <div><dt>Drawing timer</dt><dd>120 seconds</dd></div>
                  <div><dt>Chat & scores</dt><dd>Off</dd></div>
                </>
              ) : (
                <>
                  <div><dt>Drawing cycles</dt><dd>3</dd></div>
                  <div><dt>Turn time</dt><dd>90 seconds</dd></div>
                  <div><dt>Word selection time</dt><dd>15 seconds</dd></div>
                  <div><dt>Theme</dt><dd>General</dd></div>
                  {proMode ? <div><dt>Incorrect guess</dt><dd>−25 points</dd></div> : null}
                </>
              )}
            </dl>
          )}
          <Banner tone={phoneMinimum ? "warning" : "info"} icon={phoneMinimum ? "users" : "lock"} title={phoneMinimum ? "One more player needed" : phoneMode ? "Private Phone chains" : "Private room"}>
            {phoneMinimum
              ? "3 of the 4 required players are here. Start remains unavailable until the server confirms a fourth player."
              : phoneMode
                ? "Assigned authors stay hidden until summary. Phone Mode never shows room chat or scores."
                : proMode
                  ? "Custom prompts and room chat stay private. The −25 rule is visible to every player."
                  : "Custom prompts and room chat are visible only to this room."}
          </Banner>
        </Panel>
      </div>
      <div className="lobby-actionbar">
        <Button variant="secondary" icon="logOut" onClick={() => onNavigate("home")}>Leave room</Button>
        {isHost ? (
          <Button
            icon="arrowRight"
            disabled={phoneMinimum}
            onClick={() => onNavigate(phoneMode ? "phone-phase-write" : proMode ? "pro-game-drawer" : "word-select")}
          >
            {phoneMinimum ? "Need 1 more player" : `Start ${GAME_MODES[mode].name} · ${players.length} players`}
          </Button>
        ) : (
          <div className="waiting-status" role="status"><Icon name="clock" size={22} /><div><strong>Waiting for Maya</strong><span>Only the host can start the game.</span></div></div>
        )}
      </div>
    </main>
  );
}

Object.assign(window, {
  GTDData: { BASE_PLAYERS, BUNDLED_THEMES },
  GTDSetupScreens: {
    CreateRoomScreen,
    HomeScreen,
    JoinScreen,
    LobbyScreen,
    ProfileScreen,
    ReviewRoomScreen,
    ThemeEditorScreen,
    ThemeLibraryScreen
  }
});
})();
