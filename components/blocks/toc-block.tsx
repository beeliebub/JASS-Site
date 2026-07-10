"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

export type TocItem = { label: string; anchor: string };
export type TocData = { heading?: string; items: TocItem[] };

/** Admin-curated table of contents (not auto-derived from headings -- see
 * PLAN.md Phase 15 decision 5). Security: `anchor` is validated server-side
 * to a safe charset (`lib/validation/pages.ts`'s `tocDataSchema`) and is
 * never used as a raw href -- it's always rendered here as
 * `href={`#${item.anchor}`}`, so there is no way for a stored value to
 * become a `javascript:`/external-URL link. */
export function TocBlock({
  data,
  onSaveData,
}: {
  data: TocData;
  onSaveData: (next: TocData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [heading, setHeading] = useState(data.heading ?? "");
  const [items, setItems] = useState(data.items);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    return (
      <Container className="py-6 sm:py-8">
        <nav aria-label={heading || "Table of contents"} className="max-w-md rounded-md border border-border bg-surface p-4">
          {heading && <h2 className="mb-2 text-sm font-medium tracking-wide text-muted uppercase">{heading}</h2>}
          <ol className="flex flex-col gap-1.5">
            {items.map((item, i) => (
              <li key={i}>
                <a href={`#${item.anchor}`} className="text-sm text-primary hover:underline">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      </Container>
    );
  }

  async function persist(next: { heading?: string; items?: TocItem[] }) {
    const previousHeading = heading;
    const previousItems = items;
    const nextHeading = next.heading ?? heading;
    const nextItems = next.items ?? items;
    setHeading(nextHeading);
    setItems(nextItems);
    setSaving(true);
    try {
      await onSaveData({ heading: nextHeading, items: nextItems });
    } catch (error) {
      setHeading(previousHeading);
      setItems(previousItems);
      showError(error instanceof Error ? error.message : "Failed to save table of contents.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(index: number, field: keyof TocItem, value: string) {
    return persist({ items: items.map((it, i) => (i === index ? { ...it, [field]: value } : it)) });
  }

  function addItem() {
    return persist({ items: [...items, { label: "New link", anchor: "section" }] });
  }

  function deleteItem(index: number) {
    return persist({ items: items.filter((_, i) => i !== index) });
  }

  function moveItem(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return Promise.resolve();
    const next = [...items];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist({ items: next });
  }

  return (
    <Container className="py-6 sm:py-8">
      <div className="max-w-md rounded-md border border-border bg-surface p-4">
        <EditableText
          as="h2"
          value={heading}
          onSave={(v) => persist({ heading: v })}
          label="table of contents heading"
          allowEmpty
          placeholder="Section heading (optional)"
          className="mb-2 block text-sm font-medium tracking-wide text-muted uppercase"
        />
        <p className="mb-3 text-xs text-muted">
          Anchor should match an <code className="font-mono">id</code> you&apos;ve placed on a target block/heading
          elsewhere on this page (no automatic heading IDs yet).
        </p>
        <div className="flex flex-col gap-2">
          {items.map((item, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <EditableText
                  as="span"
                  value={item.label}
                  onSave={(v) => updateField(i, "label", v)}
                  label={`toc item ${i + 1} label`}
                  className="block text-sm font-medium text-foreground"
                />
                <EditableText
                  as="span"
                  value={item.anchor}
                  onSave={(v) => updateField(i, "anchor", v)}
                  label={`toc item ${i + 1} anchor`}
                  className="mt-1 block font-mono text-xs text-primary"
                />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <MoveUpButton disabled={i === 0 || saving} onClick={() => moveItem(i, -1)} />
                <MoveDownButton disabled={i === items.length - 1 || saving} onClick={() => moveItem(i, 1)} />
                <DeleteButton label="Delete item" onClick={() => deleteItem(i)} disabled={saving} />
              </div>
            </div>
          ))}
          <AddButton onClick={addItem} disabled={saving} className="self-start">
            Add link
          </AddButton>
        </div>
      </div>
    </Container>
  );
}
