export const THEME_COOKIE = "cco-theme";

export const THEMES = ["light", "dark", "system"] as const;
export type Theme = (typeof THEMES)[number];

/** The app is light-first: anything unknown falls back to light. */
export function parseTheme(value: string | undefined | null): Theme {
  return THEMES.includes(value as Theme) ? (value as Theme) : "light";
}

export function nextTheme(current: Theme): Theme {
  const index = THEMES.indexOf(current);
  return THEMES[(index + 1) % THEMES.length] ?? "light";
}
