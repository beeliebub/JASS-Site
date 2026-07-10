"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

export type Step = { number: string; title: string; description: string };
export type StepsData = { items: Step[]; heading?: string };

const DEFAULT_HEADING = "Getting started";

/** The hardcoded `steps` array from components/home/getting-started.tsx,
 * now editable. Unlike Rule/Feature, steps have no DB row of their own --
 * the whole `items` array lives in one Block.data JSON blob, so every
 * add/remove/reorder rewrites the full array via a single PUT. */
export function StepsBlock({
  data,
  onSaveData,
}: {
  data: StepsData;
  onSaveData: (next: StepsData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [items, setItems] = useState(data.items);
  const [heading, setHeading] = useState(data.heading ?? DEFAULT_HEADING);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    return (
      <Container className="py-16 sm:py-20">
        <EditableText
          as="h2"
          value={heading}
          onSave={saveHeading}
          label="section heading"
          className="text-sm font-medium tracking-wide text-muted uppercase"
        />
        <ol className="mt-6 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {items.map((step, i) => (
            <li key={i} className="flex flex-col gap-2">
              <span className="font-mono text-sm text-primary">{step.number}</span>
              <span className="text-base font-semibold text-balance text-foreground">{step.title}</span>
              <span className="text-sm text-pretty text-muted">{step.description}</span>
            </li>
          ))}
        </ol>
      </Container>
    );
  }

  async function persist(next: Step[]) {
    const previous = items;
    setItems(next);
    setSaving(true);
    try {
      await onSaveData({ items: next, heading });
    } catch (error) {
      setItems(previous);
      showError(error instanceof Error ? error.message : "Failed to save steps.");
    } finally {
      setSaving(false);
    }
  }

  async function saveHeading(next: string) {
    const previous = heading;
    setHeading(next);
    try {
      await onSaveData({ items, heading: next });
    } catch (error) {
      setHeading(previous);
      showError(error instanceof Error ? error.message : "Failed to save heading.");
    }
  }

  function updateField(index: number, field: keyof Step, value: string) {
    return persist(items.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  function addStep() {
    const nextNumber = (items.length + 1).toString().padStart(2, "0");
    return persist([...items, { number: nextNumber, title: "New step", description: "Describe this step." }]);
  }

  function deleteStep(index: number) {
    return persist(items.filter((_, i) => i !== index));
  }

  function moveStep(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= items.length) return Promise.resolve();
    const next = [...items];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist(next);
  }

  return (
    <Container className="py-8 sm:py-10">
      <EditableText
        as="h2"
        value={heading}
        onSave={saveHeading}
        label="section heading"
        className="mb-4 block text-sm font-medium tracking-wide text-muted uppercase"
      />
      <div className="flex flex-col gap-4">
        {items.map((step, i) => (
          <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface p-4">
            <EditableText
              as="span"
              value={step.number}
              onSave={(v) => updateField(i, "number", v)}
              label={`step ${i + 1} number`}
              className="mt-1 w-12 shrink-0 font-mono text-sm text-primary"
            />
            <div className="min-w-0 flex-1">
              <EditableText
                as="span"
                value={step.title}
                onSave={(v) => updateField(i, "title", v)}
                label={`step ${i + 1} title`}
                className="block text-base font-semibold text-foreground"
              />
              <EditableText
                as="span"
                multiline
                value={step.description}
                onSave={(v) => updateField(i, "description", v)}
                label={`step ${i + 1} description`}
                className="mt-1 block text-sm text-muted"
              />
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <MoveUpButton disabled={i === 0 || saving} onClick={() => moveStep(i, -1)} />
              <MoveDownButton disabled={i === items.length - 1 || saving} onClick={() => moveStep(i, 1)} />
              <DeleteButton label="Delete step" onClick={() => deleteStep(i)} disabled={saving} />
            </div>
          </div>
        ))}
        <AddButton onClick={addStep} disabled={saving} className="self-start">
          Add step
        </AddButton>
      </div>
    </Container>
  );
}
