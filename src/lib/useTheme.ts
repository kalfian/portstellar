import { useEffect, useState } from "react";

export type Theme = "dark" | "light";

const KEY = "svcdisc.theme";

function read(): Theme {
  if (typeof window === "undefined") return "dark";
  const stored = localStorage.getItem(KEY);
  if (stored === "dark" || stored === "light") return stored;
  return "dark";
}

export function useTheme(): [Theme, () => void] {
  const [theme, setTheme] = useState<Theme>(read);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("light", theme === "light");
    root.style.colorScheme = theme;
    localStorage.setItem(KEY, theme);
  }, [theme]);

  return [theme, () => setTheme((t) => (t === "dark" ? "light" : "dark"))];
}
