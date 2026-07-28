import {
  DEFAULT_AVATAR,
  DEFAULT_ROOM_SETTINGS,
  PlayerProfileSchema,
  ROOM_CODE_ALPHABET,
  THEME_METADATA,
  ThemesResponseSchema,
  VALIDATION_LIMITS,
  isValidRoomCode,
  normalizeGuess,
  normalizeRoomCode,
  validateCustomTheme,
  type AvatarConfig,
  type CustomThemeInput,
  type PlayerProfile,
  type RoomSettings,
  type ThemeMetadata,
} from "@gtd/contracts";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {
  createCustomThemeDraft,
  deleteCustomTheme,
  listCustomThemes,
  saveCustomTheme,
  type StoredCustomTheme,
} from "../data/custom-themes";
import { loadProfile, saveProfile } from "../data/local-profile";
import { roomController } from "../realtime/runtime";
import { useRoomStore } from "../state/room-store";
import {
  Avatar,
  Banner,
  Button,
  Field,
  Icon,
  IconButton,
  PageHeader,
  Panel,
  PlayersPanel,
  SelectField,
  StatusBadge,
  type IconName,
} from "./primitives";
import { useSetup } from "./setup-context";

const THEME_ICONS: Record<string, IconName> = {
  general: "sparkles",
  animals: "users",
  food: "circle",
  places: "home",
  "video-game-characters": "game",
  music: "music",
};

const SAMPLE_WORDS = [
  "Lighthouse",
  "Roller skates",
  "Picnic basket",
  "Rain boots",
  "Hot-air balloon",
  "Treasure map",
  "Snow globe",
  "Garden hose",
  "Paper airplane",
  "Disco ball",
  "Campfire",
  "Telescope",
  "Wind chime",
  "Treehouse",
  "Coffee grinder",
  "Bowling alley",
  "Bookmobile",
  "Sandcastle",
  "Umbrella stand",
  "Record player",
];

let wordRowSequence = 0;

interface EditableWord {
  id: string;
  value: string;
}

function createWordRow(value: string): EditableWord {
  wordRowSequence += 1;
  return { id: `word-row-${wordRowSequence}`, value };
}

function createWordRows(words: readonly string[]): EditableWord[] {
  return words.map(createWordRow);
}

function normalizeEditableRoomCode(input: string): string {
  return [...normalizeRoomCode(input)]
    .filter((character) => ROOM_CODE_ALPHABET.includes(character))
    .join("")
    .slice(0, VALIDATION_LIMITS.roomCodeLength);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function roomTheme(theme: ThemeMetadata): RoomSettings["theme"] {
  return {
    id: theme.id,
    name: theme.name,
    isCustom: theme.isCustom,
    wordCount: theme.wordCount,
  };
}

function useBundledThemes(): readonly ThemeMetadata[] {
  const [themes, setThemes] =
    useState<readonly ThemeMetadata[]>(THEME_METADATA);

  useEffect(() => {
    const abortController = new AbortController();
    void fetch("/api/themes", {
      headers: { accept: "application/json" },
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Theme request failed with ${response.status}.`);
        }
        const parsed = ThemesResponseSchema.safeParse(await response.json());
        if (parsed.success && parsed.data.themes.length > 0) {
          setThemes(parsed.data.themes);
        }
      })
      .catch(() => {
        // The bundled metadata remains available during outages and offline use.
      });
    return () => abortController.abort();
  }, []);

  return themes;
}

export function HomeScreen() {
  const navigate = useNavigate();
  return (
    <main
      id="main-content"
      className="home-screen"
      aria-labelledby="home-title"
      data-od-id="home-screen"
    >
      <section className="home-hero">
        <div className="home-hero__copy">
          <p className="page-kicker">Draw together · guess out loud</p>
          <h1 id="home-title">
            A blank page.
            <br />A room full of guesses.
          </h1>
          <p className="lede">
            Make a private room, choose a theme, and turn delightfully
            imperfect drawings into the best part of game night.
          </p>
          <div className="home-actions">
            <Button
              icon="plus"
              onClick={() => navigate("/profile?next=/create")}
            >
              Create a room
            </Button>
            <Button
              variant="secondary"
              icon="key"
              onClick={() => navigate("/join")}
            >
              Join a room
            </Button>
          </div>
          <p className="home-note">
            <Icon name="users" size={18} /> 2–12 players · no account required
          </p>
        </div>
        <div
          className="tabletop-preview"
          aria-label="A sample drawing prompt on a tabletop"
        >
          <div className="prompt-slip">
            <span>Your word</span>
            <strong>LIGHTHOUSE</strong>
          </div>
          <svg
            className="home-sketch"
            viewBox="0 0 560 390"
            role="img"
            aria-label="A simple line drawing of a lighthouse and waves"
          >
            <rect
              x="12"
              y="12"
              width="536"
              height="366"
              rx="16"
              fill="var(--color-canvas)"
              stroke="var(--color-ink)"
              strokeWidth="6"
            />
            <path
              d="M54 310c90-33 173-26 236 9 77 42 132 39 217 3M51 342c82-24 162-20 228 8 81 35 147 33 235-2"
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth="12"
              strokeLinecap="round"
            />
            <path
              d="M255 304 286 126h72l39 178Z"
              fill="var(--color-accent-subtle)"
              stroke="var(--color-ink)"
              strokeWidth="7"
            />
            <path
              d="M275 199h101M265 251h123"
              stroke="var(--color-accent)"
              strokeWidth="13"
            />
            <path
              d="M279 126 293 81h57l16 45ZM310 80V54h23v26"
              fill="var(--color-highlight-subtle)"
              stroke="var(--color-ink)"
              strokeWidth="7"
            />
            <path
              d="M359 105 476 71"
              stroke="var(--color-highlight)"
              strokeWidth="18"
              strokeLinecap="round"
            />
          </svg>
          <span className="preview-caption">
            The canvas stays clean. The room brings the chaos.
          </span>
        </div>
      </section>
    </main>
  );
}

const AVATAR_OPTIONS = {
  skinTone: [
    ["porcelain", "Porcelain"],
    ["peach", "Peach"],
    ["tan", "Tan"],
    ["brown", "Brown"],
    ["deep", "Deep"],
  ],
  hairStyle: [
    ["none", "None"],
    ["short", "Short"],
    ["waves", "Waves"],
    ["curls", "Curls"],
    ["bob", "Bob"],
    ["mohawk", "Mohawk"],
    ["bun", "Bun"],
    ["braids", "Braids"],
  ],
  hairColor: [
    ["black", "Black"],
    ["brown", "Brown"],
    ["auburn", "Auburn"],
    ["blonde", "Blonde"],
    ["silver", "Silver"],
    ["blue", "Blue"],
    ["pink", "Pink"],
  ],
  eyes: [
    ["dots", "Dots"],
    ["round", "Round"],
    ["happy", "Happy"],
    ["wink", "Wink"],
    ["glasses", "Glasses"],
  ],
  mouth: [
    ["smile", "Smile"],
    ["grin", "Grin"],
    ["open", "Open"],
    ["tongue", "Tongue"],
    ["neutral", "Neutral"],
  ],
  accessory: [
    ["none", "None"],
    ["cap", "Cap"],
    ["crown", "Crown"],
    ["headphones", "Headphones"],
    ["bow", "Bow"],
    ["party-hat", "Party hat"],
  ],
} as const;

function LayerControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
}) {
  function moveSelection(event: KeyboardEvent<HTMLDivElement>) {
    if (
      ![
        "ArrowRight",
        "ArrowDown",
        "ArrowLeft",
        "ArrowUp",
        "Home",
        "End",
      ].includes(event.key)
    ) {
      return;
    }
    const controls = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>("button"),
    ];
    if (controls.length === 0) return;
    const currentIndex = Math.max(
      0,
      controls.indexOf(document.activeElement as HTMLButtonElement),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? controls.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              controls.length) %
            controls.length;
    event.preventDefault();
    controls[nextIndex]?.focus();
    controls[nextIndex]?.click();
  }

  return (
    <fieldset className="layer-control">
      <legend>{label}</legend>
      <div
        className="segmented"
        role="radiogroup"
        aria-label={label}
        onKeyDown={moveSelection}
      >
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            className={value === optionValue ? "is-selected" : ""}
            role="radio"
            aria-checked={value === optionValue}
            tabIndex={value === optionValue ? 0 : -1}
            onClick={() => onChange(optionValue)}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [submitted, setSubmitted] = useState(false);
  const parsed = PlayerProfileSchema.safeParse(profile);
  const requestedNext = new URLSearchParams(location.search).get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/create";
  const profileError =
    submitted && !parsed.success
      ? `Use a name between ${VALIDATION_LIMITS.playerName.min} and ${VALIDATION_LIMITS.playerName.max} characters.`
      : "";

  function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitted(true);
    if (!parsed.success) return;
    saveProfile(parsed.data);
    navigate(next);
  }

  return (
    <main
      id="main-content"
      className="page-shell profile-screen"
      aria-labelledby="profile-title"
    >
      <PageHeader
        kicker="Guest profile"
        title="Make yourself recognizable"
        description="This name and avatar stay with you for the room. No account or upload needed."
        id="profile-title"
      />
      <form className="profile-workspace" onSubmit={submit} noValidate>
        <Panel className="avatar-preview-panel">
          <span className="eyebrow">Live preview</span>
          <Avatar
            name={profile.name || "Guest"}
            config={profile.avatar}
            size={176}
          />
          <strong>{profile.name || "Your name"}</strong>
          <StatusBadge icon="user" tone="primary">
            Guest player
          </StatusBadge>
        </Panel>
        <div className="profile-controls">
          <Field
            id="guest-name"
            label="Display name"
            value={profile.name}
            maxLength={VALIDATION_LIMITS.playerName.max}
            autoComplete="nickname"
            {...(profileError ? { error: profileError } : {})}
            help={`${VALIDATION_LIMITS.playerName.min}–${VALIDATION_LIMITS.playerName.max} characters. You can change it before joining.`}
            onChange={(event) =>
              setProfile((current) => ({
                ...current,
                name: event.target.value,
              }))
            }
          />
          <div className="avatar-layers" aria-label="Avatar maker controls">
            {(
              Object.entries(AVATAR_OPTIONS) as Array<
                [
                  keyof Omit<AvatarConfig, "backgroundColor">,
                  readonly (readonly [string, string])[],
                ]
              >
            ).map(([key, options]) => (
                <LayerControl
                  key={key}
                  label={key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (letter) => letter.toUpperCase())}
                value={profile.avatar[key]}
                options={options}
                onChange={(value) =>
                  setProfile((current) => ({
                    ...current,
                    avatar: { ...current.avatar, [key]: value },
                  }))
                }
              />
            ))}
            <div className="field">
              <label htmlFor="avatar-background">Avatar background</label>
              <input
                id="avatar-background"
                type="color"
                value={profile.avatar.backgroundColor}
                onChange={(event) =>
                  setProfile((current) => ({
                    ...current,
                    avatar: {
                      ...current.avatar,
                      backgroundColor: event.target.value,
                    },
                  }))
                }
              />
            </div>
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/")}
            >
              Back
            </Button>
            <Button type="submit" icon="arrowRight">
              Save profile
            </Button>
          </div>
        </div>
      </form>
    </main>
  );
}

function SetupSteps({ active }: { active: number }) {
  const steps = ["Profile", "Room settings", "Theme", "Review"];
  return (
    <ol className="setup-steps" aria-label={`Step ${active} of 4`}>
      {steps.map((step, index) => (
        <li
          key={step}
          className={
            index + 1 === active
              ? "is-current"
              : index + 1 < active
                ? "is-complete"
                : ""
          }
        >
          <span className="numeric">{index + 1}</span>
          <strong>{step}</strong>
          {index + 1 < active ? <Icon name="check" size={16} /> : null}
        </li>
      ))}
    </ol>
  );
}

export function CreateRoomScreen() {
  const navigate = useNavigate();
  const { settings, setSettings } = useSetup();
  return (
    <main
      id="main-content"
      className="page-shell create-screen"
      aria-labelledby="create-title"
    >
      <PageHeader
        kicker="Step 2 of 4"
        title="Set the pace for the room"
        description="Choose a relaxed default now. The host can adjust these settings in the lobby."
        id="create-title"
      />
      <div className="setup-layout">
        <SetupSteps active={2} />
        <Panel className="settings-form">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              navigate("/themes");
            }}
          >
            <div className="settings-grid">
              <SelectField
                id="player-cap"
                label="Player cap"
                value={settings.maxPlayers}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    maxPlayers: Number(event.target.value),
                  })
                }
                help="Between 2 and 12 players."
              >
                {[2, 4, 6, 8, 10, 12].map((value) => (
                  <option key={value} value={value}>
                    {value} players
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="drawing-cycles"
                label="Drawing cycles"
                value={settings.drawingCycles}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    drawingCycles: Number(event.target.value),
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? "cycle" : "cycles"}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="turn-time"
                label="Turn time"
                value={settings.turnSeconds}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    turnSeconds: Number(event.target.value),
                  })
                }
              >
                {[45, 60, 80, 90, 120, 180].map((value) => (
                  <option key={value} value={value}>
                    {value} seconds
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="selection-time"
                label="Word selection"
                value={settings.wordSelectionSeconds}
                onChange={(event) =>
                  setSettings({
                    ...settings,
                    wordSelectionSeconds: Number(event.target.value),
                  })
                }
              >
                {[10, 15, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} seconds
                  </option>
                ))}
              </SelectField>
            </div>
            <Banner tone="info" icon="lock" title="Private by default">
              Rooms are not listed publicly. Only people with the code can
              enter.
            </Banner>
            <div className="form-actions">
              <Button
                variant="secondary"
                icon="arrowLeft"
                onClick={() => navigate("/profile?next=/create")}
              >
                Back
              </Button>
              <Button type="submit" icon="arrowRight">
                Choose a theme
              </Button>
            </div>
          </form>
        </Panel>
        <aside className="setup-summary" aria-label="Room summary">
          <span className="eyebrow">Current setup</span>
          <dl>
            <div>
              <dt>Players</dt>
              <dd>Up to {settings.maxPlayers}</dd>
            </div>
            <div>
              <dt>Cycles</dt>
              <dd>{settings.drawingCycles}</dd>
            </div>
            <div>
              <dt>Turn</dt>
              <dd>{settings.turnSeconds} sec</dd>
            </div>
            <div>
              <dt>Theme</dt>
              <dd>{settings.theme.name}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </main>
  );
}

const JOIN_ERROR_TITLES: Record<string, string> = {
  DUPLICATE_NAME: "That name is already in this room",
  ROOM_NOT_FOUND: "Room not found",
  INVALID_ROOM_CODE: "Room not found",
  ROOM_EXPIRED: "This room has ended",
  ROOM_FULL: "Room is full",
  KICKED: "You were removed",
  ACK_TIMEOUT: "The game server is unavailable",
  SERVER_UNAVAILABLE: "The game server is unavailable",
  CLIENT_EMIT_ERROR: "The game server is unavailable",
  INVALID_PROFILE: "Check your display name",
};

function safeProfile(name: string): PlayerProfile {
  const persisted = loadProfile();
  return {
    name,
    avatar: persisted.avatar ?? DEFAULT_AVATAR,
  };
}

export interface JoinScreenProps {
  initialError?: {
    code: string;
    message: string;
  };
}

export function JoinScreen({ initialError }: JoinScreenProps = {}) {
  const navigate = useNavigate();
  const location = useLocation();
  const queryCode = new URLSearchParams(location.search).get("code") ?? "";
  const persisted = loadProfile();
  const [code, setCode] = useState(() =>
    normalizeEditableRoomCode(queryCode),
  );
  const [name, setName] = useState(persisted.name);
  const [error, setError] = useState<
    { code: string; message: string } | undefined
  >(initialError);
  const [pending, setPending] = useState(false);
  const serverError = Boolean(
    error &&
      ["ACK_TIMEOUT", "SERVER_UNAVAILABLE", "CLIENT_EMIT_ERROR"].includes(
        error.code,
      ),
  );

  async function join(event: FormEvent) {
    event.preventDefault();
    setError(undefined);
    const normalizedCode = normalizeRoomCode(code);
    if (!isValidRoomCode(normalizedCode)) {
      setError({
        code: "INVALID_ROOM_CODE",
        message: "Enter the six-character room code from your host.",
      });
      return;
    }
    const profile = safeProfile(name.trim());
    if (!PlayerProfileSchema.safeParse(profile).success) {
      setError({
        code: "INVALID_PROFILE",
        message: `Use a display name between ${VALIDATION_LIMITS.playerName.min} and ${VALIDATION_LIMITS.playerName.max} characters.`,
      });
      return;
    }
    setPending(true);
    try {
      saveProfile(profile);
      const established = await roomController.joinRoom({
        code: normalizedCode,
        profile,
      });
      navigate(`/room/${established.snapshot.code}`, { replace: true });
    } catch (caught) {
      const issue = caught as { code?: string; message?: string };
      setError({
        code: issue.code ?? "UNKNOWN",
        message: issue.message ?? "Unable to join this room.",
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <main
      id="main-content"
      className="page-shell join-screen"
      aria-labelledby="join-title"
    >
      <PageHeader
        kicker="Join by code"
        title="Pull up a chair"
        description="Enter the code from your host. Spaces and hyphens are ignored."
        id="join-title"
      />
      <Panel className="join-card">
        <form onSubmit={join}>
          {error ? (
            <Banner
              tone={serverError ? "danger" : "warning"}
              icon={serverError ? "cloudOff" : "alert"}
              title={JOIN_ERROR_TITLES[error.code] ?? "Unable to join"}
              role="alert"
            >
              {error.message}
            </Banner>
          ) : null}
          <Field
            id="join-code"
            label="Room code"
            className="join-code-input numeric"
            value={code}
            maxLength={VALIDATION_LIMITS.roomCodeLength * 3}
            autoCapitalize="characters"
            autoComplete="off"
            inputMode="text"
            spellCheck={false}
            data-testid="join-room-code"
            help="Six letters or digits, shown on the host’s lobby screen."
            {...(error?.code === "INVALID_ROOM_CODE"
              ? { error: error.message }
              : {})}
            onChange={(event) => {
              setCode(normalizeEditableRoomCode(event.target.value));
              if (
                error?.code === "INVALID_ROOM_CODE" ||
                error?.code === "ROOM_NOT_FOUND" ||
                error?.code === "ROOM_FULL"
              ) {
                setError(undefined);
              }
            }}
          />
          <Field
            id="join-name"
            label="Display name"
            value={name}
            maxLength={VALIDATION_LIMITS.playerName.max}
            autoComplete="nickname"
            {...(error?.code === "DUPLICATE_NAME" ||
            error?.code === "INVALID_PROFILE"
              ? { error: error.message }
              : {})}
            onChange={(event) => {
              setName(event.target.value);
              if (
                error?.code === "DUPLICATE_NAME" ||
                error?.code === "INVALID_PROFILE"
              ) {
                setError(undefined);
              }
            }}
          />
          <div className="join-identity">
            <Avatar
              name={name || "Guest"}
              config={persisted.avatar}
              size={56}
            />
            <div>
              <strong>{name || "Guest"}</strong>
              <span>Guest profile · editable before joining</span>
            </div>
            <IconButton
              icon="settings"
              label="Edit guest profile"
              onClick={() => navigate("/profile?next=/join")}
            />
          </div>
          <div className="form-actions">
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/")}
            >
              Back
            </Button>
            {error?.code === "KICKED" ? (
              <Button onClick={() => navigate("/", { replace: true })}>
                Back home
              </Button>
            ) : error?.code === "ROOM_EXPIRED" ? (
              <Button onClick={() => navigate("/create")}>
                Create a new room
              </Button>
            ) : (
              <Button
                type="submit"
                icon={serverError ? "refresh" : "arrowRight"}
                disabled={pending || !isValidRoomCode(code)}
                data-testid="join-submit"
              >
                {pending
                  ? "Joining…"
                  : serverError
                    ? "Try again"
                    : "Join room"}
              </Button>
            )}
          </div>
        </form>
      </Panel>
    </main>
  );
}

export const JoinRoomScreen = JoinScreen;

function ThemeCard({
  theme,
  selected,
  onSelect,
}: {
  theme: ThemeMetadata;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`theme-card ${selected ? "is-selected" : ""}`}
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className="theme-card__icon">
        <Icon name={THEME_ICONS[theme.id] ?? "sparkles"} size={26} />
      </span>
      <span className="theme-card__body">
        <strong>{theme.name}</strong>
        <span>{theme.description}</span>
        <small>A curated deck ready for your room.</small>
      </span>
      <span className="theme-card__count numeric">
        {theme.wordCount} words
      </span>
      {selected ? (
        <span className="theme-card__selected">
          <Icon name="check" size={16} /> Selected
        </span>
      ) : null}
    </button>
  );
}

export function ThemeLibraryScreen() {
  const navigate = useNavigate();
  const { settings, setSettings, customTheme, setCustomTheme } = useSetup();
  const bundledThemes = useBundledThemes();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [savedThemes, setSavedThemes] = useState<StoredCustomTheme[]>([]);

  useEffect(() => {
    void listCustomThemes()
      .then(setSavedThemes)
      .catch(() => setSavedThemes([]));
  }, []);

  async function createRoom() {
    const profile = loadProfile();
    if (!PlayerProfileSchema.safeParse(profile).success) {
      navigate("/profile?next=/themes");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const established = await roomController.createRoom({
        profile,
        settings,
        ...(customTheme ? { customTheme } : {}),
      });
      navigate(`/room/${established.snapshot.code}`, { replace: true });
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to create a room.",
      );
    } finally {
      setPending(false);
    }
  }

  const choosePreset = (theme: ThemeMetadata) => {
    setCustomTheme(undefined);
    setSettings({ ...settings, theme: roomTheme(theme) });
  };
  const chooseCustom = (theme: StoredCustomTheme) => {
    setCustomTheme({ id: theme.id, name: theme.name, words: theme.words });
    setSettings({
      ...settings,
      theme: {
        id: theme.id,
        name: theme.name,
        isCustom: true,
        wordCount: theme.words.length,
      },
    });
  };

  return (
    <main
      id="main-content"
      className="page-shell page-shell--wide theme-screen"
      aria-labelledby="themes-title"
    >
      <PageHeader
        kicker="Step 3 of 4"
        title="Pick the room’s prompt deck"
        description="Bundled themes are ready to play. Custom themes stay private to your room."
        id="themes-title"
        actions={
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => navigate("/themes/new")}
          >
            New custom theme
          </Button>
        }
      />
      {error ? (
        <Banner tone="danger" title="Room creation failed" role="alert">
          {error}
        </Banner>
      ) : null}
      <div className="theme-grid" role="radiogroup" aria-label="Themes">
        {bundledThemes.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={theme}
            selected={!customTheme && settings.theme.id === theme.id}
            onSelect={() => choosePreset(theme)}
          />
        ))}
        {savedThemes.map((theme) => (
          <ThemeCard
            key={theme.id}
            theme={{
              id: theme.id,
              name: theme.name,
              description: "A private custom deck saved on this device.",
              wordCount: theme.words.length,
              isCustom: true,
            }}
            selected={customTheme?.id === theme.id}
            onSelect={() => chooseCustom(theme)}
          />
        ))}
      </div>
      <div className="form-actions">
        <Button
          variant="secondary"
          icon="arrowLeft"
          onClick={() => navigate("/create")}
        >
          Back
        </Button>
        <Button
          icon="arrowRight"
          onClick={() => void createRoom()}
          disabled={pending}
          data-testid="create-room-submit"
        >
          {pending ? "Creating room…" : `Create room with ${settings.theme.name}`}
        </Button>
      </div>
    </main>
  );
}

export function ThemeEditorScreen() {
  const navigate = useNavigate();
  const { settings, setSettings, setCustomTheme } = useSetup();
  const [name, setName] = useState("Rainy-day favorites");
  const [wordRows, setWordRows] = useState<EditableWord[]>(() =>
    createWordRows(SAMPLE_WORDS),
  );
  const [newWord, setNewWord] = useState("");
  const [saved, setSaved] = useState<StoredCustomTheme[]>([]);
  const [error, setError] = useState<string>();
  const words = useMemo(
    () => wordRows.map((word) => word.value),
    [wordRows],
  );
  const normalizedRows = words.map(normalizeGuess);
  const normalized = normalizedRows.filter(Boolean);
  const uniqueCount = new Set(normalized).size;
  const duplicateCount = normalized.length - uniqueCount;
  const validation = validateCustomTheme({ name, words });

  useEffect(() => {
    void listCustomThemes().then(setSaved).catch(() => setSaved([]));
  }, []);

  function cleanup() {
    const seen = new Set<string>();
    setWordRows((current) =>
      current.filter((word) => {
        const key = normalizeGuess(word.value);
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    );
  }

  async function saveAndSelect() {
    setError(undefined);
    try {
      const stored = await saveCustomTheme({ name, words });
      const input: CustomThemeInput = {
        id: stored.id,
        name: stored.name,
        words: stored.words,
      };
      setCustomTheme(input);
      setSettings({
        ...settings,
        theme: {
          id: stored.id,
          name: stored.name,
          isCustom: true,
          wordCount: stored.words.length,
        },
      });
      navigate("/themes");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save this theme.",
      );
    }
  }

  return (
    <main
      id="main-content"
      className="page-shell page-shell--wide editor-screen"
      aria-labelledby="editor-title"
    >
      <PageHeader
        kicker="Custom theme"
        title="Build a private prompt deck"
        description="Edit locally, clean duplicates, then select the theme for this room."
        id="editor-title"
      />
      <div className="editor-layout">
        <aside className="saved-themes" aria-labelledby="saved-themes-title">
          <div className="split">
            <h2 id="saved-themes-title">Saved locally</h2>
            <StatusBadge icon="save">{saved.length} themes</StatusBadge>
          </div>
          <ul>
            {saved.map((theme) => (
              <li key={theme.id}>
                <button
                  type="button"
                  onClick={() => {
                    setName(theme.name);
                    setWordRows(createWordRows(theme.words));
                  }}
                >
                  <strong>{theme.name}</strong>
                  <span className="numeric">{theme.words.length} words</span>
                </button>
                <IconButton
                  icon="trash"
                  label={`Delete ${theme.name}`}
                  onClick={() => {
                    void deleteCustomTheme(theme.id)
                      .then(() =>
                        setSaved((current) =>
                          current.filter((item) => item.id !== theme.id),
                        ),
                      )
                      .catch((caught) =>
                        setError(
                          errorMessage(
                            caught,
                            "Unable to delete this local theme.",
                          ),
                        ),
                      );
                  }}
                />
              </li>
            ))}
          </ul>
          <Button
            variant="secondary"
            icon="plus"
            onClick={() => {
              const draft = createCustomThemeDraft();
              setName(draft.name);
              setWordRows(createWordRows(draft.words));
            }}
          >
            New blank theme
          </Button>
        </aside>
        <Panel className="word-editor">
          <Field
            id="theme-name"
            label="Theme name"
            value={name}
            maxLength={40}
            onChange={(event) => setName(event.target.value)}
            help="Visible only to people in this room."
          />
          <div className="word-editor__summary">
            <div>
              <span>Unique words</span>
              <strong className="numeric">{uniqueCount}</strong>
            </div>
            <div>
              <span>Allowed range</span>
              <strong className="numeric">20–500</strong>
            </div>
            <div>
              <span>Duplicates</span>
              <strong className="numeric">{duplicateCount}</strong>
            </div>
          </div>
          {duplicateCount ? (
            <Banner
              tone="warning"
              title={`${duplicateCount} duplicate entries found`}
              actions={
                <Button variant="secondary" icon="refresh" onClick={cleanup}>
                  Clean duplicates
                </Button>
              }
            >
              Matching ignores capitalization, punctuation, and accents.
            </Banner>
          ) : (
            <Banner tone="success" icon="checkCircle" title="No duplicates found">
              This deck has {uniqueCount} unique words.
            </Banner>
          )}
          {error ? (
            <Banner tone="danger" title="Theme needs attention" role="alert">
              {error}
            </Banner>
          ) : null}
          <form
            className="add-word"
            onSubmit={(event) => {
              event.preventDefault();
              if (!newWord.trim()) return;
              setWordRows((current) => [
                ...current,
                createWordRow(newWord.trim()),
              ]);
              setNewWord("");
            }}
          >
            <Field
              id="new-word"
              label="Add a word or phrase"
              value={newWord}
              maxLength={VALIDATION_LIMITS.themeWord.max}
              placeholder="e.g. Solar eclipse"
              onChange={(event) => setNewWord(event.target.value)}
            />
            <Button type="submit" variant="secondary" icon="plus">
              Add
            </Button>
          </form>
          <div className="word-list-heading">
            <strong>Words</strong>
            <span className="muted">Edit in place · one prompt per row</span>
          </div>
          <ol className="word-list">
            {wordRows.map((word, index) => {
              const normalizedWord = normalizeGuess(word.value);
              const isDuplicate =
                Boolean(normalizedWord) &&
                normalizedRows.indexOf(normalizedWord) !== index;
              const inputId = `word-${word.id}`;
              return (
                <li key={word.id}>
                  <span className="numeric">{index + 1}</span>
                  <label className="sr-only" htmlFor={inputId}>
                    Prompt {index + 1}
                  </label>
                  <input
                    id={inputId}
                    value={word.value}
                    maxLength={VALIDATION_LIMITS.themeWord.max}
                    aria-invalid={isDuplicate}
                    onChange={(event) =>
                      setWordRows((current) =>
                        current.map((item) =>
                          item.id === word.id
                            ? { ...item, value: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  {isDuplicate ? (
                    <span className="duplicate-label">
                      <Icon name="alert" size={15} /> Duplicate
                    </span>
                  ) : null}
                  <IconButton
                    icon="trash"
                    label={`Delete ${word.value || `prompt ${index + 1}`}`}
                    onClick={() =>
                      setWordRows((current) =>
                        current.filter((item) => item.id !== word.id),
                      )
                    }
                  />
                </li>
              );
            })}
          </ol>
          <div className="form-actions">
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/themes")}
            >
              Cancel
            </Button>
            <Button
              icon="save"
              onClick={() => void saveAndSelect()}
              disabled={!validation.success}
              data-testid="save-custom-theme"
            >
              Save and select
            </Button>
          </div>
        </Panel>
        <aside className="editor-sidebar" aria-label="Theme readiness">
          <Panel>
            <h2>Private-room deck</h2>
            <p>
              This list stays on your device until you select it for a room.
              It is never added to the public theme library.
            </p>
          </Panel>
          <Panel className="validation-card">
            <h2>Ready check</h2>
            <ul>
              <li
                className={
                  name.trim().length >=
                    VALIDATION_LIMITS.customThemeName.min &&
                  name.trim().length <=
                    VALIDATION_LIMITS.customThemeName.max
                    ? "is-valid"
                    : ""
                }
              >
                <Icon
                  name={
                    name.trim().length >=
                      VALIDATION_LIMITS.customThemeName.min &&
                    name.trim().length <=
                      VALIDATION_LIMITS.customThemeName.max
                      ? "checkCircle"
                      : "alert"
                  }
                  size={18}
                />
                Named theme
              </li>
              <li
                className={
                  uniqueCount >= VALIDATION_LIMITS.customThemeWords.min
                    ? "is-valid"
                    : ""
                }
              >
                <Icon
                  name={
                    uniqueCount >= VALIDATION_LIMITS.customThemeWords.min
                      ? "checkCircle"
                      : "alert"
                  }
                  size={18}
                />
                At least {VALIDATION_LIMITS.customThemeWords.min} unique words
              </li>
              <li
                className={
                  uniqueCount <= VALIDATION_LIMITS.customThemeWords.max
                    ? "is-valid"
                    : ""
                }
              >
                <Icon
                  name={
                    uniqueCount <= VALIDATION_LIMITS.customThemeWords.max
                      ? "checkCircle"
                      : "alert"
                  }
                  size={18}
                />
                No more than {VALIDATION_LIMITS.customThemeWords.max} words
              </li>
              <li className={duplicateCount === 0 ? "is-valid" : ""}>
                <Icon
                  name={duplicateCount === 0 ? "checkCircle" : "alert"}
                  size={18}
                />
                Duplicates removed
              </li>
            </ul>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

export const CustomThemeEditorScreen = ThemeEditorScreen;

function RoomCodeDisplay({
  code,
  copied,
  onCopy,
}: {
  code: string;
  copied: boolean;
  onCopy: () => void;
}) {
  return (
    <section className="room-code" aria-labelledby="room-code-label">
      <span id="room-code-label" className="room-code__label">
        Room code
      </span>
      <strong
        className="room-code__value numeric"
        data-testid="room-code"
      >
        {code}
      </strong>
      <Button
        variant="secondary"
        icon={copied ? "check" : "copy"}
        onClick={onCopy}
        aria-label={copied ? "Room code copied" : `Copy room code ${code}`}
      >
        {copied ? "Copied" : "Copy code"}
      </Button>
    </section>
  );
}

type LobbyAction = "settings" | "kick" | "start" | "leave";

export function LobbyScreen() {
  const navigate = useNavigate();
  const { customTheme } = useSetup();
  const bundledThemes = useBundledThemes();
  const room = useRoomStore((state) => state.room);
  const connectionStatus = useRoomStore(
    (state) => state.connectionStatus,
  );
  const connectionMessage = useRoomStore(
    (state) => state.connectionMessage,
  );
  const [draftSettings, setDraftSettings] = useState<RoomSettings>(
    () => room?.settings ?? DEFAULT_ROOM_SETTINGS,
  );
  const [pendingAction, setPendingAction] =
    useState<LobbyAction | null>(null);
  const [error, setError] = useState<string>();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (room) setDraftSettings(room.settings);
  }, [room?.settings]);

  const self = useMemo(
    () =>
      room?.players.find((player) => player.id === room.selfPlayerId) ??
      null,
    [room],
  );
  const host = room?.players.find((player) => player.isHost);
  const isHost = self?.isHost ?? false;
  const activePlayerCount =
    room?.players.filter((player) => player.isConnected).length ?? 0;
  const controlsDisabled =
    connectionStatus !== "connected" || pendingAction !== null;

  async function copyCode() {
    if (!room) return;
    setError(undefined);
    try {
      if (!navigator.clipboard) {
        throw new Error("Clipboard access is unavailable in this browser.");
      }
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch (caught) {
      setError(errorMessage(caught, "Unable to copy the room code."));
    }
  }

  async function updateSettings(next: RoomSettings) {
    if (!room || !isHost) return;
    setDraftSettings(next);
    setPendingAction("settings");
    setError(undefined);
    try {
      if (
        next.theme.isCustom &&
        customTheme?.id === next.theme.id
      ) {
        await roomController.updateSettings(next, customTheme);
      } else {
        await roomController.updateSettings(next);
      }
    } catch (caught) {
      setDraftSettings(room.settings);
      setError(errorMessage(caught, "Unable to update room settings."));
    } finally {
      setPendingAction(null);
    }
  }

  async function kickPlayer(playerId: string) {
    setPendingAction("kick");
    setError(undefined);
    try {
      await roomController.kickPlayer(playerId);
    } catch (caught) {
      setError(errorMessage(caught, "Unable to remove that player."));
    } finally {
      setPendingAction(null);
    }
  }

  async function startGame() {
    setPendingAction("start");
    setError(undefined);
    try {
      await roomController.startMatch();
    } catch (caught) {
      setError(errorMessage(caught, "Unable to start the game."));
    } finally {
      setPendingAction(null);
    }
  }

  async function leaveRoom() {
    setPendingAction("leave");
    setError(undefined);
    try {
      await roomController.leaveRoom();
      navigate("/", { replace: true });
    } catch (caught) {
      setError(errorMessage(caught, "Unable to leave the room."));
      setPendingAction(null);
    }
  }

  if (!room) {
    return (
      <main
        id="main-content"
        className="page-shell lobby-screen"
        aria-labelledby="lobby-missing-title"
      >
        <PageHeader
          kicker="Room unavailable"
          title="This lobby is no longer connected"
          description="Join with a room code or create a new room."
          id="lobby-missing-title"
        />
        <Banner tone="warning" title="No active room" role="alert">
          Your room snapshot could not be found on this device.
        </Banner>
        <Button icon="home" onClick={() => navigate("/", { replace: true })}>
          Back home
        </Button>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      className="page-shell page-shell--wide lobby-screen"
      aria-labelledby="lobby-title"
      data-od-id={`${isHost ? "host" : "guest"}-lobby-screen`}
    >
      <PageHeader
        kicker={isHost ? "Host lobby" : "Guest lobby"}
        title="Your sketch room"
        description={
          isHost
            ? "Check the settings, then start when everyone is ready."
            : "You’re in. The host will start once everyone is ready."
        }
        id="lobby-title"
        actions={
          <StatusBadge
            tone={connectionStatus === "connected" ? "success" : "warning"}
            icon={connectionStatus === "connected" ? "wifi" : "wifiOff"}
          >
            {connectionStatus === "connected"
              ? "Connected"
              : connectionMessage || "Reconnecting"}
          </StatusBadge>
        }
      />
      {error ? (
        <Banner tone="danger" title="Lobby action failed" role="alert">
          {error}
        </Banner>
      ) : null}
      <RoomCodeDisplay
        code={room.code}
        copied={copied}
        onCopy={() => void copyCode()}
      />
      <div className="lobby-grid">
        <PlayersPanel
          players={room.players}
          selfId={room.selfPlayerId}
          showKick={isHost}
          onKick={(playerId) => void kickPlayer(playerId)}
        />
        <Panel
          className="lobby-settings"
          aria-labelledby="lobby-settings-title"
        >
          <div className="split panel__heading">
            <h2 id="lobby-settings-title">Game settings</h2>
            <StatusBadge icon={isHost ? "settings" : "lock"}>
              {isHost ? "Host controls" : "Host locked"}
            </StatusBadge>
          </div>
          {isHost ? (
            <div className="settings-grid">
              <SelectField
                id="lobby-cap"
                label="Player cap"
                value={draftSettings.maxPlayers}
                disabled={controlsDisabled}
                onChange={(event) =>
                  void updateSettings({
                    ...draftSettings,
                    maxPlayers: Number(event.target.value),
                  })
                }
              >
                {[2, 4, 6, 8, 10, 12].map((value) => (
                  <option
                    key={value}
                    value={value}
                    disabled={value < room.players.length}
                  >
                    {value} players
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="lobby-cycles"
                label="Drawing cycles"
                value={draftSettings.drawingCycles}
                disabled={controlsDisabled}
                onChange={(event) =>
                  void updateSettings({
                    ...draftSettings,
                    drawingCycles: Number(event.target.value),
                  })
                }
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} {value === 1 ? "cycle" : "cycles"}
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="lobby-time"
                label="Turn time"
                value={draftSettings.turnSeconds}
                disabled={controlsDisabled}
                onChange={(event) =>
                  void updateSettings({
                    ...draftSettings,
                    turnSeconds: Number(event.target.value),
                  })
                }
              >
                {[45, 60, 80, 90, 120, 180].map((value) => (
                  <option key={value} value={value}>
                    {value} seconds
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="lobby-selection-time"
                label="Word selection"
                value={draftSettings.wordSelectionSeconds}
                disabled={controlsDisabled}
                onChange={(event) =>
                  void updateSettings({
                    ...draftSettings,
                    wordSelectionSeconds: Number(event.target.value),
                  })
                }
              >
                {[10, 15, 20, 30].map((value) => (
                  <option key={value} value={value}>
                    {value} seconds
                  </option>
                ))}
              </SelectField>
              <SelectField
                id="lobby-theme"
                label="Theme"
                value={draftSettings.theme.id}
                disabled={controlsDisabled}
                onChange={(event) => {
                  const theme = bundledThemes.find(
                    (candidate) => candidate.id === event.target.value,
                  );
                  if (theme) {
                    void updateSettings({
                      ...draftSettings,
                      theme: roomTheme(theme),
                    });
                  }
                }}
              >
                {draftSettings.theme.isCustom ? (
                  <option value={draftSettings.theme.id}>
                    {draftSettings.theme.name} · custom
                  </option>
                ) : null}
                {bundledThemes.map((theme) => (
                  <option key={theme.id} value={theme.id}>
                    {theme.name}
                  </option>
                ))}
              </SelectField>
            </div>
          ) : (
            <dl className="settings-summary">
              <div>
                <dt>Player cap</dt>
                <dd>{room.settings.maxPlayers} players</dd>
              </div>
              <div>
                <dt>Drawing cycles</dt>
                <dd>{room.settings.drawingCycles}</dd>
              </div>
              <div>
                <dt>Turn time</dt>
                <dd>{room.settings.turnSeconds} seconds</dd>
              </div>
              <div>
                <dt>Word selection</dt>
                <dd>{room.settings.wordSelectionSeconds} seconds</dd>
              </div>
              <div>
                <dt>Theme</dt>
                <dd>{room.settings.theme.name}</dd>
              </div>
            </dl>
          )}
          {pendingAction === "settings" ? (
            <p className="muted" role="status">
              Saving room settings…
            </p>
          ) : null}
          <Banner tone="info" icon="lock" title="Private room">
            Custom prompts and room chat are visible only to this room.
          </Banner>
        </Panel>
      </div>
      <div className="lobby-actionbar">
        <Button
          variant="secondary"
          icon="logOut"
          onClick={() => void leaveRoom()}
          disabled={pendingAction !== null}
        >
          {pendingAction === "leave" ? "Leaving…" : "Leave room"}
        </Button>
        {isHost ? (
          <Button
            icon="arrowRight"
            onClick={() => void startGame()}
            disabled={controlsDisabled || activePlayerCount < 2}
            data-testid="start-game"
          >
            {pendingAction === "start"
              ? "Starting…"
              : `Start game · ${activePlayerCount} players`}
          </Button>
        ) : (
          <div className="waiting-status" role="status">
            <Icon name="clock" size={22} />
            <div>
              <strong>Waiting for {host?.name ?? "the host"}</strong>
              <span>Only the host can start the game.</span>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export function MissingProfileRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!PlayerProfileSchema.safeParse(loadProfile()).success) {
      navigate("/profile", { replace: true });
    }
  }, [navigate]);
  return null;
}
