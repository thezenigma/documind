"use client";

import { useTheme, type ThemeMode } from "./theme-provider";

const OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

/** PRD F18: a three position switch. The pressed position carries the accent,
    and the System position says out loud what the operating system prefers,
    so the reader can tell where the page will land before pressing anything. */
export function ThemeSwitch({ label = "Theme" }: { label?: string }) {
  const { mode, systemDark, setMode } = useTheme();

  return (
    <div
      role="group"
      aria-label={label}
      className="flex items-center gap-1 rounded-[6px] border border-border bg-surface p-1"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          className="theme-option"
          aria-pressed={mode === option.value}
          onClick={() => setMode(option.value)}
        >
          {option.label}
          {option.value === "system" && (
            <span className="sr-only">
              , your system prefers the {systemDark ? "dark" : "light"} theme
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
