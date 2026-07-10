"use client";

import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { TONE_STYLES, ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

export type CtaBannerData = {
  heading: string;
  body?: string;
  buttonLabel: string;
  buttonHref: string;
  tone?: Tone;
};

export function CtaBannerBlock({
  data,
  onSaveData,
}: {
  data: CtaBannerData;
  onSaveData: (next: CtaBannerData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const isInternal = data.buttonHref.startsWith("/");
  const tone = data.tone ?? "neutral";
  const toneStyles = TONE_STYLES[tone];
  // Neutral keeps today's exact panel/button look. Toned panels use the
  // shared tone tint; toned buttons use an outline treatment (border + tint
  // + tone text) rather than a solid fill, since only primary/accent have a
  // guaranteed readable "-foreground" token today (see app/globals.css).
  const panelClass =
    tone === "neutral"
      ? "border-border-strong bg-surface"
      : toneStyles.container;
  const buttonClass =
    tone === "neutral"
      ? "bg-primary text-primary-foreground hover:bg-primary-hover"
      : `border ${toneStyles.container} ${toneStyles.title} hover:bg-current/20`;

  return (
    <Container className="py-8 sm:py-10">
      <div
        className={`flex flex-col items-start gap-4 rounded-lg border p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8 ${panelClass}`}
      >
        <div className="min-w-0 flex-1">
          {showEditable && (
            <ToneSelect value={tone} onChange={(next) => onSaveData({ ...data, tone: next })} />
          )}
          <EditableText
            as="h2"
            value={data.heading}
            onSave={(v) => onSaveData({ ...data, heading: v })}
            label="CTA heading"
            className={`block text-xl font-semibold text-balance ${tone === "neutral" ? "text-foreground" : toneStyles.title}`}
          />
          {(showEditable || data.body) && (
            <EditableText
              as="p"
              multiline
              value={data.body ?? ""}
              onSave={(v) => onSaveData({ ...data, body: v })}
              label="CTA body"
              allowEmpty
              placeholder="Description (optional)"
              className="mt-1.5 block text-sm text-pretty text-muted"
            />
          )}
        </div>

        {showEditable ? (
          <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Button label
              <EditableText
                as="span"
                value={data.buttonLabel}
                onSave={(v) => onSaveData({ ...data, buttonLabel: v })}
                label="CTA button label"
                className="block text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Button link
              <EditableText
                as="span"
                value={data.buttonHref}
                onSave={(v) => onSaveData({ ...data, buttonHref: v })}
                label="CTA button link"
                className="block font-mono text-xs text-foreground"
              />
            </label>
          </div>
        ) : isInternal ? (
          <Link
            href={data.buttonHref}
            className={`flex h-11 shrink-0 items-center justify-center rounded-md px-5 text-sm font-medium transition motion-safe:active:scale-[0.97] ${buttonClass}`}
          >
            {data.buttonLabel}
          </Link>
        ) : (
          <a
            href={data.buttonHref}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex h-11 shrink-0 items-center justify-center rounded-md px-5 text-sm font-medium transition motion-safe:active:scale-[0.97] ${buttonClass}`}
          >
            {data.buttonLabel}
          </a>
        )}
      </div>
    </Container>
  );
}
