"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { darken, parseHex, readableForeground, rgbToHex } from "@/lib/color";
import { DEFAULT_THEME, STORAGE_KEY_ACCENT, STORAGE_KEY_THEME, THEME_IDS, type ThemeId } from "@/lib/themes";

type ThemeContextValue = {
  theme: ThemeId;
  accent: string | null;
  setTheme: (theme: ThemeId) => void;
  setAccent: (hex: string) => void;
  resetAccent: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/** Reads the theme the inline script (components/theme/theme-script.tsx)
 * already applied to `<html>`, so the provider's first render agrees with
 * the DOM instead of momentarily reverting to the default before an effect
 * corrects it (which would itself cause a flash/hydration mismatch). */
function readInitialTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;
  const current = document.documentElement.dataset.theme;
  return current && isThemeId(current) ? current : DEFAULT_THEME;
}

/** Same idea for the custom accent: the inline script already set
 * `--primary` as an inline style on `<html>` if a valid accent was stored,
 * so read it back rather than re-deriving from localStorage. */
function readInitialAccent(): string | null {
  if (typeof document === "undefined") return null;
  const inline = document.documentElement.style.getPropertyValue("--primary").trim();
  return inline && parseHex(inline) ? inline : null;
}

/** Custom-hover darken amount, matching the inline script's inlined copy of
 * this same math (kept as one named constant here since this file, unlike
 * theme-script.tsx, is free to share real code via lib/color.ts). */
const HOVER_DARKEN_AMOUNT = 0.12;

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(() => readInitialTheme());
  const [accent, setAccentState] = useState<string | null>(() => readInitialAccent());

  function setTheme(next: ThemeId): void {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, next);
    } catch {
      // Storage unavailable (private browsing, disabled storage, quota) --
      // the theme still applies for this session via the DOM mutation
      // below, it just won't persist across visits.
    }
    if (next === DEFAULT_THEME) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }
  }

  function setAccent(hex: string): void {
    const rgb = parseHex(hex);
    if (!rgb) return; // Reject anything that doesn't parse as a hex color.

    const canonical = rgbToHex(rgb.r, rgb.g, rgb.b);
    setAccentState(canonical);
    try {
      localStorage.setItem(STORAGE_KEY_ACCENT, canonical);
    } catch {
      // Same as above -- applies this session, may not persist.
    }

    const style = document.documentElement.style;
    style.setProperty("--primary", canonical);
    style.setProperty("--primary-hover", darken(canonical, HOVER_DARKEN_AMOUNT));
    style.setProperty("--primary-foreground", readableForeground(canonical));
  }

  function resetAccent(): void {
    setAccentState(null);
    try {
      localStorage.removeItem(STORAGE_KEY_ACCENT);
    } catch {
      // Ignore -- worst case the stale key lingers and gets overwritten
      // next time an accent is set.
    }
    const style = document.documentElement.style;
    style.removeProperty("--primary");
    style.removeProperty("--primary-hover");
    style.removeProperty("--primary-foreground");
  }

  return (
    <ThemeContext.Provider value={{ theme, accent, setTheme, setAccent, resetAccent }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
