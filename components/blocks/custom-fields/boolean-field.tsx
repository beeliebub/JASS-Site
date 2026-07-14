"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

/** Toggle field -- a real checkbox, saved immediately on change (no
 * draft/commit step, unlike text-ish fields -- a checkbox's own click is
 * already the deliberate, discrete action). */
export function BooleanFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const checked = Boolean(value);

  if (!showEditable) {
    return <p className="text-foreground">{checked ? "Yes" : "No"}</p>;
  }

  return (
    <label className="flex items-center gap-1.5 text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        aria-label={field.label}
        className="accent-primary"
      />
      {showLabel ? field.label : null}
    </label>
  );
}
