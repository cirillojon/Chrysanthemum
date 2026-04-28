import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, THEMES, applyTheme } from "../../src/data/themes";

describe("THEMES catalog (regression)", () => {
  it("has multiple themes with unique ids", () => {
    expect(THEMES.length).toBeGreaterThan(1);
    const ids = THEMES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("DEFAULT_THEME is the first defined theme", () => {
    expect(DEFAULT_THEME).toBe(THEMES[0]);
  });

  it("each theme defines all expected CSS variables", () => {
    const expectedVars = [
      "--background",
      "--foreground",
      "--card",
      "--primary",
      "--primary-foreground",
      "--secondary",
      "--secondary-foreground",
      "--muted-foreground",
      "--border",
    ];
    for (const t of THEMES) {
      for (const v of expectedVars) {
        expect(t.vars[v as keyof typeof t.vars], `${t.id}.${v}`).toBeTruthy();
      }
    }
  });
});

describe("applyTheme (regression)", () => {
  it("writes every theme variable onto the document root", () => {
    const theme = THEMES.find((t) => t.id === "midnight")!;
    applyTheme(theme.id);
    const root = document.documentElement;
    for (const [key, value] of Object.entries(theme.vars)) {
      expect(root.style.getPropertyValue(key)).toBe(value);
    }
  });

  it("falls back to DEFAULT_THEME for unknown ids", () => {
    applyTheme("__nonexistent_theme__");
    const root = document.documentElement;
    for (const [key, value] of Object.entries(DEFAULT_THEME.vars)) {
      expect(root.style.getPropertyValue(key)).toBe(value);
    }
  });
});
