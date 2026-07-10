"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton } from "@/components/admin/list-controls";

export type TableData = { caption?: string; headers: string[]; rows: string[][] };

/** Semantic `<table>` for visitors, wrapped in a horizontally-scrollable
 * container for narrow screens / wide tables. Edit mode adds row/column
 * add-delete controls plus per-cell `EditableText`.
 *
 * The one invariant every mutation here must preserve (matches the schema's
 * `.refine`): `headers.length === every row's length`. Adding a column pads
 * every row with a new empty cell in the same update; deleting one trims
 * every row's matching index in the same update -- never a two-step
 * add-header-then-backfill-rows that could leave `data` briefly (or
 * permanently, if the second step fails) out of sync. */
export function TableBlock({
  data,
  onSaveData,
}: {
  data: TableData;
  onSaveData: (next: TableData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [caption, setCaption] = useState(data.caption ?? "");
  const [headers, setHeaders] = useState(data.headers);
  const [rows, setRows] = useState(data.rows);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    return (
      <Container className="py-6 sm:py-8">
        <div className="max-w-full overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            {caption && <caption className="border-b border-border bg-surface-2 px-3 py-2 text-left text-xs text-muted">{caption}</caption>}
            <thead>
              <tr className="bg-surface-2">
                {headers.map((h, i) => (
                  <th key={i} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {row.map((cell, j) => (
                    <td key={j} className="px-3 py-2 text-pretty text-muted">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    );
  }

  async function persist(next: { caption?: string; headers?: string[]; rows?: string[][] }) {
    const previousCaption = caption;
    const previousHeaders = headers;
    const previousRows = rows;
    const nextCaption = next.caption ?? caption;
    const nextHeaders = next.headers ?? headers;
    const nextRows = next.rows ?? rows;
    setCaption(nextCaption);
    setHeaders(nextHeaders);
    setRows(nextRows);
    setSaving(true);
    try {
      await onSaveData({ caption: nextCaption, headers: nextHeaders, rows: nextRows });
    } catch (error) {
      setCaption(previousCaption);
      setHeaders(previousHeaders);
      setRows(previousRows);
      showError(error instanceof Error ? error.message : "Failed to save table.");
    } finally {
      setSaving(false);
    }
  }

  function updateHeader(index: number, value: string) {
    return persist({ headers: headers.map((h, i) => (i === index ? value : h)) });
  }

  function updateCell(rowIndex: number, colIndex: number, value: string) {
    return persist({
      rows: rows.map((row, i) => (i === rowIndex ? row.map((c, j) => (j === colIndex ? value : c)) : row)),
    });
  }

  function addColumn() {
    return persist({
      headers: [...headers, `Column ${headers.length + 1}`],
      rows: rows.map((row) => [...row, ""]),
    });
  }

  function deleteColumn(colIndex: number) {
    if (headers.length <= 1) return Promise.resolve();
    return persist({
      headers: headers.filter((_, i) => i !== colIndex),
      rows: rows.map((row) => row.filter((_, j) => j !== colIndex)),
    });
  }

  function addRow() {
    return persist({ rows: [...rows, headers.map(() => "")] });
  }

  function deleteRow(rowIndex: number) {
    return persist({ rows: rows.filter((_, i) => i !== rowIndex) });
  }

  return (
    <Container className="py-6 sm:py-8">
      <EditableText
        as="p"
        value={caption}
        onSave={(v) => persist({ caption: v })}
        label="table caption"
        allowEmpty
        placeholder="Optional caption"
        className="mb-2 block text-xs text-muted"
      />
      <div className="max-w-full overflow-x-auto rounded-md border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-surface-2">
              {headers.map((h, i) => (
                <th key={i} className="border-b border-border px-3 py-2 text-left font-semibold text-foreground">
                  <div className="flex items-center gap-1.5">
                    <EditableText
                      as="span"
                      value={h}
                      onSave={(v) => updateHeader(i, v)}
                      label={`column ${i + 1} header`}
                      className="min-w-0 flex-1"
                    />
                    <DeleteButton
                      label={`Delete column ${i + 1}`}
                      onClick={() => deleteColumn(i)}
                      disabled={saving || headers.length <= 1}
                      className="h-6 w-6"
                    />
                  </div>
                </th>
              ))}
              <th className="border-b border-border px-2 py-2">
                <AddButton onClick={addColumn} disabled={saving} className="h-8 px-2">
                  Column
                </AddButton>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-border last:border-b-0">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-top">
                    <EditableText
                      as="span"
                      multiline
                      value={cell}
                      onSave={(v) => updateCell(i, j, v)}
                      label={`row ${i + 1}, column ${j + 1}`}
                      allowEmpty
                      className="block text-muted"
                    />
                  </td>
                ))}
                <td className="px-2 py-2 align-top">
                  <DeleteButton label={`Delete row ${i + 1}`} onClick={() => deleteRow(i)} disabled={saving} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <AddButton onClick={addRow} disabled={saving} className="mt-3 self-start">
        Add row
      </AddButton>
    </Container>
  );
}
