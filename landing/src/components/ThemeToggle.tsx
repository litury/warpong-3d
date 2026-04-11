import { useState } from "react";
import { type Theme, getInitialTheme, persistTheme } from "../config/theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    persistTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label="Переключить тему"
      style={{
        background: "none",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: "8px 12px",
        cursor: "pointer",
        color: "var(--text)",
        fontSize: 16,
        lineHeight: 1,
        transition: "border-color 0.2s",
      }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
