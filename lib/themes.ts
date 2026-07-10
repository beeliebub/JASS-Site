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

export const TONES = ["neutral", "primary", "accent", "info", "warning", "danger"] as const;

export type Tone = (typeof TONES)[number];
