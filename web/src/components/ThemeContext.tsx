import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { applyTheme, readPreference, resolveTheme, savePreference, type ThemePreference } from "../design/theme";
import type { ThemeName } from "../design/tokens";

interface ThemeValue {
  preference: ThemePreference;
  theme: ThemeName;
  cycle: () => void;
}

const ThemeContext = createContext<ThemeValue>({ preference: "system", theme: "light", cycle: () => undefined });

const ORDER: ThemePreference[] = ["system", "light", "dark"];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreference] = useState<ThemePreference>(readPreference);
  const [theme, setTheme] = useState<ThemeName>(() => resolveTheme(readPreference()));

  useEffect(() => {
    const next = resolveTheme(preference);
    setTheme(next);
    applyTheme(next);
    if (preference !== "system" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const t = resolveTheme("system");
      setTheme(t);
      applyTheme(t);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [preference]);

  const cycle = useCallback(() => {
    setPreference((p) => {
      const n = ORDER[(ORDER.indexOf(p) + 1) % ORDER.length] ?? "system";
      savePreference(n);
      return n;
    });
  }, []);

  const value = useMemo(() => ({ preference, theme, cycle }), [preference, theme, cycle]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}
