"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type HeroData = { headingOverride?: string | null; taglineOverride?: string | null };

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

  if (!isAdmin || !editMode) return null;

  async function saveHeading(next: string) {
    const previous = heading;
    setHeading(next);
    try {
      await onSaveData({ headingOverride: next || null, taglineOverride: tagline || null });
    } catch {
      setHeading(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  async function saveTagline(next: string) {
    const previous = tagline;
    setTagline(next);
    try {
      await onSaveData({ headingOverride: heading || null, taglineOverride: next || null });
    } catch {
      setTagline(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
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
      </div>
    </Container>
  );
}
