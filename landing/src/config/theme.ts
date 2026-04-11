export type Theme = "dark" | "light";

const STORAGE_KEY = "warpong-theme";

export function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "dark" || stored === "light") return stored;
  return window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function persistTheme(theme: Theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute("data-theme", theme);
}
