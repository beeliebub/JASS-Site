"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

/** Hex color field -- the same `<input type="color">` + hex-text pairing as
 * tags-admin.tsx's tag color picker (components/admin/tags-admin.tsx). */
export function ColorFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const color = typeof value === "string" ? value : "";

  if (!showEditable) {
    if (!color) return null;
    return (
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-5 w-5 rounded-full border border-border-strong" style={{ backgroundColor: color }} />
        <span className="font-mono text-xs text-muted">{color}</span>
      </div>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {showLabel && field.label}
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={color || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          aria-label={field.label}
          className="h-9 w-14 cursor-pointer rounded-md border border-border-strong bg-surface-2"
        />
        <span className="font-mono text-xs text-muted">{color || "unset"}</span>
      </div>
    </label>
  );
}
