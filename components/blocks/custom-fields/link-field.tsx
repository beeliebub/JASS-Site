"use client";

import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

type LinkConfig = { allowNewTab?: boolean };

const BUTTON_CLASS =
  "inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]";

/** Stores just the href as a plain string (see buildFieldValueSchema's doc
 * comment in lib/validation/block-definitions.ts) -- the field's own `label`
 * is what's shown as the link/button text, same idea as CtaBannerBlock's
 * button label + href pair. `config.allowNewTab` (set once per field, in the
 * block-type builder) controls target/rel only, never the stored shape. */
export function LinkFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const href = typeof value === "string" ? value : "";
  const config = (field.config && typeof field.config === "object" ? field.config : {}) as LinkConfig;

  if (!showEditable) {
    if (!href) return null;
    if (config.allowNewTab) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer" className={BUTTON_CLASS}>
          {field.label}
        </a>
      );
    }
    if (href.startsWith("/")) {
      return (
        <Link href={href} className={BUTTON_CLASS}>
          {field.label}
        </Link>
      );
    }
    return (
      <a href={href} className={BUTTON_CLASS}>
        {field.label}
      </a>
    );
  }

  return (
    <label className="flex flex-col gap-1 text-xs text-muted">
      {showLabel && field.label}
      <EditableText
        as="span"
        value={href}
        onSave={(next) => onChange(next)}
        label={field.label}
        allowEmpty={!field.required}
        placeholder="https://example.com or /page"
        className="block font-mono text-xs text-foreground"
      />
    </label>
  );
}
