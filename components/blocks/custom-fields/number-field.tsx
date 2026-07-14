"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

type NumberConfig = { min?: number; max?: number };

/** Numeric field -- `null` means unset (not 0, which is a valid real value).
 * Commits on blur/Enter via a draft string, same pattern as ImageBlock's
 * scale/width/height inputs (components/blocks/image-block.tsx). `min`/`max`
 * come from the field's own `config`, applied as the HTML input's own
 * `min`/`max` attributes. */
export function NumberFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const numberValue = typeof value === "number" ? value : null;
  const config = (field.config && typeof field.config === "object" ? field.config : {}) as NumberConfig;
  const [draft, setDraft] = useState(numberValue != null ? String(numberValue) : "");

  if (!showEditable) {
    return numberValue != null ? <p className="text-foreground">{numberValue}</p> : null;
  }

  function commit() {
    const raw = draft.trim();
    if (raw === "") {
      onChange(null);
      return;
    }
    const parsed = Number(raw);
    if (Number.isNaN(parsed)) {
      setDraft(numberValue != null ? String(numberValue) : "");
      return;
    }
    // Errors here are already handled one level up (custom-block-renderer.tsx's
    // onFieldChange calls the block's real onSaveData, whose caller in
    // page-blocks.tsx rolls back + toasts on failure) -- same
    // "fire the save, don't duplicate the rollback here" stance as
    // ImageBlock's saveSizing.
    onChange(parsed);
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {showLabel && field.label}
      <input
        type="number"
        min={config.min}
        max={config.max}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
        }}
        aria-label={field.label}
        className="h-9 w-32 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
      />
    </label>
  );
}
