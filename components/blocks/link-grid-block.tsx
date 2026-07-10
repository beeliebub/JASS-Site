"use client";

import { useState } from "react";
import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

export type QuickLink = { href: string; title: string; description: string };
export type LinkGridData = { links: QuickLink[]; tone?: Tone };

/** Full literal `group-hover:text-*` class per tone -- kept as complete,
 * non-interpolated strings so Tailwind's static source scanner can see them
 * (it reads raw file text, not evaluated JS, so `` `group-hover:${x}` ``
 * template concatenation would silently fail to generate the CSS). Warning
 * reuses the accent color, matching the rest of TONE_STYLES. */
const GROUP_HOVER_TEXT: Record<Tone, string> = {
  neutral: "group-hover:text-primary",
  primary: "group-hover:text-primary",
  accent: "group-hover:text-accent",
  info: "group-hover:text-info",
  warning: "group-hover:text-accent",
  danger: "group-hover:text-danger",
};

/** The hardcoded `links` array from components/home/quick-links.tsx. */
export function LinkGridBlock({
  data,
  onSaveData,
}: {
  data: LinkGridData;
  onSaveData: (next: LinkGridData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [links, setLinks] = useState(data.links);
  const [tone, setTone] = useState<Tone>(data.tone ?? "neutral");
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;
  // Neutral keeps today's exact hover treatment (primary title/arrow on
  // hover). Toned grids swap the hover accent for the tone's color.
  const hoverClass = GROUP_HOVER_TEXT[tone];

  if (!showEditable) {
    return (
      <section className="border-b border-border">
        <Container className="py-16 sm:py-20">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Get oriented</h2>
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group flex flex-col gap-2 bg-surface p-6 transition-colors hover:bg-surface-2"
              >
                <span className={`flex items-center justify-between text-base font-semibold text-foreground transition-colors ${hoverClass}`}>
                  {link.title}
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={`text-muted transition group-hover:translate-x-0.5 ${hoverClass}`}>
                    <path d="M3 8h9.5M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-sm text-pretty text-muted">{link.description}</span>
              </Link>
            ))}
          </div>
        </Container>
      </section>
    );
  }

  async function persist(next: QuickLink[]) {
    const previous = links;
    setLinks(next);
    setSaving(true);
    try {
      await onSaveData({ links: next, tone });
    } catch (error) {
      setLinks(previous);
      showError(error instanceof Error ? error.message : "Failed to save links.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(index: number, field: keyof QuickLink, value: string) {
    return persist(links.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addLink() {
    return persist([...links, { href: "/", title: "New link", description: "Describe where this goes." }]);
  }

  function deleteLink(index: number) {
    return persist(links.filter((_, i) => i !== index));
  }

  function moveLink(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= links.length) return Promise.resolve();
    const next = [...links];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist(next);
  }

  async function changeTone(next: Tone) {
    const previous = tone;
    setTone(next);
    try {
      await onSaveData({ links, tone: next });
    } catch (error) {
      setTone(previous);
      showError(error instanceof Error ? error.message : "Failed to save tone.");
    }
  }

  return (
    <section className="border-b border-border">
      <Container className="py-16 sm:py-20">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Get oriented</h2>
          <ToneSelect value={tone} onChange={changeTone} />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {links.map((link, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface p-4">
              <div className="min-w-0 flex-1">
                <EditableText
                  as="span"
                  value={link.title}
                  onSave={(v) => updateField(i, "title", v)}
                  label={`link ${i + 1} title`}
                  className="block text-base font-semibold text-foreground"
                />
                <EditableText
                  as="span"
                  value={link.href}
                  onSave={(v) => updateField(i, "href", v)}
                  label={`link ${i + 1} href`}
                  className="mt-1 block font-mono text-xs text-primary"
                />
                <EditableText
                  as="span"
                  multiline
                  value={link.description}
                  onSave={(v) => updateField(i, "description", v)}
                  label={`link ${i + 1} description`}
                  className="mt-1 block text-sm text-muted"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <MoveUpButton disabled={i === 0 || saving} onClick={() => moveLink(i, -1)} />
                <MoveDownButton disabled={i === links.length - 1 || saving} onClick={() => moveLink(i, 1)} />
                <DeleteButton label="Delete link" onClick={() => deleteLink(i)} disabled={saving} />
              </div>
            </div>
          ))}
          <AddButton onClick={addLink} disabled={saving} className="self-start">
            Add link
          </AddButton>
        </div>
      </Container>
    </section>
  );
}
