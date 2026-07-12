"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { darken, parseHex, readableForeground, rgbToHex } from "@/lib/color";
import {
  DEFAULT_THEME,
  STORAGE_KEY_ACCENT,
  STORAGE_KEY_CUSTOM_THEME_TOKENS,
  STORAGE_KEY_THEME,
  THEME_IDS,
  THEME_TOKEN_CSS_VARS,
  type ThemeId,
} from "@/lib/themes";

/** A visitor's site-wide custom-theme selection, cached in localStorage as
 * its already-resolved tokens (see theme-script.tsx's note for why
 * -- no DB fetch on the no-flash critical path). */
export type CustomThemeSelection = { id: string; name: string; tokens: Record<string, string> };

type ThemeContextValue = {
  theme: ThemeId;
  accent: string | null;
  customTheme: CustomThemeSelection | null;
  setTheme: (theme: ThemeId) => void;
  setAccent: (hex: string) => void;
  resetAccent: () => void;
  setCustomTheme: (selection: CustomThemeSelection) => void;
  clearCustomTheme: () => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

function isValidTokenSet(tokens: unknown): tokens is Record<string, string> {
  if (!tokens || typeof tokens !== "object") return false;
  const record = tokens as Record<string, unknown>;
  return THEME_TOKEN_CSS_VARS.every((key) => typeof record[key] === "string" && parseHex(record[key] as string));
}

function readInitialCustomTheme(): CustomThemeSelection | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CUSTOM_THEME_TOKENS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CustomThemeSelection> | null;
    if (!parsed || typeof parsed.id !== "string" || typeof parsed.name !== "string" || !isValidTokenSet(parsed.tokens)) {
      return null;
    }
    return { id: parsed.id, name: parsed.name, tokens: parsed.tokens };
  } catch {
    return null;
  }
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
  const [customTheme, setCustomThemeState] = useState<CustomThemeSelection | null>(() => readInitialCustomTheme());

  // Re-applies the *current* accent's inline overrides -- used after
  // clearing all 16 custom-theme vars (setTheme/clearCustomTheme both wipe
  // the full token set, which incidentally includes the 3 vars accent
  // manages, so the accent layer has to be restored on top afterward).
  function reapplyAccent(currentAccent: string | null): void {
    if (!currentAccent) return;
    const style = document.documentElement.style;
    style.setProperty("--primary", currentAccent);
    style.setProperty("--primary-hover", darken(currentAccent, HOVER_DARKEN_AMOUNT));
    style.setProperty("--primary-foreground", readableForeground(currentAccent));
  }

  function clearCustomThemeTokens(): void {
    const style = document.documentElement.style;
    for (const cssVar of THEME_TOKEN_CSS_VARS) style.removeProperty(cssVar);
  }

  function setTheme(next: ThemeId): void {
    setThemeState(next);
    setCustomThemeState(null);
    try {
      localStorage.setItem(STORAGE_KEY_THEME, next);
      localStorage.removeItem(STORAGE_KEY_CUSTOM_THEME_TOKENS);
    } catch {
      // Storage unavailable (private browsing, disabled storage, quota) --
      // the theme still applies for this session via the DOM mutation
      // below, it just won't persist across visits.
    }
    clearCustomThemeTokens();
    if (next === DEFAULT_THEME) {
      delete document.documentElement.dataset.theme;
    } else {
      document.documentElement.dataset.theme = next;
    }
    reapplyAccent(accent);
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
    reapplyAccent(canonical);
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

  /** Selecting a custom theme is mutually exclusive with a built-in one --
   * clears `data-theme` (the custom theme's inline vars would win anyway by
   * cascade proximity, but removing it keeps the DOM state unambiguous) and
   * caches the theme's already-resolved tokens under
   * STORAGE_KEY_CUSTOM_THEME_TOKENS so the blocking script can no-flash
   * apply them on the next load without a fetch (see theme-script.tsx). */
  function setCustomTheme(selection: CustomThemeSelection): void {
    setCustomThemeState(selection);
    try {
      localStorage.setItem(STORAGE_KEY_CUSTOM_THEME_TOKENS, JSON.stringify(selection));
    } catch {
      // Applies this session via the DOM mutation below either way.
    }
    delete document.documentElement.dataset.theme;
    const style = document.documentElement.style;
    for (const [cssVar, value] of Object.entries(selection.tokens)) style.setProperty(cssVar, value);
    reapplyAccent(accent);
  }

  function clearCustomTheme(): void {
    setCustomThemeState(null);
    try {
      localStorage.removeItem(STORAGE_KEY_CUSTOM_THEME_TOKENS);
    } catch {
      // Ignore -- worst case the stale key lingers until overwritten next.
    }
    clearCustomThemeTokens();
    if (theme !== DEFAULT_THEME) document.documentElement.dataset.theme = theme;
    reapplyAccent(accent);
  }

  return (
    <ThemeContext.Provider
      value={{ theme, accent, customTheme, setTheme, setAccent, resetAccent, setCustomTheme, clearCustomTheme }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}
