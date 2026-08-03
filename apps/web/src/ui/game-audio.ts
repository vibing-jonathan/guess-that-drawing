export type GameSound =
  | "close"
  | "correct"
  | "incorrect"
  | "join"
  | "leave"
  | "phase"
  | "roomReady"
  | "score"
  | "tap"
  | "timerFinal"
  | "timerTick"
  | "victory";

const SOUND_PREFERENCE_KEY = "gtd:game-sounds";
const listeners = new Set<() => void>();

let audioContext: AudioContext | null = null;
let enabled = readPreference();

interface AudioWindow extends Window {
  webkitAudioContext?: typeof AudioContext;
}

function readPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== "off";
  } catch {
    return true;
  }
}

function getAudioContext(): AudioContext | null {
  if (audioContext) return audioContext;
  if (typeof window === "undefined") return null;
  const AudioContextConstructor =
    window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  audioContext = new AudioContextConstructor();
  return audioContext;
}

export function isGameSoundEnabled(): boolean {
  return enabled;
}

export function subscribeGameSound(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setGameSoundEnabled(nextEnabled: boolean): void {
  if (enabled === nextEnabled) return;
  enabled = nextEnabled;
  try {
    window.localStorage.setItem(
      SOUND_PREFERENCE_KEY,
      nextEnabled ? "on" : "off",
    );
  } catch {
    // A blocked storage preference should not block sound for this session.
  }
  if (!nextEnabled && audioContext?.state === "running") {
    void audioContext.suspend();
  }
  listeners.forEach((listener) => listener());
}

export async function unlockGameAudio(): Promise<boolean> {
  if (!enabled) return false;
  const context = getAudioContext();
  if (!context) return false;
  if (context.state === "suspended") {
    try {
      await context.resume();
    } catch {
      return false;
    }
  }
  return context.state === "running";
}

function tone(
  context: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  options: {
    gain?: number;
    endFrequency?: number;
    type?: OscillatorType;
  } = {},
): void {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  const peak = options.gain ?? 0.055;
  const attackEnd = start + Math.min(0.018, duration * 0.18);
  const end = start + duration;

  oscillator.type = options.type ?? "sine";
  oscillator.frequency.setValueAtTime(frequency, start);
  if (options.endFrequency) {
    oscillator.frequency.exponentialRampToValueAtTime(
      options.endFrequency,
      end,
    );
  }
  envelope.gain.setValueAtTime(0.0001, start);
  envelope.gain.exponentialRampToValueAtTime(peak, attackEnd);
  envelope.gain.exponentialRampToValueAtTime(0.0001, end);
  oscillator.connect(envelope);
  envelope.connect(context.destination);
  oscillator.start(start);
  oscillator.stop(end + 0.02);
}

function pencilNoise(
  context: AudioContext,
  start: number,
  duration = 0.12,
  gain = 0.018,
): void {
  const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = (Math.random() * 2 - 1) * (1 - index / channel.length);
  }
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = buffer;
  filter.type = "bandpass";
  filter.frequency.setValueAtTime(2_400, start);
  filter.Q.setValueAtTime(0.7, start);
  envelope.gain.setValueAtTime(gain, start);
  envelope.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(context.destination);
  source.start(start);
}

export function playGameSound(sound: GameSound): boolean {
  if (!enabled || !audioContext || audioContext.state !== "running") {
    return false;
  }

  const context = audioContext;
  const now = context.currentTime + 0.008;
  switch (sound) {
    case "tap":
      tone(context, 520, now, 0.045, {
        gain: 0.018,
        endFrequency: 660,
        type: "triangle",
      });
      break;
    case "timerTick":
      tone(context, 840, now, 0.055, {
        gain: 0.032,
        endFrequency: 690,
        type: "square",
      });
      break;
    case "timerFinal":
      tone(context, 980, now, 0.11, {
        gain: 0.045,
        endFrequency: 760,
        type: "square",
      });
      tone(context, 1_520, now + 0.035, 0.1, { gain: 0.025 });
      break;
    case "join":
      tone(context, 523.25, now, 0.12, { gain: 0.04, type: "triangle" });
      tone(context, 783.99, now + 0.07, 0.18, {
        gain: 0.05,
        type: "triangle",
      });
      break;
    case "leave":
      tone(context, 659.25, now, 0.14, { gain: 0.035, type: "triangle" });
      tone(context, 392, now + 0.08, 0.2, { gain: 0.035, type: "triangle" });
      break;
    case "roomReady":
      pencilNoise(context, now, 0.1, 0.012);
      [523.25, 659.25, 783.99].forEach((frequency, index) =>
        tone(context, frequency, now + index * 0.07, 0.22, {
          gain: 0.045,
          type: "triangle",
        }),
      );
      break;
    case "phase":
      pencilNoise(context, now, 0.16, 0.02);
      tone(context, 440, now + 0.035, 0.13, {
        gain: 0.035,
        endFrequency: 660,
        type: "triangle",
      });
      break;
    case "incorrect":
      tone(context, 196, now, 0.13, {
        gain: 0.028,
        endFrequency: 155.56,
        type: "triangle",
      });
      break;
    case "close":
      tone(context, 493.88, now, 0.15, { gain: 0.04, type: "triangle" });
      tone(context, 554.37, now + 0.09, 0.2, {
        gain: 0.045,
        endFrequency: 587.33,
        type: "triangle",
      });
      break;
    case "correct":
      [523.25, 659.25, 783.99, 1_046.5].forEach((frequency, index) =>
        tone(context, frequency, now + index * 0.055, 0.24, {
          gain: index === 3 ? 0.035 : 0.047,
          type: "triangle",
        }),
      );
      break;
    case "score":
      tone(context, 880, now, 0.16, { gain: 0.045, type: "triangle" });
      tone(context, 1_320, now + 0.055, 0.22, { gain: 0.035 });
      break;
    case "victory":
      [392, 523.25, 659.25, 783.99, 1_046.5].forEach(
        (frequency, index) =>
          tone(context, frequency, now + index * 0.09, 0.32, {
            gain: index >= 3 ? 0.04 : 0.052,
            type: "triangle",
          }),
      );
      pencilNoise(context, now + 0.25, 0.22, 0.01);
      break;
  }
  return true;
}
