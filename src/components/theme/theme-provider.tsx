"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";

/** PRD F18: dark theme follows the system setting and can be pinned by hand. */
export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "documind_theme";
const DARK_QUERY = "(prefers-color-scheme: dark)";

/** Runs before first paint from the root layout, so the stored choice is on
    <html> before anything is painted and the page never flashes the wrong
    theme. It writes the same class this provider reads, which is why the
    document itself is the store: no effect has to reconcile the two. */
export const THEME_INIT_SCRIPT = `(function(){try{var m=localStorage.getItem("${STORAGE_KEY}");var r=document.documentElement;if(m==="light"){r.classList.add("theme-light");}else if(m==="dark"){r.classList.add("theme-dark");}}catch(e){}})();`;

type ThemeContextValue = {
  mode: ThemeMode;
  /** The system preference itself, what the System position would follow. */
  systemDark: boolean;
  setMode: (mode: ThemeMode) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

let darkQuery: MediaQueryList | null = null;
function systemQuery(): MediaQueryList {
  darkQuery ??= window.matchMedia(DARK_QUERY);
  return darkQuery;
}

/** The class on <html> is the single source of truth. The pre-paint script
    writes it, this reads it, and the switch rewrites it. */
function currentMode(): ThemeMode {
  const root = document.documentElement;
  if (root.classList.contains("theme-light")) return "light";
  if (root.classList.contains("theme-dark")) return "dark";
  return "system";
}

function currentSystemDark(): boolean {
  return systemQuery().matches;
}

const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  // The media listener is what makes a system switch at 3am take effect with
  // no reload while the switch sits on System; storage keeps two tabs honest,
  // so a change in one window is applied here before React is asked to read.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) {
      const stored = event.key === null ? null : event.newValue;
      applyClass(stored === "light" ? "light" : stored === "dark" ? "dark" : "system");
    }
    onChange();
  };
  systemQuery().addEventListener("change", onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    systemQuery().removeEventListener("change", onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function notify() {
  for (const listener of listeners) listener();
}

function applyClass(mode: ThemeMode) {
  const root = document.documentElement;
  root.classList.toggle("theme-light", mode === "light");
  root.classList.toggle("theme-dark", mode === "dark");
}

const serverMode = (): ThemeMode => "system";
const serverSystemDark = (): boolean => false;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const mode = useSyncExternalStore(subscribe, currentMode, serverMode);
  const systemDark = useSyncExternalStore(subscribe, currentSystemDark, serverSystemDark);

  const setMode = useCallback((next: ThemeMode) => {
    applyClass(next);
    try {
      if (next === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage blocked: the choice still applies for this visit.
    }
    notify();
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, systemDark, setMode }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside ThemeProvider");
  return value;
}
