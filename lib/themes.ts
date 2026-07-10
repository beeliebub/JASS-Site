/**
 * Client-safe theme/tone constants (Phase 9). No Prisma imports here -- this
 * is imported from both server code and client components (theme picker,
 * inline theme script, block tone selects, lib/validation/pages.ts).
 */

export const THEME_IDS = ["obsidian", "parchment", "deepslate", "end", "redstone"] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "obsidian";

export const THEMES: Record<ThemeId, { label: string; description: string; swatch: string }> = {
  obsidian: {
    label: "Obsidian",
    description: "The default dark, cool-green look.",
    swatch: "#34c47c",
  },
  parchment: {
    label: "Parchment",
    description: "Light surfaces with a darkened emerald primary.",
    swatch: "#1f8f57",
  },
  deepslate: {
    label: "Deepslate",
    description: "Cool blue-gray dark theme.",
    swatch: "#5b9bd5",
  },
  end: {
    label: "The End",
    description: "Deep purple with chorus-fruit magenta accents.",
    swatch: "#b06fe0",
  },
  redstone: {
    label: "Redstone",
    description: "Near-black with a warm red undertone, glowing redstone-dust red and torch-gold accents.",
    swatch: "#eb4034",
  },
};

export const STORAGE_KEY_THEME = "jass.theme";
export const STORAGE_KEY_ACCENT = "jass.accent";
// Phase 12: a visitor's site-wide custom-theme selection caches its
// *resolved* token values (not just an id) so the blocking inline script can
// apply them with no DB fetch on the critical path -- see theme-script.tsx
// and PLAN.md Phase 12's "no-flash caching" decision. Value shape:
// { id: string; name: string; tokens: Record<string, string> }.
export const STORAGE_KEY_CUSTOM_THEME_TOKENS = "jass.customThemeTokens";

/** The exact 16 CSS custom properties a full theme (built-in or custom) must
 * define -- shared by the inline script's validation and the client
 * provider's runtime validation of a cached custom-theme payload. */
export const THEME_TOKEN_CSS_VARS = [
  "--background",
  "--surface",
  "--surface-2",
  "--border",
  "--border-strong",
  "--foreground",
  "--muted",
  "--primary",
  "--primary-foreground",
  "--primary-hover",
  "--accent",
  "--accent-foreground",
  "--danger",
  "--info",
  "--online",
  "--offline",
] as const;

// Phase 12 custom themes: the CustomTheme DB model's field names (camelCase,
// Prisma convention) and the mapping to the kebab-case CSS custom properties
// above. Lives here (not lib/custom-themes.ts, which imports Prisma) so
// client components -- the visitor theme picker -- can convert a fetched
// CustomTheme row's fields into inline style vars without pulling Prisma
// into the client bundle.
export const CUSTOM_THEME_TOKEN_FIELDS = [
  "background",
  "surface",
  "surface2",
  "border",
  "borderStrong",
  "foreground",
  "muted",
  "primary",
  "primaryForeground",
  "primaryHover",
  "accent",
  "accentForeground",
  "danger",
  "info",
  "online",
  "offline",
] as const;

export type CustomThemeTokenField = (typeof CUSTOM_THEME_TOKEN_FIELDS)[number];

export const CUSTOM_THEME_TOKEN_TO_CSS_VAR: Record<CustomThemeTokenField, string> = {
  background: "--background",
  surface: "--surface",
  surface2: "--surface-2",
  border: "--border",
  borderStrong: "--border-strong",
  foreground: "--foreground",
  muted: "--muted",
  primary: "--primary",
  primaryForeground: "--primary-foreground",
  primaryHover: "--primary-hover",
  accent: "--accent",
  accentForeground: "--accent-foreground",
  danger: "--danger",
  info: "--info",
  online: "--online",
  offline: "--offline",
};

/** Converts a CustomTheme row's hex fields (or any object with the same 16
 * field names) into a CSS-custom-property keyed object, e.g. for spreading
 * into a `style` prop or applying via `style.setProperty` in a loop. */
export function customThemeFieldsToCssVars(fields: Record<CustomThemeTokenField, string>): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const field of CUSTOM_THEME_TOKEN_FIELDS) {
    vars[CUSTOM_THEME_TOKEN_TO_CSS_VAR[field]] = fields[field];
  }
  return vars;
}

export const TONES = ["neutral", "primary", "accent", "info", "warning", "danger"] as const;

export type Tone = (typeof TONES)[number];
