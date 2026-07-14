"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { defaultDataForFields, type BlockDefinitionFieldLike } from "@/lib/validation/block-definitions";
import { CustomFieldInput } from "@/components/blocks/custom-fields/field-input";
import type { CustomFieldDef, CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

type RepeaterConfig = { fields?: unknown[] };

/** Reads a repeater field's own inline item-field defs out of its `config`
 * (already a parsed object by the time it reaches this component -- see
 * BlockDefinitionWithFields's doc comment in custom-fields/types.ts) into the
 * same `CustomFieldDef` shape every top-level field uses, so rows render
 * through the exact same `CustomFieldInput` dispatcher. One level deep only
 * (matches the locked "no repeater-inside-repeater" decision, enforced
 * structurally by `nonRepeaterFieldTypeSchema` server-side) -- an item field
 * is never itself `fieldType: "repeater"`. */
function parseItemFields(config: unknown): CustomFieldDef[] {
  const obj = (config && typeof config === "object" ? config : {}) as RepeaterConfig;
  const raw = Array.isArray(obj.fields) ? obj.fields : [];
  return raw
    .map((item, index) => {
      const o = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      const key = typeof o.key === "string" ? o.key : `field-${index}`;
      return {
        id: key,
        key,
        label: typeof o.label === "string" ? o.label : key,
        fieldType: (typeof o.fieldType === "string" ? o.fieldType : "text") as CustomFieldDef["fieldType"],
        order: typeof o.order === "number" ? o.order : index,
        required: Boolean(o.required),
        helpText: typeof o.helpText === "string" ? o.helpText : null,
        config: o.config ?? {},
      };
    })
    .sort((a, b) => a.order - b.order);
}

/** A new row's starting values, one per item field -- reuses
 * `defaultDataForFields` (lib/validation/block-definitions.ts) rather than
 * duplicating its per-fieldType default knowledge. That function's signature
 * expects each field's `config` as a JSON *string* (matching a
 * `BlockFieldDefinition` DB row); an item field's own config here is already
 * a parsed object (inline in the parent's config, never a separate DB row),
 * so it's re-stringified just for this call. */
function defaultRow(itemFields: CustomFieldDef[]): Record<string, unknown> {
  const likeFields: BlockDefinitionFieldLike[] = itemFields.map((field) => ({
    key: field.key,
    fieldType: field.fieldType,
    required: field.required,
    config: JSON.stringify(field.config),
  }));
  return defaultDataForFields(likeFields);
}

/** Add/remove/reorder rows (MoveUpButton/MoveDownButton/DeleteButton/AddButton,
 * same components the Phase 3 admin field-list editor uses) plus recursive
 * per-item-field rendering. Edit mode always lays rows out as a vertical
 * list -- move-up/down controls are inherently linear -- regardless of
 * `layoutHint`; only the read-only (visitor) rendering respects
 * `layoutHint: "grid"` (the repeaterGrid template). */
export function RepeaterFieldInput({ field, value, onChange, showLabel = true, layoutHint }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const itemFields = parseItemFields(field.config);
  const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : [];

  function addRow() {
    return onChange([...rows, defaultRow(itemFields)]);
  }
  function removeRow(index: number) {
    return onChange(rows.filter((_, i) => i !== index));
  }
  function moveRow(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= rows.length) return Promise.resolve();
    const next = [...rows];
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
    return onChange(next);
  }
  function updateRowField(index: number, key: string, nextValue: unknown) {
    return onChange(rows.map((row, i) => (i === index ? { ...row, [key]: nextValue } : row)));
  }

  if (!showEditable) {
    if (rows.length === 0) return null;
    const containerClass =
      layoutHint === "grid"
        ? "grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
        : "flex flex-col gap-3";
    return (
      <div className="flex flex-col gap-3">
        {showLabel && <span className="text-xs font-medium uppercase tracking-wide text-muted">{field.label}</span>}
        <div className={containerClass}>
          {rows.map((row, index) => (
            <div key={index} className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
              {itemFields.map((itemField) => (
                <CustomFieldInput
                  key={itemField.key}
                  field={itemField}
                  value={row[itemField.key]}
                  onChange={() => Promise.resolve()}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {showLabel && <span className="text-xs font-medium uppercase tracking-wide text-muted">{field.label}</span>}
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-3 rounded-md border border-border bg-surface-2 p-3">
          <div className="flex flex-col gap-2">
            {itemFields.map((itemField) => (
              <CustomFieldInput
                key={itemField.key}
                field={itemField}
                value={row[itemField.key]}
                onChange={(next) => updateRowField(index, itemField.key, next)}
              />
            ))}
          </div>
          <div className="flex shrink-0 items-center gap-1 self-end">
            <MoveUpButton disabled={index === 0} onClick={() => moveRow(index, -1)} />
            <MoveDownButton disabled={index === rows.length - 1} onClick={() => moveRow(index, 1)} />
            <DeleteButton label="Remove row" onClick={() => removeRow(index)} />
          </div>
        </div>
      ))}
      <AddButton onClick={addRow} className="w-fit">
        Add row
      </AddButton>
    </div>
  );
}
