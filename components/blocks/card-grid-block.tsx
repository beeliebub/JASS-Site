"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect, TONE_STYLES } from "@/components/blocks/tones";
import { iconRegistry, resolveFeatureIcon } from "@/components/features/icon-registry";
import type { Tone } from "@/lib/themes";

const ICON_KEYS = Object.keys(iconRegistry);

export type CardGridCard = { icon?: string; title: string; description: string };
export type CardGridData = { heading?: string; tone?: Tone; cards: CardGridCard[] };

/** New, independent block type -- NOT the singleton `featureGrid`
 * block, which stays exactly as-is. Stores its own `cards` per instance, so
 * this can be dropped on any page multiple times with distinct content, unlike
 * `featureGrid`'s site-wide `Feature` table. Visual styling borrows from
 * `components/features/feature-card.tsx`, tinted by `TONE_STYLES` like
 * callout/linkGrid. */
export function CardGridBlock({
  data,
  onSaveData,
}: {
  data: CardGridData;
  onSaveData: (next: CardGridData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [heading, setHeading] = useState(data.heading ?? "");
  const [tone, setTone] = useState<Tone>(data.tone ?? "neutral");
  const [cards, setCards] = useState(data.cards);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;
  const styles = TONE_STYLES[tone] ?? TONE_STYLES.neutral;

  if (!showEditable) {
    return (
      <Container className="py-8 sm:py-10">
        {heading && (
          <h2 className="mb-6 text-sm font-medium tracking-wide text-muted uppercase">{heading}</h2>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {cards.map((card, i) => {
            const Icon = resolveFeatureIcon(card.icon ?? "help");
            return (
              <div
                key={i}
                className={`flex h-full flex-col gap-4 rounded-lg border p-6 transition motion-safe:hover:-translate-y-0.5 ${styles.container}`}
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface ${styles.title}`}>
                  <Icon />
                </div>
                <div className="flex flex-1 flex-col gap-1.5">
                  <h3 className="text-base font-semibold text-balance text-foreground">{card.title}</h3>
                  <p className="text-sm leading-relaxed text-pretty text-muted">{card.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Container>
    );
  }

  async function persist(next: { heading?: string; tone?: Tone; cards?: CardGridCard[] }) {
    const previousHeading = heading;
    const previousTone = tone;
    const previousCards = cards;
    const nextHeading = next.heading ?? heading;
    const nextTone = next.tone ?? tone;
    const nextCards = next.cards ?? cards;
    setHeading(nextHeading);
    setTone(nextTone);
    setCards(nextCards);
    setSaving(true);
    try {
      await onSaveData({ heading: nextHeading, tone: nextTone, cards: nextCards });
    } catch (error) {
      setHeading(previousHeading);
      setTone(previousTone);
      setCards(previousCards);
      showError(error instanceof Error ? error.message : "Failed to save card grid.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(index: number, field: "title" | "description", value: string) {
    return persist({ cards: cards.map((c, i) => (i === index ? { ...c, [field]: value } : c)) });
  }

  function updateIcon(index: number, icon: string) {
    return persist({ cards: cards.map((c, i) => (i === index ? { ...c, icon } : c)) });
  }

  function addCard() {
    return persist({ cards: [...cards, { icon: "help", title: "New card", description: "Describe this card." }] });
  }

  function deleteCard(index: number) {
    return persist({ cards: cards.filter((_, i) => i !== index) });
  }

  function moveCard(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= cards.length) return Promise.resolve();
    const next = [...cards];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist({ cards: next });
  }

  return (
    <Container className="py-8 sm:py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <EditableText
          as="h2"
          value={heading}
          onSave={(v) => persist({ heading: v })}
          label="card grid heading"
          allowEmpty
          placeholder="Section heading (optional)"
          className="text-sm font-medium tracking-wide text-muted uppercase"
        />
        <ToneSelect value={tone} onChange={(next) => persist({ tone: next })} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {cards.map((card, i) => {
          const Icon = resolveFeatureIcon(card.icon ?? "help");
          return (
            <div
              key={i}
              className={`flex h-full flex-col gap-4 rounded-lg border p-6 ${styles.container}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-surface ${styles.title}`}>
                  <Icon />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <MoveUpButton disabled={i === 0 || saving} onClick={() => moveCard(i, -1)} />
                  <MoveDownButton disabled={i === cards.length - 1 || saving} onClick={() => moveCard(i, 1)} />
                  <DeleteButton label="Delete card" onClick={() => deleteCard(i)} disabled={saving} />
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-1.5">
                <EditableText
                  as="h3"
                  value={card.title}
                  onSave={(v) => updateField(i, "title", v)}
                  label={`card ${i + 1} title`}
                  className="block text-base font-semibold text-foreground"
                />
                <EditableText
                  as="p"
                  multiline
                  value={card.description}
                  onSave={(v) => updateField(i, "description", v)}
                  label={`card ${i + 1} description`}
                  className="block text-sm leading-relaxed text-muted"
                />
              </div>
              <label className="flex items-center gap-1.5 border-t border-border pt-3 text-xs text-muted">
                Icon
                <select
                  value={card.icon ?? "help"}
                  onChange={(e) => updateIcon(i, e.target.value)}
                  className="h-7 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                >
                  {ICON_KEYS.map((key) => (
                    <option key={key} value={key}>
                      {key}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          );
        })}
      </div>
      <AddButton onClick={addCard} disabled={saving} className="mt-4 self-start">
        Add card
      </AddButton>
    </Container>
  );
}
