"use client";

import { useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { useTheme } from "@/components/theme/theme-provider";
import { parseHex, rgbToHex } from "@/lib/color";
import { THEME_IDS, THEMES } from "@/lib/themes";

const RGB_CHANNELS = ["r", "g", "b"] as const;
type RgbChannel = (typeof RGB_CHANNELS)[number];

const CHANNEL_LABELS: Record<RgbChannel, string> = { r: "R", g: "G", b: "B" };

/**
 * Footer-anchored popover: four theme swatches wired as a `radiogroup`/`radio`
 * set (single-select, "N of 4" announced to screen readers) plus the
 * custom-accent controls (react-colorful wheel, hex field, R/G/B fields,
 * reset). Panel state is local -- there's no shared popover primitive
 * elsewhere in the codebase to reuse (checked components/admin/toast.tsx and
 * edit-mode-context.tsx; both are plain context/state, not a popover), so a
 * small local `useState` toggle is the consistent choice here. Follows the
 * WAI-ARIA dialog pattern: focus moves to the first swatch on open and
 * returns to the trigger button on every close path (click-outside, Escape).
 */
const PANEL_ID = "theme-picker-panel";

export function ThemePicker() {
  const { theme, accent, setTheme, setAccent, resetAccent } = useTheme();
  const [open, setOpen] = useState(false);
  const [hexDraft, setHexDraft] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstSwatchRef = useRef<HTMLButtonElement>(null);

  // THEMES[theme].swatch is an existing lib/themes.ts token, not a new
  // hardcoded hex in this component -- it's the sensible default color for
  // the wheel/inputs before a visitor has ever picked a custom accent.
  const pickerColor = accent ?? THEMES[theme].swatch;
  const rgb = parseHex(pickerColor) ?? { r: 0, g: 0, b: 0 };

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;

    // Move focus into the dialog on open (WAI-ARIA dialog pattern) --
    // restoring it to the trigger happens in `close()` on every exit path.
    firstSwatchRef.current?.focus();

    function handlePointerDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        close();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function handleHexInput(value: string): void {
    setHexDraft(value);
    const parsed = parseHex(value);
    if (parsed) setAccent(rgbToHex(parsed.r, parsed.g, parsed.b));
  }

  function handleChannelChange(channel: RgbChannel, rawValue: string): void {
    const parsedValue = Number(rawValue);
    const clamped = Number.isFinite(parsedValue) ? Math.min(255, Math.max(0, Math.round(parsedValue))) : 0;
    const next = { ...rgb, [channel]: clamped };
    setAccent(rgbToHex(next.r, next.g, next.b));
  }

  return (
    <div ref={panelRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={PANEL_ID}
        className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/50 hover:text-primary"
      >
        Theme
      </button>

      {open && (
        <div
          id={PANEL_ID}
          role="dialog"
          aria-label="Theme settings"
          className="absolute bottom-full right-0 z-50 mb-2 w-72 rounded-lg border border-border-strong bg-surface-2 p-4 shadow-lg"
        >
          <fieldset className="mb-4">
            <legend className="mb-2 text-xs font-medium text-muted">Theme</legend>
            <div role="radiogroup" aria-label="Theme" className="grid grid-cols-2 gap-2">
              {THEME_IDS.map((id, i) => (
                <button
                  key={id}
                  ref={i === 0 ? firstSwatchRef : undefined}
                  type="button"
                  role="radio"
                  aria-checked={theme === id}
                  onClick={() => setTheme(id)}
                  title={THEMES[id].description}
                  className={`flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                    theme === id
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border-strong text-muted hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-3 w-3 shrink-0 rounded-full border border-border-strong"
                    style={{ backgroundColor: THEMES[id].swatch }}
                  />
                  {THEMES[id].label}
                </button>
              ))}
            </div>
          </fieldset>

          <div className="mb-3">
            <p className="mb-2 text-xs font-medium text-muted">Accent color</p>
            <HexColorPicker color={pickerColor} onChange={(hex) => setAccent(hex)} />
          </div>

          <label className="mb-2 flex items-center gap-2 text-xs text-muted">
            Hex
            <input
              type="text"
              inputMode="text"
              spellCheck={false}
              value={hexDraft ?? pickerColor}
              onFocus={() => setHexDraft(pickerColor)}
              onChange={(e) => handleHexInput(e.target.value)}
              onBlur={() => setHexDraft(null)}
              className="h-7 flex-1 rounded-sm border border-border-strong bg-surface px-2 text-xs text-foreground outline-none focus-visible:border-primary"
            />
          </label>

          <div className="mb-3 grid grid-cols-3 gap-2">
            {RGB_CHANNELS.map((channel) => (
              <label key={channel} className="flex flex-col gap-1 text-xs text-muted">
                {CHANNEL_LABELS[channel]}
                <input
                  type="number"
                  min={0}
                  max={255}
                  value={rgb[channel]}
                  onChange={(e) => handleChannelChange(channel, e.target.value)}
                  className="h-7 rounded-sm border border-border-strong bg-surface px-2 text-xs text-foreground outline-none focus-visible:border-primary"
                />
              </label>
            ))}
          </div>

          <button
            type="button"
            onClick={resetAccent}
            className="w-full rounded-md border border-border-strong px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            Reset accent
          </button>
        </div>
      )}
    </div>
  );
}
