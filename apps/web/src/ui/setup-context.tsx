import {
  DEFAULT_ROOM_SETTINGS,
  type CustomThemeInput,
  type RoomSettings,
} from "@gtd/contracts";
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

interface SetupContextValue {
  settings: RoomSettings;
  setSettings: (settings: RoomSettings) => void;
  customTheme: CustomThemeInput | undefined;
  setCustomTheme: (theme: CustomThemeInput | undefined) => void;
}

const SetupContext = createContext<SetupContextValue | null>(null);

export function SetupProvider({ children }: PropsWithChildren) {
  const [settings, setSettings] = useState<RoomSettings>(
    DEFAULT_ROOM_SETTINGS,
  );
  const [customTheme, setCustomTheme] = useState<
    CustomThemeInput | undefined
  >();
  const value = useMemo(
    () => ({ settings, setSettings, customTheme, setCustomTheme }),
    [customTheme, settings],
  );
  return (
    <SetupContext.Provider value={value}>{children}</SetupContext.Provider>
  );
}

export function useSetup(): SetupContextValue {
  const value = useContext(SetupContext);
  if (!value) {
    throw new Error("useSetup must be used inside SetupProvider.");
  }
  return value;
}
