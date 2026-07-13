"use client";

import { useState } from "react";
import type { Feature } from "@/app/generated/prisma/client";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { FeatureCard, featureCardToneClass } from "@/components/features/feature-card";
import { iconRegistry, resolveFeatureIcon } from "@/components/features/icon-registry";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

const ICON_KEYS = Object.keys(iconRegistry);

/** `heading`/`tone` are the block-level fields absorbed from the former Card
 * Grid block type -- `null` (not just `undefined`) is a valid "unset" value
 * here since the data migration that merged pre-existing Card Grid instances
 * into Feature Grid blocks writes explicit JSON `null`s for fields it has no
 * value for. Everything else (the actual cards) stays owned `Feature` rows,
 * unaffected by this pair. */
export type FeatureGridData = { heading?: string | null; tone?: Tone | null };

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

export function FeaturesEditor({
  initialFeatures,
  blockId,
  data,
  onSaveData,
}: {
  initialFeatures: Feature[];
  blockId: string;
  data: FeatureGridData;
  onSaveData: (next: FeatureGridData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [features, setFeatures] = useState(initialFeatures);
  const [adding, setAdding] = useState(false);

  const heading = data.heading ?? "";
  const tone: Tone = data.tone ?? "neutral";

  if (!isAdmin || !editMode) {
    return (
      <>
        {heading && <h2 className="mb-6 text-sm font-medium tracking-wide text-muted uppercase">{heading}</h2>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
          {features.map((feature) => {
            const Icon = resolveFeatureIcon(feature.icon);
            return (
              <FeatureCard
                key={feature.id}
                eyebrow={feature.eyebrow}
                title={feature.title}
                description={feature.description}
                icon={<Icon />}
                accent={feature.accent}
                tone={tone}
              />
            );
          })}
        </div>
      </>
    );
  }

  async function persistBlockData(next: Partial<FeatureGridData>) {
    // page-blocks.tsx's saveBlockData already handles the optimistic block
    // update, rollback, and error toast on failure -- same convention
    // PostsEditor's own `limit` field uses for this same `data`/`onSaveData`
    // pair, so no local heading/tone state or try/catch is needed here.
    await onSaveData({ heading, tone, ...next });
  }

  async function saveField(id: string, field: "eyebrow" | "title" | "description", value: string) {
    const res = await fetch(`/api/features/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save feature."));
    // EditableText shows `value` optimistically via its own local state, but
    // that disappears the moment this feature re-renders through the
    // visitor branch (e.g. toggling Edit mode off mid-session), which reads
    // feature[field] straight off *this* array -- so the saved edit needs to
    // land here too, matching how setIcon/toggleAccent already do below.
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, [field]: value } : f)));
  }

  async function setIcon(id: string, icon: string) {
    const previous = features;
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, icon } : f)));
    try {
      const res = await fetch(`/api/features/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ icon }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to save icon."));
    } catch (error) {
      setFeatures(previous);
      showError(error instanceof Error ? error.message : "Failed to save icon.");
    }
  }

  async function toggleAccent(id: string) {
    const target = features.find((f) => f.id === id);
    if (!target) return;
    const previous = features;
    const nextAccent = !target.accent;
    setFeatures((prev) => prev.map((f) => (f.id === id ? { ...f, accent: nextAccent } : f)));
    try {
      const res = await fetch(`/api/features/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: nextAccent }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to save feature."));
    } catch (error) {
      setFeatures(previous);
      showError(error instanceof Error ? error.message : "Failed to save feature.");
    }
  }

  async function addFeature() {
    setAdding(true);
    const nextOrder = features.length ? Math.max(...features.map((f) => f.order)) + 1 : 0;
    try {
      const res = await fetch("/api/features", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blockId,
          order: nextOrder,
          eyebrow: "Feature",
          title: "New feature",
          description: "Describe this feature.",
          icon: "help",
          accent: false,
        }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to add feature."));
      const { data } = (await res.json()) as { data: Feature };
      setFeatures((prev) => [...prev, data]);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to add feature.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteFeature(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this feature?")) return;
    const previous = features;
    setFeatures((prev) => prev.filter((f) => f.id !== id));
    try {
      const res = await fetch(`/api/features/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete feature."));
    } catch (error) {
      setFeatures(previous);
      showError(error instanceof Error ? error.message : "Failed to delete feature.");
    }
  }

  async function moveFeature(id: string, direction: -1 | 1) {
    const idx = features.findIndex((f) => f.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= features.length) return;

    const a = features[idx];
    const b = features[swapIdx];
    const previous = features;

    const next = [...features];
    next[idx] = { ...b, order: a.order };
    next[swapIdx] = { ...a, order: b.order };
    next.sort((x, y) => x.order - y.order);
    setFeatures(next);

    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/features/${a.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: b.order }),
        }),
        fetch(`/api/features/${b.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: a.order }),
        }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder features.");
    } catch (error) {
      setFeatures(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder features.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <EditableText
          as="h2"
          value={heading}
          onSave={(v) => persistBlockData({ heading: v })}
          label="feature grid heading"
          allowEmpty
          placeholder="Section heading (optional)"
          className="text-sm font-medium tracking-wide text-muted uppercase"
        />
        <ToneSelect value={tone} onChange={(next) => persistBlockData({ tone: next })} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-5 lg:grid-cols-3 lg:gap-6">
        {features.map((feature, i) => {
          const Icon = resolveFeatureIcon(feature.icon);
          return (
            <div
              key={feature.id}
              className={`flex h-full flex-col gap-4 rounded-lg border p-6 ${featureCardToneClass(tone)}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                    feature.accent ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                  }`}
                >
                  <Icon />
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <MoveUpButton disabled={i === 0} onClick={() => moveFeature(feature.id, -1)} />
                  <MoveDownButton disabled={i === features.length - 1} onClick={() => moveFeature(feature.id, 1)} />
                  <DeleteButton label="Delete feature" onClick={() => deleteFeature(feature.id)} />
                </div>
              </div>

              <div className="flex flex-1 flex-col gap-1.5">
                <EditableText
                  as="span"
                  value={feature.eyebrow}
                  onSave={(v) => saveField(feature.id, "eyebrow", v)}
                  label={`feature ${i + 1} eyebrow`}
                  allowEmpty
                  placeholder="Eyebrow (optional)"
                  className="block font-mono text-xs font-medium uppercase tracking-wider text-muted"
                />
                <EditableText
                  as="h2"
                  value={feature.title}
                  onSave={(v) => saveField(feature.id, "title", v)}
                  label={`feature ${i + 1} title`}
                  className="block text-base font-semibold text-foreground"
                />
                <EditableText
                  as="p"
                  multiline
                  value={feature.description}
                  onSave={(v) => saveField(feature.id, "description", v)}
                  label={`feature ${i + 1} description`}
                  className="block text-sm leading-relaxed text-muted"
                />
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3 text-xs">
                <label className="flex items-center gap-1.5 text-muted">
                  Icon
                  <select
                    value={feature.icon}
                    onChange={(e) => setIcon(feature.id, e.target.value)}
                    className="h-7 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
                  >
                    {ICON_KEYS.map((key) => (
                      <option key={key} value={key}>
                        {key}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 text-muted">
                  <input
                    type="checkbox"
                    checked={feature.accent}
                    onChange={() => toggleAccent(feature.id)}
                    className="h-3.5 w-3.5 accent-primary"
                  />
                  Accent color
                </label>
              </div>
            </div>
          );
        })}
      </div>

      <AddButton onClick={addFeature} disabled={adding} className="w-full sm:w-auto">
        Add feature
      </AddButton>
    </div>
  );
}
