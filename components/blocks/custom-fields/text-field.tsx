"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

/** Plain single-line text field -- same EditableText click-to-edit affordance
 * every other block's plain string fields already use (e.g. CtaBannerBlock's
 * button label). Visitor/read-only rendering is a plain paragraph, nothing
 * shown at all when unset. */
export function TextFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const text = typeof value === "string" ? value : "";

  if (!showEditable) {
    return text ? <p className="text-foreground">{text}</p> : null;
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {showLabel && field.label}
      <EditableText
        as="span"
        value={text}
        onSave={(next) => onChange(next)}
        label={field.label}
        allowEmpty={!field.required}
        placeholder={field.helpText ?? undefined}
        className="block text-sm text-foreground"
      />
    </label>
  );
}
