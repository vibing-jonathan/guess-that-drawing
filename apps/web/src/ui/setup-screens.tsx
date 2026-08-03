import {
  DEFAULT_AVATAR,
  DEFAULT_PHONE_ROOM_SETTINGS,
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
  type ClassicRoomSettings,
  type CustomThemeInput,
  type GameMode,
  type PhoneRoomSettings,
  type PlayerProfile,
  type PlayerRoomSnapshot,
  type ProRoomSettings,
  type RoomSettings,
  type ThemeDescriptor,
  type ThemeMetadata,
} from "@gtd/contracts";
import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router";

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

function roomTheme(theme: ThemeMetadata): ThemeDescriptor {
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
      className="home-screen home-screen--gateway"
      aria-labelledby="home-title"
      data-od-id="home-screen"
    >

      <header className="home-production-masthead">
        <strong>Guess That Drawing</strong>
        <div>
          <span><Icon name="lock" size={16} /> Private rooms · 2–12 players</span>
        </div>
      </header>

      <section className="home-hero live-hero-v1 live-strip-home">
        <article className="live-hero-v1__copy live-strip-home__entry">
          <h1 id="home-title">
            Create or join a room.
          </h1>
          <p className="live-hero-v1__lede">
            Start a private game or enter the room code your host shared.
          </p>
          <div className="home-actions live-hero-v1__actions">
            <Button icon="plus" onClick={() => navigate("/profile?next=/create")}>
              Create a room
            </Button>
            <Button variant="secondary" icon="key" onClick={() => navigate("/join")}>
              Join a room
            </Button>
          </div>
          <p className="live-hero-v1__note">
            <Icon name="users" size={18} /> No account required · Realtime play
          </p>
        </article>

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

const AVATAR_BACKGROUND_OPTIONS = [
  ["#EEF4FF", "Cobalt"],
  ["#F0FDFA", "Teal"],
  ["#FEF9C3", "Yellow"],
  ["#FFF1F2", "Coral"],
] as const;

type AvatarLayerKey = keyof AvatarConfig;

const AVATAR_LAYER_LABELS: Record<AvatarLayerKey, string> = {
  skinTone: "Skin tone",
  hairStyle: "Hair style",
  hairColor: "Hair color",
  eyes: "Eyes",
  mouth: "Mouth",
  accessory: "Accessory",
  backgroundColor: "Avatar background",
};

const AVATAR_LAYER_ORDER: readonly AvatarLayerKey[] = [
  "skinTone",
  "hairStyle",
  "hairColor",
  "eyes",
  "mouth",
  "accessory",
  "backgroundColor",
];

const AVATAR_LAYER_ICONS: Record<AvatarLayerKey, IconName> = {
  skinTone: "user",
  hairStyle: "brush",
  hairColor: "palette",
  eyes: "eye",
  mouth: "circle",
  accessory: "crown",
  backgroundColor: "rectangle",
};

const AVATAR_LAYER_DESCRIPTIONS: Record<AvatarLayerKey, string> = {
  skinTone: "Choose the tone that feels most like your player.",
  hairStyle: "Shape the silhouette your friends will spot first.",
  hairColor: "Give the hairstyle its game-night color.",
  eyes: "Pick the expression that matches your table energy.",
  mouth: "Set the smile you will bring into the room.",
  accessory: "Finish the look with one playful extra.",
  backgroundColor: "Choose the color behind your avatar in the player list.",
};

function LayerControl({
  label,
  layer,
  value,
  options,
  profile,
  onChange,
}: {
  label: string;
  layer: AvatarLayerKey;
  value: string;
  options: readonly (readonly [string, string])[];
  profile: PlayerProfile;
  onChange: (value: string) => void;
}) {
  const selectedIndex = options.findIndex(
    ([optionValue]) => optionValue.toLowerCase() === value.toLowerCase(),
  );
  const focusableIndex = selectedIndex >= 0 ? selectedIndex : 0;

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
    <fieldset className="layer-control layer-control--previews">
      <legend>{label}</legend>
      <div
        className="segmented"
        role="radiogroup"
        aria-label={label}
        onKeyDown={moveSelection}
      >
        {options.map(([optionValue, optionLabel], index) => {
          const isSelected =
            optionValue.toLowerCase() === value.toLowerCase();
          return (
            <button
              key={optionValue}
              type="button"
              className={isSelected ? "is-selected" : ""}
              role="radio"
              aria-checked={isSelected}
              tabIndex={index === focusableIndex ? 0 : -1}
              onClick={() => onChange(optionValue)}
            >
              <span className="layer-choice__preview" aria-hidden="true">
                <Avatar
                  name="Option preview"
                  config={{
                    ...profile.avatar,
                    [layer]: optionValue,
                  } as AvatarConfig}
                  size={54}
                />
              </span>
              <span className="layer-choice__label">{optionLabel}</span>
              {isSelected ? (
                <span className="layer-choice__check" aria-hidden="true">
                  <Icon name="check" size={15} />
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

type ClassicLikeRoomSettings = ClassicRoomSettings | ProRoomSettings;

function isClassicLike(
  settings: RoomSettings,
): settings is ClassicLikeRoomSettings {
  return settings.mode !== "phone";
}

const MODE_CONTENT: Record<
  GameMode,
  {
    name: string;
    icon: IconName;
    description: string;
    note: string;
  }
> = {
  classic: {
    name: "Classic",
    icon: "brush",
    description: "Take turns drawing while everyone else races to guess.",
    note: "Scores reward quick correct guesses.",
  },
  pro: {
    name: "Pro",
    icon: "trophy",
    description:
      "Classic play with a cost for throwing out incorrect guesses.",
    note: "Each incorrect guess subtracts up to 25 points.",
  },
  phone: {
    name: "Phone",
    icon: "game",
    description:
      "Everyone writes, draws, and guesses at the same time in private chains.",
    note: "Four links · no theme, chat, or scores.",
  },
};

function settingsForMode(
  mode: GameMode,
  current: RoomSettings,
): RoomSettings {
  if (mode === "phone") {
    return {
      ...DEFAULT_PHONE_ROOM_SETTINGS,
      maxPlayers: Math.max(4, current.maxPlayers),
    };
  }
  const classicBase = isClassicLike(current)
    ? current
    : {
        ...DEFAULT_ROOM_SETTINGS,
        maxPlayers: current.maxPlayers,
      };
  return mode === "pro"
    ? { ...classicBase, mode: "pro" }
    : { ...classicBase, mode: "classic" };
}

export function ProfileScreen() {
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<PlayerProfile>(() => loadProfile());
  const [activeLayer, setActiveLayer] =
    useState<AvatarLayerKey>("skinTone");
  const [submitted, setSubmitted] = useState(false);
  const parsed = PlayerProfileSchema.safeParse(profile);
  const requestedNext = new URLSearchParams(location.search).get("next");
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : "/create";
  const isRoomSetup = ["/create", "/themes", "/themes/new", "/review"].includes(
    next,
  );
  const backgroundOptions: readonly (readonly [string, string])[] =
    AVATAR_BACKGROUND_OPTIONS.some(
      ([value]) =>
        value.toLowerCase() === profile.avatar.backgroundColor.toLowerCase(),
    )
      ? AVATAR_BACKGROUND_OPTIONS
      : [
          ...AVATAR_BACKGROUND_OPTIONS,
          [profile.avatar.backgroundColor, "Custom"],
        ];
  const activeLayerOptions: readonly (readonly [string, string])[] =
    activeLayer === "backgroundColor"
      ? backgroundOptions
      : AVATAR_OPTIONS[activeLayer];
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

  function updateAvatarLayer(layer: AvatarLayerKey, value: string) {
    setProfile((current) => ({
      ...current,
      avatar: {
        ...current.avatar,
        [layer]: value,
      } as AvatarConfig,
    }));
  }

  function selectedLabel(layer: AvatarLayerKey): string {
    const options =
      layer === "backgroundColor" ? backgroundOptions : AVATAR_OPTIONS[layer];
    return (
      options.find(
        ([value]) =>
          value.toLowerCase() === profile.avatar[layer].toLowerCase(),
      )?.[1] ?? "Custom"
    );
  }

  function moveActiveLayer(event: KeyboardEvent<HTMLDivElement>) {
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
    const tabs = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        '[role="tab"]',
      ),
    ];
    if (tabs.length === 0) return;
    const currentIndex = Math.max(
      0,
      tabs.indexOf(document.activeElement as HTMLButtonElement),
    );
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? tabs.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              tabs.length) %
            tabs.length;
    event.preventDefault();
    tabs[nextIndex]?.focus();
    tabs[nextIndex]?.click();
  }

  function surpriseMe() {
    function randomDifferentValue<T extends string>(
      options: readonly (readonly [T, string])[],
      currentValue: T,
    ): T {
      const alternatives = options.filter(([value]) => value !== currentValue);
      return (
        alternatives[Math.floor(Math.random() * alternatives.length)]?.[0] ??
        currentValue
      );
    }

    setProfile((current) => ({
      ...current,
      avatar: {
        skinTone: randomDifferentValue(
          AVATAR_OPTIONS.skinTone,
          current.avatar.skinTone,
        ),
        hairStyle: randomDifferentValue(
          AVATAR_OPTIONS.hairStyle,
          current.avatar.hairStyle,
        ),
        hairColor: randomDifferentValue(
          AVATAR_OPTIONS.hairColor,
          current.avatar.hairColor,
        ),
        eyes: randomDifferentValue(AVATAR_OPTIONS.eyes, current.avatar.eyes),
        mouth: randomDifferentValue(AVATAR_OPTIONS.mouth, current.avatar.mouth),
        accessory: randomDifferentValue(
          AVATAR_OPTIONS.accessory,
          current.avatar.accessory,
        ),
        backgroundColor: randomDifferentValue(
          AVATAR_BACKGROUND_OPTIONS,
          current.avatar.backgroundColor,
        ),
      },
    }));
  }

  return (
    <main
      id="main-content"
      className="page-shell profile-screen"
      aria-labelledby="profile-title"
    >
      <PageHeader
        title="Build your player"
        description="This is how friends will spot you in the room. No account or upload needed."
        id="profile-title"
      />
      <SetupFrame
        active={isRoomSetup ? 1 : null}
        className={isRoomSetup ? "" : "setup-flow--standalone"}
        actions={
          <>
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/")}
            >
              Back
            </Button>
            <Button
              type="submit"
              form="profile-form"
              icon="arrowRight"
            >
              Save profile
            </Button>
          </>
        }
      >
        <form
          id="profile-form"
          className="profile-workspace"
          onSubmit={submit}
          noValidate
        >
        <section className="avatar-stage" aria-label="Live avatar preview">
          <div className="avatar-stage__meta">
            <span className="avatar-stage__status">
              <Icon name="user" size={16} /> Guest player
            </span>
            <span className="avatar-stage__privacy">
              <Icon name="lock" size={15} /> No account
            </span>
          </div>
          <div className="avatar-stage__spotlight">
            <Avatar
              key={`${activeLayer}-${profile.avatar[activeLayer]}`}
              name={profile.name || "Guest"}
              config={profile.avatar}
              size={244}
              className="avatar-stage__avatar"
            />
          </div>
          <div className="avatar-stage__identity">
            <strong title={profile.name || "Your name"}>
              {profile.name || "Your name"}
            </strong>
            <span>Your private game-night look</span>
          </div>
          <Button
            type="button"
            variant="quiet"
            icon="sparkles"
            className="avatar-stage__surprise"
            onClick={surpriseMe}
          >
            Surprise me
          </Button>
        </section>

        <section className="avatar-editor" aria-label="Avatar editor">
          <div className="avatar-editor__heading">
            <div>
              <h2>Make it yours</h2>
              <p>Choose a layer, then try a look. The preview updates instantly.</p>
            </div>
            <span className="avatar-editor__local">
              <Icon name="lock" size={15} /> Stored on this device
            </span>
          </div>
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
          <div className="avatar-builder">
            <div
              className="avatar-layer-tabs"
              role="tablist"
              aria-label="Avatar layers"
              aria-orientation="vertical"
              onKeyDown={moveActiveLayer}
            >
              {AVATAR_LAYER_ORDER.map((layer) => {
                const isActive = layer === activeLayer;
                return (
                  <button
                    key={layer}
                    id={`avatar-layer-${layer}`}
                    type="button"
                    className={`avatar-layer-tab ${isActive ? "is-active" : ""}`}
                    role="tab"
                    aria-selected={isActive}
                    aria-controls="avatar-choice-panel"
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveLayer(layer)}
                  >
                    <span className="avatar-layer-tab__icon" aria-hidden="true">
                      <Icon name={AVATAR_LAYER_ICONS[layer]} size={19} />
                    </span>
                    <span className="avatar-layer-tab__copy">
                      <strong>{AVATAR_LAYER_LABELS[layer]}</strong>
                      <small>{selectedLabel(layer)}</small>
                    </span>
                    <Icon name="arrowRight" size={17} />
                  </button>
                );
              })}
            </div>

            <div
              key={activeLayer}
              id="avatar-choice-panel"
              className="avatar-choice-tray"
              role="tabpanel"
              aria-labelledby={`avatar-layer-${activeLayer}`}
              tabIndex={0}
            >
              <header className="avatar-choice-tray__heading">
                <div>
                  <h3>{AVATAR_LAYER_LABELS[activeLayer]}</h3>
                  <p>{AVATAR_LAYER_DESCRIPTIONS[activeLayer]}</p>
                </div>
                <span>{activeLayerOptions.length} choices</span>
              </header>
              <LayerControl
                label={`${AVATAR_LAYER_LABELS[activeLayer]} choices`}
                layer={activeLayer}
                value={profile.avatar[activeLayer]}
                options={activeLayerOptions}
                profile={profile}
                onChange={(value) => updateAvatarLayer(activeLayer, value)}
              />
            </div>
          </div>
        </section>
        </form>
      </SetupFrame>
    </main>
  );
}

function SetupSteps({
  active,
  mode,
}: {
  active: number;
  mode: GameMode;
}) {
  const steps =
    mode === "phone"
      ? ["Profile", "Mode & settings", "Review"]
      : ["Profile", "Mode & settings", "Theme", "Review"];
  return (
    <ol
      className={`setup-steps setup-steps--${steps.length}`}
      aria-label={`Step ${active} of ${steps.length}`}
    >
      {steps.map((step, index) => (
        <li
          key={step}
          aria-current={index + 1 === active ? "step" : undefined}
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

function SetupFrame({
  active,
  mode = "classic",
  actions,
  children,
  className = "",
}: {
  active: number | null;
  mode?: GameMode;
  actions: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Panel
      className={`setup-flow setup-frame ${
        active ? "setup-frame--with-progress" : "setup-frame--without-progress"
      } ${className}`}
    >
      {active ? <SetupSteps active={active} mode={mode} /> : null}
      <div className="setup-flow__stage">{children}</div>
      <div className="form-actions setup-frame__actions">{actions}</div>
    </Panel>
  );
}

function ModePicker({
  mode,
  onChange,
  disabled = false,
}: {
  mode: GameMode;
  onChange: (mode: GameMode) => void;
  disabled?: boolean;
}) {
  const modes: readonly GameMode[] = ["classic", "pro", "phone"];
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
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
    const current = modes.indexOf(mode);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? modes.length - 1
          : (current +
              (event.key === "ArrowRight" || event.key === "ArrowDown"
                ? 1
                : -1) +
              modes.length) %
            modes.length;
    event.preventDefault();
    onChange(modes[next]!);
    document.getElementById(`game-mode-${modes[next]}`)?.focus();
  }
  return (
    <fieldset className="mode-picker" disabled={disabled}>
      <legend>Game mode</legend>
      <div
        className="mode-grid"
        role="radiogroup"
        aria-label="Game mode"
        onKeyDown={onKeyDown}
      >
        {modes.map((value) => {
          const option = MODE_CONTENT[value];
          const selected = mode === value;
          return (
            <button
              id={`game-mode-${value}`}
              key={value}
              type="button"
              className={`mode-card ${selected ? "is-selected" : ""}`}
              role="radio"
              aria-checked={selected}
              tabIndex={!disabled && selected ? 0 : -1}
              disabled={disabled}
              onClick={() => onChange(value)}
            >
              <span className="mode-card__icon">
                <Icon name={option.icon} size={24} />
              </span>
              <span className="mode-card__copy">
                <strong>{option.name}</strong>
                <span>{option.description}</span>
                <small>{option.note}</small>
              </span>
              {selected ? (
                <span className="mode-card__selected">
                  <Icon name="check" size={16} /> Selected
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CreateRoomScreen() {
  const navigate = useNavigate();
  const { settings, setSettings, setCustomTheme } = useSetup();
  const phone = settings.mode === "phone";
  const classic = isClassicLike(settings) ? settings : null;
  const stepCount = phone ? 3 : 4;
  return (
    <main
      id="main-content"
      className={`page-shell create-screen create-screen--${settings.mode}`}
      aria-labelledby="create-title"
    >
      <PageHeader
        kicker={`Step 2 of ${stepCount}`}
        title="Choose how the room plays"
        description="Pick a mode, then set the room rules. The host can adjust these settings in the lobby."
        id="create-title"
      />
      <SetupFrame
        active={2}
        mode={settings.mode}
        actions={
          <>
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/profile?next=/create")}
            >
              Back
            </Button>
            <Button
              type="submit"
              form="room-settings-form"
              icon="arrowRight"
            >
              {phone ? "Review Phone room" : "Choose a theme"}
            </Button>
          </>
        }
      >
        <div className="setup-stage--summary">
          <form
            id="room-settings-form"
            className="settings-form"
            onSubmit={(event) => {
              event.preventDefault();
              navigate(phone ? "/review" : "/themes");
            }}
          >
            <ModePicker
              mode={settings.mode}
              onChange={(mode) => {
                if (mode === "phone") {
                  setCustomTheme(undefined);
                }
                setSettings(settingsForMode(mode, settings));
              }}
            />
            {settings.mode === "phone" ? (
              <div className="settings-grid">
                <SelectField
                  id="phone-player-cap"
                  label="Player cap"
                  value={settings.maxPlayers}
                  help="Phone Mode needs at least 4 players."
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      maxPlayers: Number(event.target.value),
                    })
                  }
                >
                  {[4, 6, 8, 10, 12].map((value) => (
                    <option key={value} value={value}>
                      {value} players
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="phone-text-timer"
                  label="Text timer"
                  value={settings.textSeconds}
                  help="Deadline for writing and guessing phases."
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      textSeconds: Number(event.target.value),
                    })
                  }
                >
                  {[30, 45, 60, 90, 120].map((value) => (
                    <option key={value} value={value}>
                      {value} seconds
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  id="phone-drawing-timer"
                  label="Drawing timer"
                  value={settings.drawingSeconds}
                  help="Deadline for both drawing phases."
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      drawingSeconds: Number(event.target.value),
                    })
                  }
                >
                  {[60, 90, 120, 150, 180].map((value) => (
                    <option key={value} value={value}>
                      {value} seconds
                    </option>
                  ))}
                </SelectField>
                <div className="fixed-setting">
                  <span>Story chain</span>
                  <strong>4 links</strong>
                  <small>
                    Sentence → drawing → sentence → drawing
                  </small>
                </div>
              </div>
            ) : classic ? (
              <div className="settings-grid">
                <SelectField
                  id="player-cap"
                  label="Player cap"
                  value={classic.maxPlayers}
                  help="Between 2 and 12 players."
                  onChange={(event) =>
                    setSettings({
                      ...classic,
                      maxPlayers: Number(event.target.value),
                    })
                  }
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
                  value={classic.drawingCycles}
                  onChange={(event) =>
                    setSettings({
                      ...classic,
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
                  value={classic.turnSeconds}
                  onChange={(event) =>
                    setSettings({
                      ...classic,
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
                  label="Word selection time"
                  value={classic.wordSelectionSeconds}
                  onChange={(event) =>
                    setSettings({
                      ...classic,
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
            ) : null}
            {settings.mode === "pro" ? (
              <Banner
                tone="warning"
                icon="alert"
                title="Incorrect guesses cost up to 25 points"
              >
                The signed score change is immediate and never takes a score
                below zero. Close guesses are not penalized.
              </Banner>
            ) : phone ? (
              <Banner
                tone="info"
                icon="lock"
                title="Private until the story summary"
              >
                Players act simultaneously. Assigned prompts hide their
                author, and Phone Mode has no room chat or scores.
              </Banner>
            ) : null}
            <Banner tone="info" icon="lock" title="Private by default">
              Rooms are not listed publicly. Only people with the code can
              enter.
            </Banner>
          </form>
          <aside className="setup-summary" aria-label="Room summary">
            <h2 className="setup-summary__title">Room setup</h2>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{MODE_CONTENT[settings.mode].name}</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>Up to {settings.maxPlayers}</dd>
              </div>
              {settings.mode === "phone" ? (
                <>
                  <div>
                    <dt>Phases</dt>
                    <dd>4 simultaneous</dd>
                  </div>
                  <div>
                    <dt>Prompts</dt>
                    <dd>Player-written</dd>
                  </div>
                  <div>
                    <dt>Text timer</dt>
                    <dd>{settings.textSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Drawing timer</dt>
                    <dd>{settings.drawingSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Theme</dt>
                    <dd>Skipped</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Cycles</dt>
                    <dd>{settings.drawingCycles}</dd>
                  </div>
                  <div>
                    <dt>Turn</dt>
                    <dd>{settings.turnSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Selection</dt>
                    <dd>{settings.wordSelectionSeconds} sec</dd>
                  </div>
                  {settings.mode === "pro" ? (
                    <div>
                      <dt>Wrong guess</dt>
                      <dd>−25 points</dd>
                    </div>
                  ) : null}
                </>
              )}
            </dl>
          </aside>
        </div>
      </SetupFrame>
    </main>
  );
}

const JOIN_ERROR_TITLES: Record<string, string> = {
  DUPLICATE_NAME: "That name is already in this room",
  ROOM_NOT_FOUND: "Room not found",
  INVALID_ROOM_CODE: "Room not found",
  ROOM_EXPIRED: "This room has ended",
  ROOM_STARTED: "This game has already started",
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
      <Panel as="form" className="join-card" onSubmit={join}>
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
            inputClassName="join-code-input numeric"
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
            <Button
              icon="settings"
              variant="secondary"
              className="join-identity__edit"
              onClick={() => navigate("/profile?next=/join")}
            >
              Edit profile
            </Button>
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
  const [savedThemes, setSavedThemes] = useState<StoredCustomTheme[]>([]);

  useEffect(() => {
    void listCustomThemes()
      .then(setSavedThemes)
      .catch(() => setSavedThemes([]));
  }, []);

  useEffect(() => {
    if (settings.mode === "phone") {
      navigate("/review", { replace: true });
    }
  }, [navigate, settings.mode]);

  if (settings.mode === "phone") {
    return null;
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
      />
      <SetupFrame
        active={3}
        mode={settings.mode}
        actions={
          <>
            <Button
              variant="secondary"
              icon="plus"
              onClick={() => navigate("/themes/new")}
            >
              New custom theme
            </Button>
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate("/create")}
            >
              Back
            </Button>
            <Button
              icon="arrowRight"
              onClick={() => navigate("/review")}
              data-testid="review-room-submit"
            >
              Review room
            </Button>
          </>
        }
      >
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
      </SetupFrame>
    </main>
  );
}

export function ReviewRoomScreen() {
  const navigate = useNavigate();
  const { settings, customTheme } = useSetup();
  const profile = loadProfile();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const phone = settings.mode === "phone";
  const step = phone ? 3 : 4;

  async function createRoom() {
    const parsedProfile = PlayerProfileSchema.safeParse(profile);
    if (!parsedProfile.success) {
      navigate("/profile?next=/review");
      return;
    }
    setPending(true);
    setError(undefined);
    try {
      const established = await roomController.createRoom({
        profile: parsedProfile.data,
        settings,
        ...(settings.mode !== "phone" && customTheme
          ? { customTheme }
          : {}),
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

  return (
    <main
      id="main-content"
      className="page-shell review-screen"
      aria-labelledby="review-title"
    >
      <PageHeader
        kicker={`Step ${step} of ${step}`}
        title={`Review the ${MODE_CONTENT[settings.mode].name} room`}
        description="Check the rules players will see, then open the lobby and invite everyone."
        id="review-title"
      />
      <SetupFrame
        active={step}
        mode={settings.mode}
        actions={
          <>
            <Button
              variant="secondary"
              icon="arrowLeft"
              onClick={() => navigate(phone ? "/create" : "/themes")}
            >
              Back
            </Button>
            <Button
              icon="arrowRight"
              onClick={() => void createRoom()}
              disabled={pending}
              data-testid="create-room-submit"
            >
              {pending ? "Creating room…" : "Create room"}
            </Button>
          </>
        }
      >
        <div className="setup-stage--summary">
          <div className="review-card">
            <div className="review-identity">
              <Avatar name={profile.name} config={profile.avatar} size={64} />
              <div>
                <strong>{profile.name || "Guest"}</strong>
                <span className="review-identity__role">Host</span>
              </div>
            </div>
            {error ? (
              <Banner tone="danger" title="Room creation failed" role="alert">
                {error}
              </Banner>
            ) : null}
            <Banner tone="info" icon="lock" title="Private by default">
              Only people with the six-character room code can enter.
            </Banner>
          </div>
          <aside className="setup-summary" aria-label="Room review">
            <h2 className="setup-summary__title">Room review</h2>
            <dl>
              <div>
                <dt>Mode</dt>
                <dd>{MODE_CONTENT[settings.mode].name}</dd>
              </div>
              <div>
                <dt>Players</dt>
                <dd>Up to {settings.maxPlayers}</dd>
              </div>
              {settings.mode === "phone" ? (
                <>
                  <div>
                    <dt>Flow</dt>
                    <dd>4 simultaneous phases</dd>
                  </div>
                  <div>
                    <dt>Prompts</dt>
                    <dd>Player-written</dd>
                  </div>
                  <div>
                    <dt>Text timer</dt>
                    <dd>{settings.textSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Drawing timer</dt>
                    <dd>{settings.drawingSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Chat & scores</dt>
                    <dd>Off</dd>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <dt>Cycles</dt>
                    <dd>{settings.drawingCycles}</dd>
                  </div>
                  <div>
                    <dt>Turn</dt>
                    <dd>{settings.turnSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Selection</dt>
                    <dd>{settings.wordSelectionSeconds} sec</dd>
                  </div>
                  <div>
                    <dt>Theme</dt>
                    <dd>{settings.theme.name}</dd>
                  </div>
                  {settings.mode === "pro" ? (
                    <div>
                      <dt>Incorrect guess</dt>
                      <dd>−25 points</dd>
                    </div>
                  ) : null}
                </>
              )}
            </dl>
          </aside>
        </div>
      </SetupFrame>
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

  useEffect(() => {
    if (settings.mode === "phone") {
      navigate("/review", { replace: true });
    }
  }, [navigate, settings.mode]);

  if (settings.mode === "phone") {
    return null;
  }

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
    if (settings.mode === "phone") return;
    const themeSettings = settings;
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
        ...themeSettings,
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
      <SetupFrame
        active={3}
        mode={settings.mode}
        className="setup-flow--editor"
        actions={
          <>
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
          </>
        }
      >
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
      </SetupFrame>
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
        next.mode !== "phone" &&
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
        kicker={`${MODE_CONTENT[room.mode].name} · ${
          isHost ? "Host lobby" : "Guest lobby"
        }`}
        title="Your sketch room"
        description={
          isHost
            ? "Check the settings, then start when everyone is ready."
            : "You’re in. The host will start once everyone is ready."
        }
        id="lobby-title"
        actions={
          <>
            <StatusBadge tone="primary" icon={MODE_CONTENT[room.mode].icon}>
              {MODE_CONTENT[room.mode].name}
            </StatusBadge>
            <StatusBadge
              tone={connectionStatus === "connected" ? "success" : "warning"}
              icon={connectionStatus === "connected" ? "wifi" : "wifiOff"}
            >
              {connectionStatus === "connected"
                ? "Connected"
                : connectionMessage || "Reconnecting"}
            </StatusBadge>
          </>
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
          showScores={room.mode !== "phone"}
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
            <>
              <ModePicker
                mode={draftSettings.mode}
                disabled={controlsDisabled}
                onChange={(mode) => {
                  const next = settingsForMode(mode, draftSettings);
                  void updateSettings({
                    ...next,
                    maxPlayers: Math.max(
                      next.maxPlayers,
                      room.players.length,
                      mode === "phone" ? 4 : 2,
                    ),
                  });
                }}
              />
              {draftSettings.mode === "phone" ? (
                <div className="settings-grid">
                  <SelectField
                    id="lobby-phone-cap"
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
                    {[4, 6, 8, 10, 12].map((value) => (
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
                    id="lobby-phone-text"
                    label="Text timer"
                    value={draftSettings.textSeconds}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      void updateSettings({
                        ...draftSettings,
                        textSeconds: Number(event.target.value),
                      })
                    }
                  >
                    {[30, 45, 60, 90, 120].map((value) => (
                      <option key={value} value={value}>
                        {value} seconds
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id="lobby-phone-drawing"
                    label="Drawing timer"
                    value={draftSettings.drawingSeconds}
                    disabled={controlsDisabled}
                    onChange={(event) =>
                      void updateSettings({
                        ...draftSettings,
                        drawingSeconds: Number(event.target.value),
                      })
                    }
                  >
                    {[60, 90, 120, 150, 180].map((value) => (
                      <option key={value} value={value}>
                        {value} seconds
                      </option>
                    ))}
                  </SelectField>
                  <div className="fixed-setting">
                    <span>Prompts</span>
                    <strong>Player-written</strong>
                    <small>
                      4 links · no theme, chat, scores, or leaderboard.
                    </small>
                  </div>
                </div>
              ) : (
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
              {draftSettings.mode === "pro" ? (
                <div className="fixed-setting fixed-setting--penalty">
                  <span>Incorrect guess</span>
                  <strong>−25 points</strong>
                  <small>Clamped at zero; close guesses are safe.</small>
                </div>
              ) : null}
            </div>
              )}
            </>
          ) : (
            <dl className="settings-summary">
              <div>
                <dt>Mode</dt>
                <dd>{MODE_CONTENT[room.mode].name}</dd>
              </div>
              <div>
                <dt>Player cap</dt>
                <dd>{room.settings.maxPlayers} players</dd>
              </div>
              {room.mode === "phone" ? (
                <>
                  <div>
                    <dt>Flow</dt>
                    <dd>4 simultaneous phases</dd>
                  </div>
                  <div>
                    <dt>Prompts</dt>
                    <dd>Player-written</dd>
                  </div>
                  <div>
                    <dt>Text timer</dt>
                    <dd>{room.settings.textSeconds} seconds</dd>
                  </div>
                  <div>
                    <dt>Drawing timer</dt>
                    <dd>{room.settings.drawingSeconds} seconds</dd>
                  </div>
                  <div>
                    <dt>Chat & scores</dt>
                    <dd>Off</dd>
                  </div>
                </>
              ) : (
                <>
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
                  {room.mode === "pro" ? (
                    <div>
                      <dt>Incorrect guess</dt>
                      <dd>−25 points</dd>
                    </div>
                  ) : null}
                </>
              )}
            </dl>
          )}
          {pendingAction === "settings" ? (
            <p className="muted" role="status">
              Saving room settings…
            </p>
          ) : null}
          <Banner tone="info" icon="lock" title="Private room">
            {room.mode === "phone"
              ? "Assigned authors stay hidden until the synchronized summary."
              : room.mode === "pro"
                ? "Room chat stays private and the −25 rule is visible to everyone."
                : "Custom prompts and room chat are visible only to this room."}
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
            disabled={
              controlsDisabled ||
              activePlayerCount < (room.mode === "phone" ? 4 : 2)
            }
            data-testid="start-game"
          >
            {pendingAction === "start"
              ? "Starting…"
              : room.mode === "phone" && activePlayerCount < 4
                ? `Need ${4 - activePlayerCount} more ${
                    4 - activePlayerCount === 1 ? "player" : "players"
                  }`
                : `Start ${MODE_CONTENT[room.mode].name} · ${activePlayerCount} ${
                    activePlayerCount === 1 ? "player" : "players"
                  }`}
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
