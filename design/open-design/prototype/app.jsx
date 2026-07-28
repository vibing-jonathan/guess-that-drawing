(() => {
const { useEffect, useMemo, useState } = React;
const { Icon } = window.GTDIcons;
const {
  CreateRoomScreen,
  HomeScreen,
  JoinScreen,
  LobbyScreen,
  ProfileScreen,
  ThemeEditorScreen,
  ThemeLibraryScreen
} = window.GTDSetupScreens;
const {
  FinalResultsScreen,
  GameScreen,
  ServerOutageScreen,
  TurnResultsScreen,
  WordSelectionScreen
} = window.GTDGameScreens;

const PROTOTYPE_STATES = [
  { group: "Guest-first flow", id: "home", label: "Home" },
  { group: "Guest-first flow", id: "profile", label: "Profile + layered avatar" },
  { group: "Guest-first flow", id: "create", label: "Create room" },
  { group: "Guest-first flow", id: "join", label: "Join room" },
  { group: "Join errors", id: "join-duplicate", label: "Duplicate guest name" },
  { group: "Join errors", id: "join-invalid", label: "Invalid room" },
  { group: "Join errors", id: "join-expired", label: "Expired room" },
  { group: "Join errors", id: "join-full", label: "Full room" },
  { group: "Join errors", id: "join-kicked", label: "Kicked from room" },
  { group: "Join errors", id: "join-server", label: "Join server unavailable" },
  { group: "Themes", id: "themes", label: "Bundled theme library" },
  { group: "Themes", id: "theme-editor", label: "Custom theme editor" },
  { group: "Lobby", id: "lobby-host", label: "Lobby · host" },
  { group: "Lobby", id: "lobby-guest", label: "Lobby · guest" },
  { group: "Game", id: "word-select", label: "Drawer word selection" },
  { group: "Game", id: "game-drawer", label: "Game · active drawer" },
  { group: "Game", id: "game-guesser", label: "Game · active guesser" },
  { group: "Game", id: "game-close", label: "Game · private close guess" },
  { group: "Game", id: "game-guessed", label: "Game · already guessed" },
  { group: "Recovery", id: "game-reconnecting", label: "Reconnecting + resync" },
  { group: "Recovery", id: "game-paused", label: "Disconnected drawer pause" },
  { group: "Recovery", id: "game-stale", label: "Stale-state recovery" },
  { group: "Recovery", id: "server-outage", label: "Server outage retry" },
  { group: "Results", id: "turn-results", label: "Turn results" },
  { group: "Results", id: "final-results", label: "Final leaderboard" }
];

function PrototypeSwitcher({ state, onChange }) {
  const currentIndex = PROTOTYPE_STATES.findIndex((item) => item.id === state);
  const grouped = useMemo(() => PROTOTYPE_STATES.reduce((result, item) => {
    if (!result[item.group]) result[item.group] = [];
    result[item.group].push(item);
    return result;
  }, {}), []);
  const move = (direction) => {
    const nextIndex = (currentIndex + direction + PROTOTYPE_STATES.length) % PROTOTYPE_STATES.length;
    onChange(PROTOTYPE_STATES[nextIndex].id);
  };
  return (
    <nav className="prototype-switcher" aria-label="Prototype-only state navigation" data-prototype-only="true" data-od-id="prototype-state-switcher">
      <div className="prototype-switcher__identity">
        <Icon name="settings" size={18} />
        <div><strong>Prototype only</strong><span>Review state switcher · excluded from production</span></div>
      </div>
      <label className="prototype-switcher__select">
        <span className="sr-only">Choose a prototype state</span>
        <select value={state} onChange={(event) => onChange(event.target.value)}>
          {Object.entries(grouped).map(([group, items]) => (
            <optgroup key={group} label={group}>
              {items.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="prototype-switcher__arrows">
        <button type="button" className="icon-button" aria-label="Previous prototype state" onClick={() => move(-1)}><Icon name="arrowLeft" size={20} /></button>
        <span className="numeric" aria-label={`State ${currentIndex + 1} of ${PROTOTYPE_STATES.length}`}>{currentIndex + 1}/{PROTOTYPE_STATES.length}</span>
        <button type="button" className="icon-button" aria-label="Next prototype state" onClick={() => move(1)}><Icon name="arrowRight" size={20} /></button>
      </div>
      <div className="viewport-meter" aria-label="Responsive breakpoint preview">
        <span className="viewport-meter__mobile">390</span>
        <span className="viewport-meter__tablet">768</span>
        <span className="viewport-meter__desktop">1024</span>
        <span className="viewport-meter__wide">1440</span>
      </div>
    </nav>
  );
}

function App() {
  const fromHash = window.location.hash.replace(/^#/, "");
  const initial = PROTOTYPE_STATES.some((item) => item.id === fromHash) ? fromHash : "home";
  const [screen, setScreen] = useState(initial);
  const [announcement, setAnnouncement] = useState("");

  const navigate = (next) => {
    if (!PROTOTYPE_STATES.some((item) => item.id === next)) return;
    setScreen(next);
  };

  useEffect(() => {
    window.location.hash = screen;
    document.title = `${PROTOTYPE_STATES.find((item) => item.id === screen)?.label || "Prototype"} — Guess That Drawing`;
    const main = document.getElementById("main-content");
    if (main) {
      main.setAttribute("tabindex", "-1");
      main.focus({ preventScroll: true });
    }
  }, [screen]);

  useEffect(() => {
    const onHashChange = () => {
      const next = window.location.hash.replace(/^#/, "");
      if (PROTOTYPE_STATES.some((item) => item.id === next)) setScreen(next);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const common = { onNavigate: navigate, onAnnounce: setAnnouncement };
  let content;
  switch (screen) {
    case "profile": content = <ProfileScreen {...common} />; break;
    case "create": content = <CreateRoomScreen {...common} />; break;
    case "join": content = <JoinScreen {...common} />; break;
    case "join-duplicate": content = <JoinScreen {...common} errorType="duplicate" />; break;
    case "join-invalid": content = <JoinScreen {...common} errorType="invalid" />; break;
    case "join-expired": content = <JoinScreen {...common} errorType="expired" />; break;
    case "join-full": content = <JoinScreen {...common} errorType="full" />; break;
    case "join-kicked": content = <JoinScreen {...common} errorType="kicked" />; break;
    case "join-server": content = <JoinScreen {...common} errorType="server" />; break;
    case "themes": content = <ThemeLibraryScreen {...common} />; break;
    case "theme-editor": content = <ThemeEditorScreen {...common} />; break;
    case "lobby-host": content = <LobbyScreen {...common} role="host" />; break;
    case "lobby-guest": content = <LobbyScreen {...common} role="guest" />; break;
    case "word-select": content = <WordSelectionScreen {...common} />; break;
    case "game-drawer": content = <GameScreen {...common} mode="drawer" />; break;
    case "game-guesser": content = <GameScreen {...common} mode="guesser" />; break;
    case "game-close": content = <GameScreen {...common} mode="close" />; break;
    case "game-guessed": content = <GameScreen {...common} mode="guessed" />; break;
    case "game-reconnecting": content = <GameScreen {...common} mode="drawer" networkState="reconnecting" />; break;
    case "game-paused": content = <GameScreen {...common} mode="drawer" networkState="paused" />; break;
    case "game-stale": content = <GameScreen {...common} mode="guesser" networkState="stale" />; break;
    case "server-outage": content = <ServerOutageScreen {...common} />; break;
    case "turn-results": content = <TurnResultsScreen {...common} />; break;
    case "final-results": content = <FinalResultsScreen {...common} />; break;
    default: content = <HomeScreen {...common} />;
  }

  return (
    <div className="app-shell">
      <PrototypeSwitcher state={screen} onChange={navigate} />
      <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true">
        {screen === "server-outage" ? "The game server is unavailable." : screen === "join-kicked" ? "You were removed from the room." : ""}
      </div>
      {content}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
})();
