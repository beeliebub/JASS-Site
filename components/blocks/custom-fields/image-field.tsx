"use client";

import { useState, type ChangeEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { useToast } from "@/components/admin/toast";
import { formatBytes } from "@/lib/format";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

// Mirrors the server-side cap in POST /api/uploads/images -- checked here
// too so we never start a doomed upload. Kept in sync with the identical
// constant in image-block.tsx/link-grid-block.tsx (same upload pipeline).
const MAX_UPLOAD_BYTES = 10485760;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/** Mirrors ImageBlock's own inline upload input + URL text field
 * (components/blocks/image-block.tsx) -- there's no separately-extracted
 * reusable image-picker component to reuse instead. Stores just the image
 * URL (no alt/caption/sizing -- those are per-instance concerns specific to
 * the built-in Image block, not part of this field type's stored shape, see
 * buildFieldValueSchema in lib/validation/block-definitions.ts). */
export function ImageFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const { showError, showSuccess } = useToast();
  const [uploading, setUploading] = useState(false);
  const showEditable = isAdmin && editMode;
  const src = typeof value === "string" ? value : "";

  if (!showEditable) {
    if (!src) return null;
    return (
      // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied URLs, not a known set of domains next/image can be configured for.
      <img src={src} alt="" className="w-full rounded-lg border border-border object-cover" loading="lazy" />
    );
  }

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      showError("Only PNG, JPEG, GIF, or WebP images are supported.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showError(`"${file.name}" is ${formatBytes(file.size)} -- the max is 10 MB.`);
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/uploads/images", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to upload image."));
      const { data: uploaded } = (await res.json()) as { data: { url: string } };
      await onChange(uploaded.url);
      showSuccess("Image uploaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {showLabel && <span className="text-xs font-medium uppercase tracking-wide text-muted">{field.label}</span>}
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- arbitrary admin-supplied URLs, not a known set of domains next/image can be configured for.
        <img src={src} alt="" className="w-full rounded-lg border border-border object-cover" loading="lazy" />
      ) : (
        <div className="flex h-32 w-full items-center justify-center rounded-lg border border-dashed border-border-strong text-sm text-muted">
          No image set
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          onChange={handleFileChange}
          disabled={uploading}
          aria-label={`Upload ${field.label}`}
          className="block text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        />
        {uploading && <span className="text-sm text-muted">Uploading…</span>}
      </div>
      <EditableText
        as="span"
        value={src}
        onSave={(next) => onChange(next)}
        label={`${field.label} URL`}
        allowEmpty
        placeholder="https://example.com/image.png"
        className="block font-mono text-xs text-foreground"
      />
    </div>
  );
}
