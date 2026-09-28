import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Button } from "@skytrace/ui";
import { Moon, Sun } from "lucide-react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "skytrace:theme";

/**
 * The one place the light/dark choice lives.
 *
 * The class is applied by a tiny inline script in index.html before first
 * paint, because doing it from React means the page renders in the default
 * theme and then swaps — a visible flash on every load. This provider only
 * has to keep React in step with what that script already decided.
 */
const ThemeContext = createContext<{ theme: Theme; toggle: () => void }>({
  theme: "light",
  toggle: () => {},
});

function readInitialTheme(): Theme {
  if (typeof window === "undefined") return "light";
  // The inline script has already set the class; trust the DOM over storage so
  // the two can never disagree.
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private browsing and blocked storage both throw here. The theme still
      // works for this page view; it just will not be remembered.
    }
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/**
 * The toggle itself. Rendered in all three headers so the choice is reachable
 * from anywhere in the app, including the signed-in dashboard where there is
 * no navigation to leave from.
 */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const next = theme === "dark" ? "light" : "dark";

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={toggle}
      title={`Switch to ${next} mode`}
      aria-label={`Switch to ${next} mode`}
      className="shrink-0"
    >
      {theme === "dark" ? <Sun /> : <Moon />}
    </Button>
  );
}
