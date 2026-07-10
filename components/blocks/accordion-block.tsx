"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { TONE_STYLES, ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

export type AccordionItem = { question: string; answer: string };
export type AccordionData = { tone?: Tone; items: AccordionItem[] };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`shrink-0 transition duration-150 ${open ? "-rotate-180" : "rotate-0"}`}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Each item's open/closed state is pure client `useState`, never persisted
 * to `data`/the server (matches how SiteHeader's own visitor-facing dropdown
 * already works) -- only the question/answer content round-trips through
 * `onSaveData`. */
function AccordionRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-semibold text-foreground"
      >
        {question}
        <ChevronIcon open={open} />
      </button>
      {open && <div className="px-4 pb-3 text-sm text-pretty text-muted">{answer}</div>}
    </div>
  );
}

/** Editable Q/A list, admin-facing -- same add/delete/move-button pattern as
 * steps-block.tsx. Tinted by `TONE_STYLES` like callout/linkGrid. */
export function AccordionBlock({
  data,
  onSaveData,
}: {
  data: AccordionData;
  onSaveData: (next: AccordionData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [tone, setTone] = useState<Tone>(data.tone ?? "neutral");
  const [items, setItems] = useState(data.items);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;
  const styles = TONE_STYLES[tone] ?? TONE_STYLES.neutral;

  if (!showEditable) {
    return (
      <Container className="py-8 sm:py-10">
        <div className={`flex flex-col gap-2 rounded-lg border p-3 ${styles.container}`}>
          {items.map((item, i) => (
            <AccordionRow key={i} question={item.question} answer={item.answer} />
          ))}
        </div>
      </Container>
    );
  }

  async function persist(next: { tone?: Tone; items?: AccordionItem[] }) {
    const previousTone = tone;
    const previousItems = items;
    const nextTone = next.tone ?? tone;
    const nextItems = next.items ?? items;
    setTone(nextTone);
    setItems(nextItems);
    setSaving(true);
    try {
      await onSaveData({ tone: nextTone, items: nextItems });
    } catch (error) {
      setTone(previousTone);
      setItems(previousItems);
      showError(error instanceof Error ? error.message : "Failed to save accordion.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(index: number, field: keyof AccordionItem, value: string) {
    return persist({ items: items.map((it, i) => (i === index ? { ...it, [field]: value } : it)) });
  }

  function addItem() {
    return persist({ items: [...items, { question: "New question", answer: "Add the answer here." }] });
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
    <Container className="py-8 sm:py-10">
      <div className="mb-4 flex items-center justify-end">
        <ToneSelect value={tone} onChange={(next) => persist({ tone: next })} />
      </div>
      <div className={`flex flex-col gap-3 rounded-lg border p-3 ${styles.container}`}>
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface p-4">
            <div className="min-w-0 flex-1">
              <EditableText
                as="span"
                value={item.question}
                onSave={(v) => updateField(i, "question", v)}
                label={`accordion item ${i + 1} question`}
                className="block text-sm font-semibold text-foreground"
              />
              <EditableText
                as="span"
                multiline
                value={item.answer}
                onSave={(v) => updateField(i, "answer", v)}
                label={`accordion item ${i + 1} answer`}
                className="mt-1 block text-sm text-muted"
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
          Add question
        </AddButton>
      </div>
    </Container>
  );
}
