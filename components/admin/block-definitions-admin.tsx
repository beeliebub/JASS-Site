"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/admin/toast";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { BLOCK_LAYOUT_TEMPLATES } from "@/lib/block-layouts";

/**
 * Admin UI for creating/editing/deleting admin-authored block *types*
 * (`BlockDefinition` + its `BlockFieldDefinition`s). Follows the same
 * lightweight, non-modal pattern as `nav-admin.tsx` (list + inline
 * expand-to-edit) rather than a modal -- the field editor's own size (and
 * the fact it can nest one level for repeater item fields) is exactly the
 * kind of form nav-admin.tsx's dropdown-item editor already handles fine
 * inline, so a modal would add plumbing without solving a real problem here.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FieldTypeValue =
  | "text"
  | "richText"
  | "number"
  | "boolean"
  | "color"
  | "image"
  | "link"
  | "select"
  | "repeater";

/** Every field type except `repeater` -- used both for the type picker shown
 * inside a repeater's own item-field editor and for parsing/building that
 * item field's config, matching `nonRepeaterFieldTypeSchema` server-side. */
const NON_REPEATER_FIELD_TYPES: FieldTypeValue[] = [
  "text",
  "richText",
  "number",
  "boolean",
  "color",
  "image",
  "link",
  "select",
];

const FIELD_TYPE_LABELS: Record<FieldTypeValue, string> = {
  text: "Text",
  richText: "Rich text",
  number: "Number",
  boolean: "Boolean (toggle)",
  color: "Color",
  image: "Image",
  link: "Link",
  select: "Select (dropdown)",
  repeater: "Repeater (repeatable rows)",
};

export type SelectOptionDraft = { value: string; label: string };

/** Local editing shape for one field's `config`. A superset of every
 * fieldType's real shape -- only the keys relevant to `fieldType` are ever
 * read/written for a given field, the rest just sit unused. Kept this loose
 * (rather than a discriminated union) so switching a field's `fieldType`
 * in the picker doesn't require reconstructing the whole draft. */
export type FieldConfigDraft = {
  min?: number | null;
  max?: number | null;
  allowNewTab?: boolean;
  options?: SelectOptionDraft[];
  fields?: FieldDraft[];
};

export type FieldDraft = {
  key: string;
  label: string;
  fieldType: FieldTypeValue;
  required: boolean;
  helpText: string;
  config: FieldConfigDraft;
};

/** Shape of one field as it arrives from the API -- `config` is still the
 * raw JSON string for a top-level field (parsed once into a `FieldDraft`
 * below), never re-stringified per nested repeater item. */
type ApiFieldRow = {
  key: string;
  label: string;
  fieldType: string;
  order: number;
  required: boolean;
  helpText: string | null;
  config: string;
};

export type BlockDefinitionApiRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  layout: string;
  fields: ApiFieldRow[];
  usageCount: number;
};

type BlockDefinitionRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  layout: string;
  fields: FieldDraft[];
  usageCount: number;
};

type DefinitionFormValues = {
  key: string;
  name: string;
  description: string;
  layout: string;
  fields: FieldDraft[];
};

// ---------------------------------------------------------------------------
// Helpers: API <-> draft conversion
// ---------------------------------------------------------------------------

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function sortByName(a: BlockDefinitionRow, b: BlockDefinitionRow) {
  return a.name.localeCompare(b.name);
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function defaultConfigForType(fieldType: FieldTypeValue): FieldConfigDraft {
  switch (fieldType) {
    case "number":
      return { min: null, max: null };
    case "link":
      return { allowNewTab: false };
    case "select":
      return { options: [{ value: "", label: "" }] };
    case "repeater":
      return { fields: [] };
    default:
      return {};
  }
}

function blankFieldDraft(): FieldDraft {
  return {
    key: "",
    label: "",
    fieldType: "text",
    required: false,
    helpText: "",
    config: defaultConfigForType("text"),
  };
}

/** Parses one nested repeater item field -- structurally identical to a
 * top-level field except its own `config` arrives already-parsed (inline
 * JSON inside the parent's config blob, never a separately stringified DB
 * column -- see `lib/validation/block-definitions.ts`'s
 * `repeaterItemFieldSchema`). */
function draftFromNestedField(raw: unknown): FieldDraft {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const fieldType = (typeof obj.fieldType === "string" ? obj.fieldType : "text") as FieldTypeValue;
  return {
    key: typeof obj.key === "string" ? obj.key : "",
    label: typeof obj.label === "string" ? obj.label : "",
    fieldType,
    required: Boolean(obj.required),
    helpText: typeof obj.helpText === "string" ? obj.helpText : "",
    config: draftConfigFromParsed(fieldType, obj.config ?? {}),
  };
}

function draftConfigFromParsed(fieldType: FieldTypeValue, raw: unknown): FieldConfigDraft {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  switch (fieldType) {
    case "number":
      return {
        min: typeof obj.min === "number" ? obj.min : null,
        max: typeof obj.max === "number" ? obj.max : null,
      };
    case "link":
      return { allowNewTab: Boolean(obj.allowNewTab) };
    case "select": {
      const options = Array.isArray(obj.options) ? obj.options : [];
      return {
        options: options.map((option) => {
          const o = (option && typeof option === "object" ? option : {}) as Record<string, unknown>;
          return {
            value: typeof o.value === "string" ? o.value : "",
            label: typeof o.label === "string" ? o.label : "",
          };
        }),
      };
    }
    case "repeater": {
      const fields = Array.isArray(obj.fields) ? obj.fields : [];
      return { fields: fields.map(draftFromNestedField) };
    }
    default:
      return {};
  }
}

function draftFromApiField(field: ApiFieldRow): FieldDraft {
  const fieldType = field.fieldType as FieldTypeValue;
  return {
    key: field.key,
    label: field.label,
    fieldType,
    required: field.required,
    helpText: field.helpText ?? "",
    config: draftConfigFromParsed(fieldType, safeJsonParse(field.config)),
  };
}

function apiRowToRow(row: BlockDefinitionApiRow): BlockDefinitionRow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    layout: row.layout,
    fields: [...row.fields].sort((a, b) => a.order - b.order).map(draftFromApiField),
    usageCount: row.usageCount,
  };
}

function configPayloadFromDraft(fieldType: FieldTypeValue, config: FieldConfigDraft): unknown {
  switch (fieldType) {
    case "number":
      return { min: config.min ?? undefined, max: config.max ?? undefined };
    case "link":
      return { allowNewTab: Boolean(config.allowNewTab) };
    case "select":
      return { options: (config.options ?? []).map((o) => ({ value: o.value, label: o.label })) };
    case "repeater":
      return { fields: (config.fields ?? []).map((field, index) => fieldPayloadFromDraft(field, index)) };
    default:
      return {};
  }
}

function fieldPayloadFromDraft(field: FieldDraft, order: number) {
  return {
    key: field.key,
    label: field.label,
    fieldType: field.fieldType,
    order,
    required: field.required,
    helpText: field.helpText.trim() ? field.helpText.trim() : null,
    config: configPayloadFromDraft(field.fieldType, field.config),
  };
}

function buildPayload(values: DefinitionFormValues, includeKey: boolean) {
  return {
    ...(includeKey ? { key: values.key.trim() } : {}),
    name: values.name.trim(),
    description: values.description.trim() ? values.description.trim() : null,
    layout: values.layout,
    fields: values.fields.map((field, index) => fieldPayloadFromDraft(field, index)),
  };
}

// ---------------------------------------------------------------------------
// Field list / row editors (recursive: a repeater field renders this same
// list editor again for its own item fields, one level deep)
// ---------------------------------------------------------------------------

function SelectOptionsEditor({
  options,
  onChange,
}: {
  options: SelectOptionDraft[];
  onChange: (options: SelectOptionDraft[]) => void;
}) {
  function updateAt(index: number, patch: Partial<SelectOptionDraft>) {
    onChange(options.map((option, i) => (i === index ? { ...option, ...patch } : option)));
  }
  function removeAt(index: number) {
    onChange(options.filter((_, i) => i !== index));
  }
  function add() {
    onChange([...options, { value: "", label: "" }]);
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-muted">Options</span>
      {options.map((option, index) => (
        <div key={index} className="flex items-center gap-2">
          <input
            value={option.value}
            onChange={(e) => updateAt(index, { value: e.target.value })}
            placeholder="value"
            className="h-8 w-32 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary"
          />
          <input
            value={option.label}
            onChange={(e) => updateAt(index, { label: e.target.value })}
            placeholder="label"
            className="h-8 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground outline-none focus-visible:border-primary"
          />
          <DeleteButton label="Remove option" onClick={() => removeAt(index)} disabled={options.length <= 1} />
        </div>
      ))}
      <AddButton onClick={add} className="w-fit">
        Add option
      </AddButton>
    </div>
  );
}

function FieldConfigEditor({
  field,
  onChange,
}: {
  field: FieldDraft;
  onChange: (config: FieldConfigDraft) => void;
}) {
  switch (field.fieldType) {
    case "number":
      return (
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
            Min (optional)
            <input
              type="number"
              value={field.config.min ?? ""}
              onChange={(e) => onChange({ ...field.config, min: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 w-24 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
            Max (optional)
            <input
              type="number"
              value={field.config.max ?? ""}
              onChange={(e) => onChange({ ...field.config, max: e.target.value === "" ? null : Number(e.target.value) })}
              className="h-8 w-24 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
        </div>
      );
    case "link":
      return (
        <label className="flex items-center gap-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={Boolean(field.config.allowNewTab)}
            onChange={(e) => onChange({ ...field.config, allowNewTab: e.target.checked })}
            className="accent-primary"
          />
          Allow opening in a new tab
        </label>
      );
    case "select":
      return (
        <SelectOptionsEditor
          options={field.config.options ?? []}
          onChange={(options) => onChange({ ...field.config, options })}
        />
      );
    case "repeater":
      return (
        <div className="flex flex-col gap-2 rounded-md border border-border-strong border-dashed p-3">
          <span className="text-xs font-medium uppercase tracking-wide text-muted">Row fields</span>
          <FieldListEditor
            fields={field.config.fields ?? []}
            onChange={(fields) => onChange({ ...field.config, fields })}
            allowRepeater={false}
          />
        </div>
      );
    default:
      return null;
  }
}

function FieldRowEditor({
  field,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  allowRepeater,
}: {
  field: FieldDraft;
  onChange: (next: FieldDraft) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  allowRepeater: boolean;
}) {
  const typeOptions = allowRepeater
    ? ([...NON_REPEATER_FIELD_TYPES, "repeater"] as FieldTypeValue[])
    : NON_REPEATER_FIELD_TYPES;

  function setFieldType(next: FieldTypeValue) {
    onChange({ ...field, fieldType: next, config: defaultConfigForType(next) });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
          Label
          <input
            required
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
            className="h-8 w-40 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
          Key
          <input
            required
            value={field.key}
            onChange={(e) => onChange({ ...field, key: e.target.value })}
            placeholder="e.g. heading"
            className="h-8 w-36 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
          Type
          <select
            value={field.fieldType}
            onChange={(e) => setFieldType(e.target.value as FieldTypeValue)}
            className="h-8 w-44 rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-primary"
          >
            {typeOptions.map((value) => (
              <option key={value} value={value}>
                {FIELD_TYPE_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 pb-1.5 text-sm text-foreground">
          <input
            type="checkbox"
            checked={field.required}
            onChange={(e) => onChange({ ...field, required: e.target.checked })}
            className="accent-primary"
          />
          Required
        </label>
        <div className="ml-auto flex shrink-0 items-center gap-1 pb-0.5">
          <MoveUpButton disabled={!canMoveUp} onClick={onMoveUp} />
          <MoveDownButton disabled={!canMoveDown} onClick={onMoveDown} />
          <DeleteButton label="Remove field" onClick={onRemove} />
        </div>
      </div>

      <label className="flex flex-col gap-1 text-xs font-medium uppercase tracking-wide text-muted">
        Help text (optional)
        <input
          value={field.helpText}
          onChange={(e) => onChange({ ...field, helpText: e.target.value })}
          className="h-8 w-full rounded-md border border-border-strong bg-surface px-2 text-sm text-foreground outline-none focus-visible:border-primary"
        />
      </label>

      <FieldConfigEditor field={field} onChange={(config) => onChange({ ...field, config })} />
    </div>
  );
}

function FieldListEditor({
  fields,
  onChange,
  allowRepeater,
}: {
  fields: FieldDraft[];
  onChange: (fields: FieldDraft[]) => void;
  allowRepeater: boolean;
}) {
  function updateAt(index: number, next: FieldDraft) {
    onChange(fields.map((field, i) => (i === index ? next : field)));
  }
  function removeAt(index: number) {
    onChange(fields.filter((_, i) => i !== index));
  }
  function move(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= fields.length) return;
    const next = [...fields];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    onChange(next);
  }
  function add() {
    onChange([...fields, blankFieldDraft()]);
  }

  return (
    <div className="flex flex-col gap-2">
      {fields.length === 0 && <p className="text-sm text-muted">No fields yet.</p>}
      {fields.map((field, index) => (
        <FieldRowEditor
          key={index}
          field={field}
          onChange={(next) => updateAt(index, next)}
          onRemove={() => removeAt(index)}
          onMoveUp={() => move(index, -1)}
          onMoveDown={() => move(index, 1)}
          canMoveUp={index > 0}
          canMoveDown={index < fields.length - 1}
          allowRepeater={allowRepeater}
        />
      ))}
      <AddButton onClick={add} className="w-fit">
        Add field
      </AddButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Definition form (create + edit)
// ---------------------------------------------------------------------------

function DefinitionForm({
  initial,
  keyEditable,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial: DefinitionFormValues;
  keyEditable: boolean;
  submitLabel: string;
  onSubmit: (values: DefinitionFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const [values, setValues] = useState(initial);
  const [keyTouched, setKeyTouched] = useState(!keyEditable);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setName(name: string) {
    setValues((prev) => ({
      ...prev,
      name,
      key: keyEditable && !keyTouched ? slugify(name) : prev.key,
    }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-md border border-dashed border-primary/60 bg-surface p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Name
          <input
            required
            value={values.name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-foreground outline-none focus-visible:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Key {keyEditable ? "(kebab-case, can't be changed after creating)" : "(immutable)"}
          <input
            required
            disabled={!keyEditable}
            value={values.key}
            onChange={(e) => {
              setKeyTouched(true);
              setValues((prev) => ({ ...prev, key: e.target.value }));
            }}
            placeholder="e.g. testimonial-card"
            className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 font-mono text-sm text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
        Description (optional)
        <textarea
          value={values.description}
          onChange={(e) => setValues((prev) => ({ ...prev, description: e.target.value }))}
          rows={2}
          className="rounded-md border border-border-strong bg-surface-2 px-2.5 py-1.5 text-sm text-foreground outline-none focus-visible:border-primary"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Layout</span>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {BLOCK_LAYOUT_TEMPLATES.map((template) => (
            <label
              key={template.id}
              className={`flex cursor-pointer flex-col gap-1 rounded-md border p-2.5 text-sm transition ${
                values.layout === template.id ? "border-primary bg-primary/10" : "border-border-strong bg-surface-2"
              }`}
            >
              <span className="flex items-center gap-2 font-medium text-foreground">
                <input
                  type="radio"
                  name="layout"
                  checked={values.layout === template.id}
                  onChange={() => setValues((prev) => ({ ...prev, layout: template.id }))}
                  className="accent-primary"
                />
                {template.label}
              </span>
              <span className="text-xs text-muted">{template.description}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Fields</span>
        <FieldListEditor
          fields={values.fields}
          onChange={(fields) => setValues((prev) => ({ ...prev, fields }))}
          allowRepeater
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex h-9 items-center justify-center rounded-md border border-border-strong px-3.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main admin section
// ---------------------------------------------------------------------------

const LAYOUT_LABEL_BY_ID = Object.fromEntries(BLOCK_LAYOUT_TEMPLATES.map((t) => [t.id, t.label]));

export function BlockDefinitionsAdmin({ initialDefinitions }: { initialDefinitions: BlockDefinitionApiRow[] }) {
  const { showError, showSuccess } = useToast();
  const [definitions, setDefinitions] = useState(() => initialDefinitions.map(apiRowToRow).sort(sortByName));
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function createDefinition(values: DefinitionFormValues) {
    const res = await fetch("/api/block-definitions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(values, true)),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to create block type."));
    const { data } = (await res.json()) as { data: BlockDefinitionApiRow };
    setDefinitions((prev) => [...prev, apiRowToRow({ ...data, usageCount: 0 })].sort(sortByName));
    setCreating(false);
    showSuccess(`Created "${data.name}".`);
  }

  async function updateDefinition(id: string, values: DefinitionFormValues) {
    const res = await fetch(`/api/block-definitions/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildPayload(values, false)),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save block type."));
    const { data } = (await res.json()) as { data: BlockDefinitionApiRow };
    setDefinitions((prev) => {
      const existing = prev.find((d) => d.id === id);
      return prev
        .map((d) => (d.id === id ? apiRowToRow({ ...data, usageCount: existing?.usageCount ?? 0 }) : d))
        .sort(sortByName);
    });
    setEditingId(null);
    showSuccess(`Saved "${data.name}".`);
  }

  async function deleteDefinition(definition: BlockDefinitionRow) {
    if (
      typeof window !== "undefined" &&
      !window.confirm(`Delete the "${definition.name}" block type? This can't be undone.`)
    ) {
      return;
    }
    setPendingDeleteId(definition.id);
    try {
      const res = await fetch(`/api/block-definitions/${definition.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete block type."));
      showSuccess(`Deleted "${definition.name}".`);
      setDefinitions((prev) => prev.filter((d) => d.id !== definition.id));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete block type.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {definitions.length === 0 && <p className="text-sm text-muted">No custom block types yet.</p>}
        {definitions.map((definition) => {
          const isEditing = editingId === definition.id;
          const disabledForUsage = definition.usageCount > 0;
          return (
            <div key={definition.id} className="overflow-hidden rounded-md border border-border bg-surface">
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{definition.name}</p>
                  <p className="truncate font-mono text-xs text-muted">
                    {definition.key} · {definition.fields.length} field{definition.fields.length === 1 ? "" : "s"} ·{" "}
                    {LAYOUT_LABEL_BY_ID[definition.layout] ?? definition.layout}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted">
                    {definition.usageCount} block{definition.usageCount === 1 ? "" : "s"} using this
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingId(isEditing ? null : definition.id)}
                    className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                  >
                    {isEditing ? "Close" : "Edit"}
                  </button>
                  <DeleteButton
                    label="Delete block type"
                    title={
                      disabledForUsage
                        ? `Used by ${definition.usageCount} block${definition.usageCount === 1 ? "" : "s"} — remove them first.`
                        : "Delete block type"
                    }
                    onClick={() => deleteDefinition(definition)}
                    disabled={disabledForUsage || pendingDeleteId === definition.id}
                  />
                </div>
              </div>

              {isEditing && (
                <div className="border-t border-border p-4">
                  <DefinitionForm
                    initial={{
                      key: definition.key,
                      name: definition.name,
                      description: definition.description ?? "",
                      layout: definition.layout,
                      fields: definition.fields,
                    }}
                    keyEditable={false}
                    submitLabel="Save changes"
                    onSubmit={(values) => updateDefinition(definition.id, values)}
                    onCancel={() => setEditingId(null)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {creating ? (
        <DefinitionForm
          initial={{ key: "", name: "", description: "", layout: BLOCK_LAYOUT_TEMPLATES[0].id, fields: [] }}
          keyEditable
          submitLabel="Create block type"
          onSubmit={createDefinition}
          onCancel={() => setCreating(false)}
        />
      ) : (
        <AddButton onClick={() => setCreating(true)} className="w-fit">
          New block type
        </AddButton>
      )}
    </div>
  );
}
