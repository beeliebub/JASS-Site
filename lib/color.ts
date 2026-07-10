/**
 * Pure color helpers for the Phase 9 custom-accent picker. No dependencies,
 * unit-testable in isolation. All inputs are treated as untrusted (accent
 * hex ultimately comes from a visitor via localStorage / the picker UI), so
 * every function validates/clamps rather than assuming well-formed input.
 */

export type Rgb = { r: number; g: number; b: number };

/** Accepts `#rgb` or `#rrggbb` (case-insensitive). Returns null if invalid. */
export function parseHex(hex: string): Rgb | null {
  const match = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match) return null;

  const value = match[1];
  if (value.length === 3) {
    const r = parseInt(value[0] + value[0], 16);
    const g = parseInt(value[1] + value[1], 16);
    const b = parseInt(value[2] + value[2], 16);
    return { r, g, b };
  }

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return { r, g, b };
}

function clampByte(n: number): number {
  return Math.min(255, Math.max(0, Math.round(n)));
}

function toHexByte(n: number): string {
  return clampByte(n).toString(16).padStart(2, "0");
}

export function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHexByte(r)}${toHexByte(g)}${toHexByte(b)}`;
}

/** WCAG 2.x relative luminance, 0 (black) - 1 (white). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** Dark or light foreground hex, whichever reads better on `hex`. */
export function readableForeground(hex: string): string {
  const rgb = parseHex(hex);
  if (!rgb) return "#edf2ec";
  return relativeLuminance(rgb) > 0.4 ? "#05130a" : "#edf2ec";
}

/** Darkens `hex` by `amount` (0-1 fraction of each channel). Used to derive
 * a hover state from a base accent color. */
export function darken(hex: string, amount: number): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const factor = 1 - Math.min(1, Math.max(0, amount));
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}
