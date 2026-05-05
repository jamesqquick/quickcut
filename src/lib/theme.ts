export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "quickcut:theme";

const SYSTEM_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (value === "light" || value === "dark" || value === "system") {
      return value;
    }
  } catch {
    // localStorage may be unavailable (private mode, sandboxed iframe, etc.)
  }
  return "system";
}

export function setStoredTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // ignore — best-effort persistence
  }
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme === "light" || theme === "dark") return theme;
  if (typeof window === "undefined") return "dark";
  return window.matchMedia(SYSTEM_MEDIA_QUERY).matches ? "dark" : "light";
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  const resolved = resolveTheme(theme);
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

/**
 * Subscribe to OS-level theme changes. The callback fires whenever the
 * system preference flips. Returns an unsubscribe function.
 */
export function subscribeToSystemTheme(cb: (isDark: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const mql = window.matchMedia(SYSTEM_MEDIA_QUERY);
  const handler = (event: MediaQueryListEvent) => cb(event.matches);
  mql.addEventListener("change", handler);
  return () => mql.removeEventListener("change", handler);
}
