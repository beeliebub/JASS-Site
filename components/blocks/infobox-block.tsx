"use client";

import { useState } from "react";
import Image from "next/image";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type InfoboxRow = { label: string; value: string };
export type InfoboxData = { title: string; image?: string; rows: InfoboxRow[] };

export function InfoboxBlock({
  blockId,
  data,
  onSaveData,
}: {
  blockId: string;
  data: InfoboxData;
  onSaveData: (next: InfoboxData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [title, setTitle] = useState(data.title);
  const [image, setImage] = useState(data.image ?? "");
  const [rows, setRows] = useState(data.rows);
  const [saving, setSaving] = useState(false);
  const showEditable = isAdmin && editMode;
  const titleId = `infobox-title-${blockId}`;

  async function persist(next: InfoboxData) {
    const previous = { title, image, rows };
    setTitle(next.title);
    setImage(next.image ?? "");
    setRows(next.rows);
    setSaving(true);
    try {
      await onSaveData(next);
    } catch (error) {
      setTitle(previous.title);
      setImage(previous.image);
      setRows(previous.rows);
      showError(error instanceof Error ? error.message : "Failed to save infobox.");
    } finally {
      setSaving(false);
    }
  }

  function updateRow(index: number, patch: Partial<InfoboxRow>) {
    return persist({ title, image: image || undefined, rows: rows.map((row, i) => (i === index ? { ...row, ...patch } : row)) });
  }

  function moveRow(index: number, direction: -1 | 1) {
    const swap = index + direction;
    if (swap < 0 || swap >= rows.length) return;
    const next = [...rows];
    [next[index], next[swap]] = [next[swap], next[index]];
    return persist({ title, image: image || undefined, rows: next });
  }

  const display = (
    <aside aria-labelledby={titleId} className="w-full max-w-sm rounded-md border border-border bg-surface p-4">
      <h2 id={titleId} className="text-lg font-semibold text-foreground">{title}</h2>
      {image && <Image src={image} alt={title} width={640} height={480} unoptimized className="mt-3 aspect-[4/3] w-full rounded-md border border-border object-cover" />}
      <dl className="mt-4 divide-y divide-border">
        {rows.map((row, index) => (
          <div key={`${row.label}-${index}`} className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-3 py-2 text-sm">
            <dt className="font-medium text-muted">{row.label}</dt>
            <dd className="min-w-0 break-words text-foreground">{row.value}</dd>
          </div>
        ))}
      </dl>
    </aside>
  );

  if (!showEditable) return <Container className="py-6 sm:py-8">{display}</Container>;

  return (
    <Container className="py-6 sm:py-8">
      <div className="w-full max-w-2xl rounded-md border border-border bg-surface p-4">
        <EditableText as="h2" value={title} onSave={(value) => persist({ title: value, image: image || undefined, rows })} label="infobox title" className="block text-lg font-semibold text-foreground" />
        <EditableText
          value={image}
          onSave={(value) => persist({ title, image: value || undefined, rows })}
          label="infobox image URL"
          allowEmpty
          placeholder="Optional image URL"
          className="mt-2 block font-mono text-xs text-primary"
        />
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3">
              <div className="min-w-0 flex-1">
                <EditableText value={row.label} onSave={(value) => updateRow(index, { label: value })} label={`infobox row ${index + 1} label`} className="block text-sm font-medium text-foreground" />
                <EditableText value={row.value} onSave={(value) => updateRow(index, { value })} label={`infobox row ${index + 1} value`} multiline className="mt-1 block text-sm text-muted" />
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <MoveUpButton disabled={saving || index === 0} onClick={() => moveRow(index, -1)} />
                <MoveDownButton disabled={saving || index === rows.length - 1} onClick={() => moveRow(index, 1)} />
                <DeleteButton label="Delete infobox row" disabled={saving} onClick={() => void persist({ title, image: image || undefined, rows: rows.filter((_, i) => i !== index) })} />
              </div>
            </div>
          ))}
          <AddButton disabled={saving || rows.length >= 20} onClick={() => void persist({ title, image: image || undefined, rows: [...rows, { label: "New label", value: "New value" }] })} className="self-start">
            Add row
          </AddButton>
        </div>
      </div>
    </Container>
  );
}
