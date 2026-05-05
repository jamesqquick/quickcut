export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "quickcut:theme";

const SYSTEM_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/**
 * Read the persisted theme from localStorage. If nothing is stored yet,
 * fall back to the OS preference. The result is always a concrete
 * "light" or "dark" — there is no "system" mode at runtime.
 */
export function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark") return value;
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe, etc.)
  }
  return window.matchMedia(SYSTEM_MEDIA_QUERY).matches ? "dark" : "light";
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // best-effort persistence
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", theme === "dark");
}
