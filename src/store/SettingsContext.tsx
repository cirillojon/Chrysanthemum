import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

export interface Settings {
  /** Gear ambient particle / glow animations on plant tiles */
  plotAnimations:        boolean;
  /** Bottom-left gear effect icons (💧 🌸 🧹 🧺 💡) */
  plotGearIndicator:     boolean;
  /** Mutation emoji badge on bloomed tiles */
  plotMutationIndicator: boolean;
  /** ⚡ mastery badge on tiles */
  plotMasteryIndicator:  boolean;
}

const DEFAULTS: Settings = {
  plotAnimations:        true,
  plotGearIndicator:     true,
  plotMutationIndicator: true,
  plotMasteryIndicator:  true,
};

const LS_KEY = "chrysanthemum_settings";

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function saveSettings(s: Settings) {
  localStorage.setItem(LS_KEY, JSON.stringify(s));
}

interface SettingsCtx {
  settings:    Settings;
  setSetting:  <K extends keyof Settings>(key: K, value: Settings[K]) => void;
}

const Ctx = createContext<SettingsCtx | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const setSetting = useCallback(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      saveSettings(next);
      return next;
    });
  }, []);

  return <Ctx.Provider value={{ settings, setSetting }}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
