import type { ReactNode } from "react";
import { TONES, type Tone } from "@/lib/themes";

/**
 * Shared tone -> Tailwind token class map (Phase 9). Backs every
 * tone-capable block (callout, pageHeader, ctaBanner, linkGrid). `neutral`
 * intentionally mirrors each block's original (pre-tone) default styling so
 * existing rows with no `tone`/`variant !== tone` keep looking identical.
 *
 * There is no separate `--warning` design token in this project -- `accent`
 * has always doubled as the "warning" color (see the original callout
 * variant map), so `warning` reuses the accent classes here too.
 */
export const TONE_STYLES: Record<Tone, { container: string; title: string; icon?: ReactNode }> = {
  neutral: { container: "border-border-strong bg-surface-2", title: "text-foreground", icon: "●" },
  primary: { container: "border-primary/30 bg-primary/10", title: "text-primary", icon: "●" },
  accent: { container: "border-accent/30 bg-accent/10", title: "text-accent", icon: "✦" },
  info: { container: "border-info/30 bg-info/10", title: "text-info", icon: "ℹ" },
  warning: { container: "border-accent/30 bg-accent/10", title: "text-accent", icon: "⚠" },
  danger: { container: "border-danger/30 bg-danger/10", title: "text-danger", icon: "✕" },
};

const TONE_LABELS: Record<Tone, string> = {
  neutral: "Neutral",
  primary: "Primary",
  accent: "Accent",
  info: "Info",
  warning: "Warning",
  danger: "Danger",
};

/** Edit-mode tone `<select>`, cloned from callout-block.tsx's original
 * warning/info variant select but offering all `TONES`. */
export function ToneSelect({
  value,
  onChange,
  label = "Tone",
}: {
  value: Tone;
  onChange: (next: Tone) => void;
  label?: string;
}) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
      {label}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as Tone)}
        className="h-7 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
      >
        {TONES.map((tone) => (
          <option key={tone} value={tone}>
            {TONE_LABELS[tone]}
          </option>
        ))}
      </select>
    </label>
  );
}
