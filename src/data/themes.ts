export interface Theme {
  id:      string;
  name:    string;
  emoji:   string;
  /** [background, primary] as CSS hsl() strings — used for the picker swatch */
  swatch:  [string, string];
  vars: {
    "--background":           string;
    "--foreground":           string;
    "--card":                 string;
    "--primary":              string;
    "--primary-foreground":   string;
    "--secondary":            string;
    "--secondary-foreground": string;
    "--muted-foreground":     string;
    "--border":               string;
  };
}

export const THEMES: Theme[] = [
  {
    id:     "garden",
    name:   "Garden",
    emoji:  "🌿",
    swatch: ["hsl(30,20%,8%)", "hsl(142,50%,50%)"],
    vars: {
      "--background":           "30 20% 8%",
      "--foreground":           "60 30% 90%",
      "--card":                 "30 15% 12%",
      "--primary":              "142 50% 50%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "30 15% 18%",
      "--secondary-foreground": "60 20% 70%",
      "--muted-foreground":     "60 10% 50%",
      "--border":               "30 15% 22%",
    },
  },
  {
    id:     "midnight",
    name:   "Midnight",
    emoji:  "🌙",
    swatch: ["hsl(222,30%,7%)", "hsl(217,80%,62%)"],
    vars: {
      "--background":           "222 30% 7%",
      "--foreground":           "210 25% 90%",
      "--card":                 "222 25% 11%",
      "--primary":              "217 80% 62%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "222 20% 16%",
      "--secondary-foreground": "210 15% 68%",
      "--muted-foreground":     "215 12% 50%",
      "--border":               "222 20% 21%",
    },
  },
  {
    id:     "sakura",
    name:   "Sakura",
    emoji:  "🌸",
    swatch: ["hsl(340,18%,7%)", "hsl(340,70%,66%)"],
    vars: {
      "--background":           "340 18% 7%",
      "--foreground":           "20 20% 90%",
      "--card":                 "340 14% 11%",
      "--primary":              "340 70% 66%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "340 12% 16%",
      "--secondary-foreground": "20 12% 68%",
      "--muted-foreground":     "340 8% 50%",
      "--border":               "340 13% 21%",
    },
  },
  {
    id:     "twilight",
    name:   "Twilight",
    emoji:  "💜",
    swatch: ["hsl(268,22%,7%)", "hsl(268,60%,66%)"],
    vars: {
      "--background":           "268 22% 7%",
      "--foreground":           "270 18% 90%",
      "--card":                 "268 18% 11%",
      "--primary":              "268 60% 66%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "268 15% 16%",
      "--secondary-foreground": "270 10% 68%",
      "--muted-foreground":     "268 10% 50%",
      "--border":               "268 16% 21%",
    },
  },
  {
    id:     "ember",
    name:   "Ember",
    emoji:  "🔥",
    swatch: ["hsl(18,25%,7%)", "hsl(18,85%,56%)"],
    vars: {
      "--background":           "18 25% 7%",
      "--foreground":           "40 25% 90%",
      "--card":                 "18 20% 11%",
      "--primary":              "18 85% 56%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "18 18% 16%",
      "--secondary-foreground": "40 14% 68%",
      "--muted-foreground":     "25 12% 50%",
      "--border":               "18 18% 21%",
    },
  },
  {
    id:     "ocean",
    name:   "Ocean",
    emoji:  "🌊",
    swatch: ["hsl(196,32%,7%)", "hsl(185,65%,50%)"],
    vars: {
      "--background":           "196 32% 7%",
      "--foreground":           "190 20% 90%",
      "--card":                 "196 26% 11%",
      "--primary":              "185 65% 50%",
      "--primary-foreground":   "0 0% 5%",
      "--secondary":            "196 20% 16%",
      "--secondary-foreground": "190 12% 68%",
      "--muted-foreground":     "192 12% 50%",
      "--border":               "196 20% 21%",
    },
  },
];

export const DEFAULT_THEME = THEMES[0];

export function applyTheme(themeId: string) {
  const theme = THEMES.find((t) => t.id === themeId) ?? DEFAULT_THEME;
  const root  = document.documentElement;
  for (const [key, value] of Object.entries(theme.vars)) {
    root.style.setProperty(key, value);
  }
}
