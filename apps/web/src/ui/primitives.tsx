import type { AvatarConfig, PlayerPublic } from "@gtd/contracts";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Brush,
  Check,
  CheckCircle2,
  Circle,
  Clock3,
  CloudOff,
  Copy,
  Crown,
  Eraser,
  Eye,
  Gamepad2,
  Home,
  KeyRound,
  Lightbulb,
  Lock,
  LogOut,
  Menu,
  Music2,
  Palette,
  Pencil,
  Plus,
  Redo2,
  RectangleHorizontal,
  RefreshCw,
  Save,
  Send,
  Settings,
  Sparkles,
  Trash2,
  Trophy,
  Undo2,
  User,
  Users,
  Volume2,
  VolumeX,
  Wifi,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type ElementType,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
  useId,
} from "react";

const ICONS = {
  alert: AlertCircle,
  arrowLeft: ArrowLeft,
  arrowRight: ArrowRight,
  brush: Brush,
  check: Check,
  checkCircle: CheckCircle2,
  circle: Circle,
  clock: Clock3,
  cloudOff: CloudOff,
  copy: Copy,
  crown: Crown,
  ellipse: Circle,
  eraser: Eraser,
  eye: Eye,
  game: Gamepad2,
  home: Home,
  key: KeyRound,
  lightbulb: Lightbulb,
  line: Pencil,
  lock: Lock,
  logOut: LogOut,
  menu: Menu,
  music: Music2,
  palette: Palette,
  pencil: Pencil,
  plus: Plus,
  rectangle: RectangleHorizontal,
  redo: Redo2,
  refresh: RefreshCw,
  save: Save,
  send: Send,
  settings: Settings,
  sparkles: Sparkles,
  trash: Trash2,
  trophy: Trophy,
  undo: Undo2,
  user: User,
  users: Users,
  volume: Volume2,
  volumeOff: VolumeX,
  wifi: Wifi,
  wifiOff: WifiOff,
  x: X,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  size = 20,
  label,
  className = "",
}: {
  name: IconName;
  size?: number;
  label?: string;
  className?: string;
}) {
  const Component = ICONS[name];
  return (
    <Component
      className={`icon ${className}`}
      size={size}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
    />
  );
}

type ButtonVariant =
  | "primary"
  | "secondary"
  | "quiet"
  | "danger"
  | "danger-quiet";

export function Button({
  children,
  icon,
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: PropsWithChildren<
  ButtonHTMLAttributes<HTMLButtonElement> & {
    icon?: IconName;
    variant?: ButtonVariant;
  }
>) {
  return (
    <button
      type={type}
      className={`button button--${variant} ${className}`}
      {...props}
    >
      {icon ? <Icon name={icon} size={20} /> : null}
      <span>{children}</span>
    </button>
  );
}

export function IconButton({
  icon,
  label,
  selected,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: IconName;
  label: string;
  selected?: boolean;
}) {
  return (
    <button
      type="button"
      className={`icon-button ${selected ? "is-selected" : ""} ${className}`}
      aria-label={label}
      aria-pressed={selected === undefined ? undefined : selected}
      data-tooltip={label}
      {...props}
    >
      <Icon name={icon} size={22} />
    </button>
  );
}

type PanelProps<Tag extends ElementType> = {
  as?: Tag;
  children?: ReactNode;
  className?: string;
} & Omit<
  ComponentPropsWithoutRef<Tag>,
  "as" | "children" | "className"
>;

export function Panel<Tag extends ElementType = "section">({
  as,
  children,
  className = "",
  ...props
}: PanelProps<Tag>) {
  const Component = as ?? "section";
  return (
    <Component className={`panel ${className}`} {...props}>
      {children}
    </Component>
  );
}

export function PageHeader({
  kicker,
  title,
  description,
  actions,
  id = "page-title",
}: {
  kicker?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  id?: string;
}) {
  return (
    <header className="page-heading">
      {kicker ? <p className="sr-only">{kicker}</p> : null}
      <div className="split page-heading__row">
        <div>
          <h1 id={id}>{title}</h1>
          {description ? <p className="lede">{description}</p> : null}
        </div>
        {actions ? (
          <div className="cluster page-heading__actions">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}

export function Field({
  id,
  label,
  help,
  error,
  className = "",
  inputClassName = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: string;
  help?: string;
  error?: string;
  inputClassName?: string;
}) {
  const descriptionId = `${id}-description`;
  const message = error ?? help;
  return (
    <div
      className={`field ${error ? "field--error" : ""} ${className}`}
    >
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        className={inputClassName}
        aria-invalid={Boolean(error)}
        aria-describedby={message ? descriptionId : undefined}
        {...props}
      />
      {message ? (
        <p id={descriptionId} className="field__message">
          {error ? <Icon name="alert" size={16} /> : null}
          <span>{message}</span>
        </p>
      ) : null}
    </div>
  );
}

export function SelectField({
  id,
  label,
  help,
  children,
  ...props
}: PropsWithChildren<
  SelectHTMLAttributes<HTMLSelectElement> & {
    id: string;
    label: string;
    help?: string;
  }
>) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-describedby={help ? `${id}-description` : undefined}
        {...props}
      >
        {children}
      </select>
      {help ? (
        <p id={`${id}-description`} className="field__message">
          {help}
        </p>
      ) : null}
    </div>
  );
}

const SKIN: Record<AvatarConfig["skinTone"], string> = {
  porcelain: "#F8DCC4",
  peach: "#EDB78A",
  tan: "#C88A5B",
  brown: "#8B5A3C",
  deep: "#583724",
};

const HAIR: Record<AvatarConfig["hairColor"], string> = {
  black: "#1F2937",
  brown: "#6B4423",
  auburn: "#A44A2A",
  blonde: "#EABF55",
  silver: "#B7BDC7",
  blue: "#3155C6",
  pink: "#D85272",
};

export function Avatar({
  name,
  config,
  size = 56,
  className = "",
}: {
  name: string;
  config: AvatarConfig;
  size?: number;
  className?: string;
}) {
  const skin = SKIN[config.skinTone];
  const hair = HAIR[config.hairColor];
  const hairPath: Record<AvatarConfig["hairStyle"], string> = {
    none: "",
    short:
      "M22 34c1-14 9-23 22-23 12 0 20 7 23 19-9-1-16-5-22-11-5 7-12 12-23 15Z",
    waves:
      "M19 36c1-18 11-28 26-27 14 1 23 10 23 25-7-5-12-6-18-12-5 9-16 15-31 14Zm2 9c-6 9-3 22 4 27M67 43c6 10 3 23-3 29",
    curls:
      "M20 35c-3-12 4-25 14-25 5-7 17-5 20 1 11 0 17 13 12 25-8-8-14-12-22-17-6 8-14 13-24 16Z",
    bob:
      "M18 38c0-18 10-29 26-29 17 0 27 12 27 31l-5 26-9-5 2-34c-5-4-9-7-14-12-6 8-13 12-18 14l2 32-9 5Z",
    mohawk:
      "m27 27 4-18 7 7 6-14 7 15 6-9 4 22c-11-6-21-7-34-3Z",
    bun:
      "M21 34c1-15 10-24 23-24s22 9 23 23c-9-2-17-6-22-13-5 8-13 12-24 14Zm15-24c-5-8 1-15 8-15 8 0 13 8 7 15Z",
    braids:
      "M21 35c0-16 9-26 23-26s23 10 23 25c-8-2-16-7-22-14-5 8-13 13-24 15Zm0 4c-5 9-2 16 2 21l-4 8 6 9 5-8-5-9c4-8 5-15 2-22Zm40 0c-3 8-2 15 2 22l-5 8 5 8 6-9-4-8c4-5 7-13 2-21Z",
  };
  return (
    <svg
      className={`avatar ${className}`}
      width={size}
      height={size}
      viewBox="0 0 88 88"
      role="img"
      aria-label={`${name || "Guest"} avatar`}
    >
      <rect
        data-avatar-part="background"
        x="2"
        y="2"
        width="84"
        height="84"
        rx="8"
        fill={config.backgroundColor}
        stroke="var(--color-ink)"
        strokeWidth="1.25"
      />
      <path
        d="M44 17c16 0 26 11 25 29-1 19-10 30-25 30S20 65 19 46c-1-18 9-29 25-29Z"
        fill={skin}
        stroke="var(--color-ink)"
        strokeWidth="1.5"
      />
      {config.hairStyle !== "none" ? (
        <path
          d={hairPath[config.hairStyle]}
          fill={hair}
          stroke={config.hairStyle === "waves" ? hair : undefined}
          strokeWidth={config.hairStyle === "waves" ? 5 : undefined}
          strokeLinecap="round"
        />
      ) : null}
      <g
        fill="var(--color-ink)"
        stroke="var(--color-ink)"
        strokeWidth="2.5"
        strokeLinecap="round"
      >
        {config.eyes === "wink" ? (
          <>
            <path d="M31 42h7" />
            <circle cx="54" cy="42" r="3" />
          </>
        ) : config.eyes === "happy" ? (
          <>
            <path d="m30 43 4-3 4 3M50 43l4-3 4 3" fill="none" />
          </>
        ) : (
          <>
            <path d="M29 42c3-3 7-3 10 0-3 2.5-7 2.5-10 0Zm20 0c3-3 7-3 10 0-3 2.5-7 2.5-10 0Z" fill="none" strokeWidth="1.5" />
            <circle cx="34" cy="42" r={config.eyes === "round" ? 1.7 : 1.25} stroke="none" />
            <circle cx="54" cy="42" r={config.eyes === "round" ? 1.7 : 1.25} stroke="none" />
          </>
        )}
        <path d="m44 44-2 7 4 1" fill="none" strokeWidth="1.35" />
        {config.mouth === "neutral" ? (
          <path d="M39 56h10" />
        ) : config.mouth === "open" ? (
          <ellipse cx="44" cy="56" rx="6" ry="5" fill="var(--color-accent)" />
        ) : config.mouth === "grin" ? (
          <path
            d="M35 53c4 10 14 10 18 0Z"
            fill="var(--color-canvas)"
          />
        ) : config.mouth === "tongue" ? (
          <>
            <path d="M36 53c3 10 13 11 17 0Z" fill="var(--color-ink)" />
            <path
              d="M41 59c2-2 5-2 7 0"
              stroke="var(--color-accent)"
              fill="none"
            />
          </>
        ) : (
          <path d="M38 54c4 3 8 3 12 0" fill="none" />
        )}
      </g>
      {config.eyes === "glasses" ? (
        <g fill="none" stroke="var(--color-primary)" strokeWidth="2.5">
          <circle cx="34" cy="42" r="8" />
          <circle cx="54" cy="42" r="8" />
          <path d="M42 42h4M26 40l-5-2M62 40l5-2" />
        </g>
      ) : null}
      {config.accessory === "cap" ? (
        <path
          d="M21 30c4-14 15-20 27-18 10 1 17 7 20 17-15-1-31 0-47 1Zm28-1c8 0 17 2 23 6"
          fill="var(--color-primary)"
          stroke="var(--color-ink)"
          strokeWidth="2.5"
        />
      ) : null}
      {config.accessory === "crown" ? (
        <path
          d="m24 18 5-12 15 9L57 5l7 17Z"
          fill="var(--color-highlight)"
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
      ) : null}
      {config.accessory === "headphones" ? (
        <g stroke="var(--color-ink)" strokeWidth="3">
          <path
            data-avatar-part="headphone-band"
            d="M17 47V35c0-18 12-27 27-27s27 9 27 27v12"
            fill="none"
            strokeLinecap="round"
          />
          <path
            data-avatar-part="headphone-earcups"
            d="M17 42h8v18h-8Zm46 0h8v18h-8Z"
            fill="var(--color-primary)"
          />
        </g>
      ) : null}
      {config.accessory === "bow" ? (
        <path
          d="M44 15c-6-9-17-8-17 1 0 7 9 8 17 3 8 5 17 4 17-3 0-9-11-10-17-1Z"
          fill="var(--color-accent)"
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
      ) : null}
      {config.accessory === "party-hat" ? (
        <path
          data-avatar-part="party-hat"
          d="M34 21 48 2l12 22Z"
          fill="var(--color-highlight)"
          stroke="var(--color-ink)"
          strokeWidth="2"
        />
      ) : null}
    </svg>
  );
}

export function StatusBadge({
  children,
  icon = "checkCircle",
  tone = "neutral",
}: PropsWithChildren<{ icon?: IconName; tone?: string }>) {
  return (
    <span className={`status-badge status-badge--${tone}`}>
      <Icon name={icon} size={16} />
      <span>{children}</span>
    </span>
  );
}

export function Banner({
  tone = "info",
  icon = "alert",
  title,
  children,
  privateNote,
  actions,
  role = "status",
}: PropsWithChildren<{
  tone?: string;
  icon?: IconName;
  title: string;
  privateNote?: string;
  actions?: ReactNode;
  role?: "status" | "alert";
}>) {
  return (
    <div
      className={`banner banner--${tone}`}
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon name={icon} size={22} />
      <div className="banner__body">
        <strong>{title}</strong>
        {children ? <div className="banner__copy">{children}</div> : null}
        {privateNote ? (
          <span className="banner__private">
            <Icon name="lock" size={14} /> {privateNote}
          </span>
        ) : null}
      </div>
      {actions ? <div className="banner__actions">{actions}</div> : null}
    </div>
  );
}

export type ActiveDrawerStatus = "Choosing" | "Drawing" | "Reconnecting";

export function PlayerRow({
  player,
  rank,
  selfId,
  showKick,
  onKick,
  activeDrawerId,
  activeDrawerStatus,
  showScore = true,
}: {
  player: PlayerPublic;
  rank?: number;
  selfId: string;
  showKick?: boolean;
  onKick?: () => void;
  activeDrawerId?: string | null;
  activeDrawerStatus?: ActiveDrawerStatus;
  showScore?: boolean;
}) {
  const isSelf = player.id === selfId;
  const isActiveDrawer = player.id === activeDrawerId;
  const isRanked = rank !== undefined;
  const hasKickAction = Boolean(showKick && !player.isHost && !isSelf);
  const activeDrawerIcon: IconName =
    activeDrawerStatus === "Choosing"
      ? "lightbulb"
      : activeDrawerStatus === "Reconnecting"
        ? "wifiOff"
        : "pencil";
  return (
    <li
      className={[
        "player-row",
        isSelf ? "player-row--you" : "",
        isActiveDrawer ? "player-row--drawer" : "",
        isRanked ? "player-row--ranked" : "",
        hasKickAction ? "player-row--kickable" : "",
        !player.isConnected ? "player-row--disconnected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-current={isActiveDrawer ? true : undefined}
    >
      {rank ? <span className="player-row__rank numeric">{rank}</span> : null}
      <Avatar name={player.name} config={player.avatar} size={44} />
      <div className="player-row__identity">
        <strong>
          {player.name}
          {isSelf ? " · You" : ""}
        </strong>
        <span className="player-row__meta">
          {player.isHost ? (
            <span className="player-row__role">
              <Icon name="crown" size={14} />
              <span>Host</span>
            </span>
          ) : player.isDrawing && !isActiveDrawer ? (
            <span className="player-row__role">
              <Icon name="pencil" size={14} />
              <span>Drawing</span>
            </span>
          ) : !isActiveDrawer ? (
            <span className="player-row__role">
              <Icon
                name={player.isConnected ? "wifi" : "wifiOff"}
                size={14}
              />
              <span>
                {player.hasGuessed
                  ? "Guessed"
                  : player.isConnected
                    ? "Ready"
                    : "Reconnecting"}
              </span>
            </span>
          ) : null}
          {isActiveDrawer && activeDrawerStatus ? (
            <span className="player-row__drawer-badge">
              <Icon name={activeDrawerIcon} size={14} />
              <span>{activeDrawerStatus}</span>
            </span>
          ) : null}
        </span>
      </div>
      {showScore ? (
        <strong
          key={player.score}
          className="player-row__score numeric"
        >
          {player.score}
        </strong>
      ) : null}
      {hasKickAction ? (
        <IconButton
          icon="logOut"
          label={`Remove ${player.name} from room`}
          onClick={onKick}
        />
      ) : null}
    </li>
  );
}

export function PlayersPanel({
  players,
  selfId,
  showKick,
  onKick,
  ranked,
  title = "Players",
  activeDrawerId,
  activeDrawerStatus,
  showScores = true,
}: {
  players: readonly PlayerPublic[];
  selfId: string;
  showKick?: boolean;
  onKick?: (playerId: string) => void;
  ranked?: boolean;
  title?: string;
  activeDrawerId?: string | null;
  activeDrawerStatus?: ActiveDrawerStatus;
  showScores?: boolean;
}) {
  const headingId = useId();
  const sorted = ranked
    ? [...players].sort((a, b) => b.score - a.score)
    : [...players];
  return (
    <Panel className="players-panel" aria-labelledby={headingId}>
      <div className="split panel__heading">
        <h2 id={headingId}>{title}</h2>
        <span className="muted numeric">{players.length}/12</span>
      </div>
      <ol className="player-list">
        {sorted.map((player, index) => (
          <PlayerRow
            key={player.id}
            player={player}
            selfId={selfId}
            onKick={() => onKick?.(player.id)}
            {...(ranked ? { rank: index + 1 } : {})}
            {...(showKick === undefined ? {} : { showKick })}
            {...(activeDrawerId === undefined ? {} : { activeDrawerId })}
            {...(activeDrawerStatus === undefined
              ? {}
              : { activeDrawerStatus })}
            showScore={showScores}
          />
        ))}
      </ol>
    </Panel>
  );
}
