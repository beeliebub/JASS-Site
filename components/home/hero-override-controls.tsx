"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect } from "@/components/blocks/tones";
import type { HeroButton } from "@/components/home/hero-content";

/** Matches `heroDataSchema` in lib/validation/pages.ts -- max 4 buttons. */
const MAX_BUTTONS = 4;

export type HeroData = {
  headingOverride?: string | null;
  taglineOverride?: string | null;
  buttons?: HeroButton[] | null;
};

/**
 * Admin-only controls for setting a per-instance heading/tagline override on
 * a hero block. Hero() itself is a Server Component (it also renders the
 * global EditableContent name/tagline via lib/content.ts), so the
 * interactive "set an override for this page only" affordance lives here as
 * a sibling client component instead, following the same local-state +
 * optimistic-save-with-rollback convention as components/blocks/link-grid-block.tsx.
 *
 * Saving here updates `block.data` (via `onSaveData`), which registry.tsx's
 * `hero` entry reads live and re-injects onto the rendered heading/tagline
 * via `cloneElement` -- so the visible heading updates immediately, no
 * separate refresh needed.
 */
export function HeroOverrideControls({
  data,
  onSaveData,
}: {
  data: HeroData;
  onSaveData: (next: HeroData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const [heading, setHeading] = useState(data.headingOverride ?? "");
  const [tagline, setTagline] = useState(data.taglineOverride ?? "");
  const [buttons, setButtons] = useState<HeroButton[]>(data.buttons ?? []);

  if (!isAdmin || !editMode) return null;

  async function saveHeading(next: string) {
    const previous = heading;
    setHeading(next);
    try {
      await onSaveData({ headingOverride: next || null, taglineOverride: tagline || null, buttons });
    } catch {
      setHeading(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  async function saveTagline(next: string) {
    const previous = tagline;
    setTagline(next);
    try {
      await onSaveData({ headingOverride: heading || null, taglineOverride: next || null, buttons });
    } catch {
      setTagline(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  async function saveButtons(next: HeroButton[]) {
    const previous = buttons;
    setButtons(next);
    try {
      await onSaveData({ headingOverride: heading || null, taglineOverride: tagline || null, buttons: next });
    } catch {
      setButtons(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  function updateButton(index: number, patch: Partial<HeroButton>) {
    return saveButtons(buttons.map((button, i) => (i === index ? { ...button, ...patch } : button)));
  }

  function addButton() {
    return saveButtons([...buttons, { label: "New button", href: "/", tone: "neutral" }]);
  }

  function deleteButton(index: number) {
    return saveButtons(buttons.filter((_, i) => i !== index));
  }

  function moveButton(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= buttons.length) return Promise.resolve();
    const next = [...buttons];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return saveButtons(next);
  }

  return (
    <Container className="pb-6">
      <div className="flex flex-col gap-2 rounded-md border border-dashed border-border-strong bg-surface p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          Heading/tagline override for this instance only — leave blank to follow the site-wide server name/tagline
        </p>
        <EditableText
          as="p"
          value={heading}
          onSave={saveHeading}
          label="heading override"
          allowEmpty
          placeholder="Falls back to the site-wide server name"
          className="block text-sm text-foreground"
        />
        <EditableText
          as="p"
          value={tagline}
          onSave={saveTagline}
          label="tagline override"
          allowEmpty
          placeholder="Falls back to the site-wide tagline"
          className="block text-sm text-foreground"
        />

        <p className="mt-2 text-xs font-medium uppercase tracking-wide text-muted">
          CTA buttons for this instance only — leave empty to use the default &quot;Explore Features&quot; / &quot;Read
          the Rules&quot; buttons
        </p>
        <div className="flex flex-col gap-2">
          {buttons.map((button, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
              <EditableText
                as="span"
                value={button.label}
                onSave={(v) => updateButton(i, { label: v })}
                label={`button ${i + 1} label`}
                className="min-w-[8rem] flex-1 text-sm text-foreground"
              />
              <EditableText
                as="span"
                value={button.href}
                onSave={(v) => updateButton(i, { href: v })}
                label={`button ${i + 1} link`}
                className="min-w-[8rem] flex-1 font-mono text-xs text-primary"
              />
              <ToneSelect value={button.tone} onChange={(next) => updateButton(i, { tone: next })} label="Tone" />
              <div className="flex shrink-0 items-center gap-1">
                <MoveUpButton disabled={i === 0} onClick={() => moveButton(i, -1)} />
                <MoveDownButton disabled={i === buttons.length - 1} onClick={() => moveButton(i, 1)} />
                <DeleteButton label="Delete button" onClick={() => deleteButton(i)} />
              </div>
            </div>
          ))}
          <AddButton onClick={addButton} disabled={buttons.length >= MAX_BUTTONS} className="self-start">
            Add button
          </AddButton>
        </div>
      </div>
    </Container>
  );
}
