"use client";

import { useState, type ChangeEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { useToast } from "@/components/admin/toast";
import { Container } from "@/components/container";

export type ImageData = { src: string; alt: string; caption?: string };

// Mirrors the server-side cap in the POST /api/uploads/images route (PLAN.md
// Phase 14) -- checked here too so we never start a doomed upload.
const MAX_UPLOAD_BYTES = 10485760;

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

// One-shot fallback so an upload never fails validation just because alt
// text hasn't been typed yet -- not a general-purpose slugify utility.
function fallbackAltFromFilename(filename: string) {
  return filename
    .replace(/\.[^./\\]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
}

/** Admins can either paste an absolute URL to an externally-hosted image, or
 * upload a PNG/JPEG/GIF/WebP file directly (stored server-side and served
 * from the site's own origin, content-addressed by sha1 -- see
 * `app/api/uploads/images`). `src` may therefore be either an absolute
 * `http(s)` URL or a root-relative `/api/uploads/images/<sha1>.<ext>` path;
 * see next.config.ts's CSP `img-src`, which allows both. */
export function ImageBlock({
  data,
  onSaveData,
}: {
  data: ImageData;
  onSaveData: (next: ImageData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError, showSuccess } = useToast();
  const [uploading, setUploading] = useState(false);
  const showEditable = isAdmin && editMode;

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
      const alt = data.alt || fallbackAltFromFilename(file.name);
      await onSaveData({ ...data, src: uploaded.url, alt });
      showSuccess("Image uploaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Container className="py-6 sm:py-8">
      <figure className="max-w-2xl">
        {data.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for.
          <img src={data.src} alt={data.alt} className="w-full rounded-lg border border-border object-cover" loading="lazy" />
        ) : (
          <div className="flex h-48 w-full items-center justify-center rounded-lg border border-dashed border-border-strong text-sm text-muted">
            No image URL set
          </div>
        )}

        {showEditable ? (
          <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-surface p-3">
            <div className="flex flex-wrap items-center gap-3">
              <input
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                onChange={handleFileChange}
                disabled={uploading}
                aria-label="Upload image or GIF"
                className="block text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
              />
              {uploading && <span className="text-sm text-muted">Uploading…</span>}
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Image URL
              <EditableText
                as="span"
                value={data.src}
                onSave={(v) => onSaveData({ ...data, src: v })}
                label="image URL"
                placeholder="https://example.com/image.png"
                className="block font-mono text-xs text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Alt text
              <EditableText
                as="span"
                value={data.alt}
                onSave={(v) => onSaveData({ ...data, alt: v })}
                label="image alt text"
                className="block text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Caption (optional)
              <EditableText
                as="span"
                value={data.caption ?? ""}
                onSave={(v) => onSaveData({ ...data, caption: v })}
                label="image caption"
                allowEmpty
                placeholder="Caption"
                className="block text-sm text-foreground"
              />
            </label>
          </div>
        ) : (
          data.caption && <figcaption className="mt-2 text-sm text-muted">{data.caption}</figcaption>
        )}
      </figure>
    </Container>
  );
}
