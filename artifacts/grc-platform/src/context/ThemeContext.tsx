import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";

export type ThemeMode = "light" | "dark" | "dark-blue" | "gaussian-black" | "semi-dark" | "light-dark";

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark-blue",
  setTheme: () => {},
});

const THEME_CLASSES: ThemeMode[] = ["light", "dark", "dark-blue", "gaussian-black", "semi-dark", "light-dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = localStorage.getItem("grc_theme") as ThemeMode | null;
    return stored ?? "dark-blue";
  });

  useEffect(() => {
    const html = document.documentElement;
    THEME_CLASSES.forEach(c => html.classList.remove(c));
    html.classList.add(theme);
    localStorage.setItem("grc_theme", theme);
  }, [theme]);

  function setTheme(t: ThemeMode) {
    setThemeState(t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export const THEME_OPTIONS: { value: ThemeMode; label: string; icon: string; desc: string }[] = [
  { value: "light",          label: "Pure Light",       icon: "☀️",  desc: "Clean white" },
  { value: "light-dark",     label: "Light + Dark Nav",  icon: "◐",   desc: "White content, navy nav" },
  { value: "dark",           label: "Dark",             icon: "🌑",  desc: "Standard dark" },
  { value: "dark-blue",      label: "Dark Blue",        icon: "🌊",  desc: "Navy glass" },
  { value: "gaussian-black", label: "Gaussian Black",   icon: "⬛",  desc: "Deep black" },
  { value: "semi-dark",      label: "Semi Dark",        icon: "🌓",  desc: "Dark sidebar" },
];
