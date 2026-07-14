"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

type SelectOption = { value: string; label: string };
type SelectConfig = { options?: SelectOption[] };

/** Dropdown over the field's own configured options (set once per field, in
 * the block-type builder) -- read-only rendering shows the matching option's
 * label, not its raw stored value. */
export function SelectFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const config = (field.config && typeof field.config === "object" ? field.config : {}) as SelectConfig;
  const options = config.options ?? [];
  const current = typeof value === "string" ? value : "";
  const currentLabel = options.find((option) => option.value === current)?.label ?? current;

  if (!showEditable) {
    return currentLabel ? <p className="text-foreground">{currentLabel}</p> : null;
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {showLabel && field.label}
      <select
        value={current}
        onChange={(e) => onChange(e.target.value)}
        aria-label={field.label}
        className="h-9 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
      >
        {!field.required && <option value="">--</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
