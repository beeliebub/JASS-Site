"use client";

import { useState, type ChangeEvent, type CSSProperties, type KeyboardEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { useToast } from "@/components/admin/toast";
import { Container } from "@/components/container";

/** `sizeMode`/`scale`/`width`/`height` are Phase 19's display-size override --
 * see `imageSizeSchema` in lib/validation/pages.ts for the exact bounds
 * mirrored here. All optional/nullable; unset = today's exact pre-Phase-19
 * behavior (full-width, object-cover, natural aspect ratio, max-w-2xl
 * figure). */
export type ImageData = {
  src: string;
  alt: string;
  caption?: string;
  sizeMode?: "scale" | "custom" | null;
  scale?: number | null;
  width?: number | null;
  height?: number | null;
};

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

// Mirrors imageSizeSchema's bounds in lib/validation/pages.ts -- clamped here
// too so the UI never sends a value the server would reject.
const SCALE_MIN = 10;
const SCALE_MAX = 100;
const DIMENSION_MIN = 1;
const DIMENSION_MAX = 2000;

/** Builds the `<img>`'s inline style from validated numeric fields only --
 * never a passthrough string, so this can't become a CSS-injection surface.
 * `sizeMode === "scale"` renders a responsive percentage of the figure's
 * width; `sizeMode === "custom"` renders an exact pixel box, with either
 * dimension alone falling back to "auto" to preserve aspect ratio. */
function buildImageStyle(data: ImageData): CSSProperties {
  if (data.sizeMode === "scale" && typeof data.scale === "number" && Number.isFinite(data.scale)) {
    return { width: `${data.scale}%`, height: "auto" };
  }
  if (data.sizeMode === "custom") {
    const hasWidth = typeof data.width === "number" && Number.isFinite(data.width);
    const hasHeight = typeof data.height === "number" && Number.isFinite(data.height);
    const style: CSSProperties = {};
    if (hasWidth) style.width = `${data.width}px`;
    if (hasHeight) style.height = `${data.height}px`;
    if (hasWidth && !hasHeight) style.height = "auto";
    if (hasHeight && !hasWidth) style.width = "auto";
    return style;
  }
  return {};
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

  // Draft strings for the number inputs -- committed on blur (not per
  // keystroke) per the Post List "Limit" convention (PLAN.md Phase 18;
  // components/news/posts-editor.tsx's commitLimitDraft).
  const [scaleDraft, setScaleDraft] = useState(data.scale != null ? String(data.scale) : "");
  const [widthDraft, setWidthDraft] = useState(data.width != null ? String(data.width) : "");
  const [heightDraft, setHeightDraft] = useState(data.height != null ? String(data.height) : "");

  async function saveSizing(patch: Partial<ImageData>) {
    try {
      await onSaveData({ ...data, ...patch });
    } catch {
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  function changeSizeMode(nextMode: "" | "scale" | "custom") {
    saveSizing({ sizeMode: nextMode === "" ? null : nextMode });
  }

  function commitScaleDraft() {
    const raw = scaleDraft.trim();
    if (raw === "") {
      saveSizing({ scale: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setScaleDraft(data.scale != null ? String(data.scale) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, SCALE_MIN), SCALE_MAX);
    setScaleDraft(String(clamped));
    saveSizing({ scale: clamped });
  }

  function commitWidthDraft() {
    const raw = widthDraft.trim();
    if (raw === "") {
      saveSizing({ width: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setWidthDraft(data.width != null ? String(data.width) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, DIMENSION_MIN), DIMENSION_MAX);
    setWidthDraft(String(clamped));
    saveSizing({ width: clamped });
  }

  function commitHeightDraft() {
    const raw = heightDraft.trim();
    if (raw === "") {
      saveSizing({ height: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setHeightDraft(data.height != null ? String(data.height) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, DIMENSION_MIN), DIMENSION_MAX);
    setHeightDraft(String(clamped));
    saveSizing({ height: clamped });
  }

  function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
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
      const alt = data.alt || fallbackAltFromFilename(file.name);
      await onSaveData({ ...data, src: uploaded.url, alt });
      showSuccess("Image uploaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  // Unset sizeMode keeps the figure at its original max-w-2xl cap (today's
  // exact behavior); a chosen mode lifts that cap so a custom/scaled size
  // isn't clipped by it -- Container's own max-w-5xl remains the outer bound.
  const figureClassName = data.sizeMode ? "" : "max-w-2xl";
  const imageStyle = buildImageStyle(data);

  return (
    <Container className="py-6 sm:py-8">
      <figure className={figureClassName}>
        {data.src ? (
          // eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for.
          <img
            src={data.src}
            alt={data.alt}
            className="w-full rounded-lg border border-border object-cover"
            style={imageStyle}
            loading="lazy"
          />
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

            <div className="flex flex-wrap gap-4 border-t border-border pt-2">
              <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                Size
                <select
                  value={data.sizeMode ?? ""}
                  onChange={(e) => changeSizeMode(e.target.value as "" | "scale" | "custom")}
                  className="h-9 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
                >
                  <option value="">Original</option>
                  <option value="scale">Scale</option>
                  <option value="custom">Custom size</option>
                </select>
              </label>

              {data.sizeMode === "scale" && (
                <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                  Scale (%)
                  <input
                    type="number"
                    min={SCALE_MIN}
                    max={SCALE_MAX}
                    value={scaleDraft}
                    onChange={(e) => setScaleDraft(e.target.value)}
                    onBlur={commitScaleDraft}
                    onKeyDown={blurOnEnter}
                    aria-label="Image scale percentage"
                    className="h-9 w-24 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
                  />
                </label>
              )}

              {data.sizeMode === "custom" && (
                <>
                  <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                    Width (px)
                    <input
                      type="number"
                      min={DIMENSION_MIN}
                      max={DIMENSION_MAX}
                      value={widthDraft}
                      onChange={(e) => setWidthDraft(e.target.value)}
                      onBlur={commitWidthDraft}
                      onKeyDown={blurOnEnter}
                      aria-label="Image width in pixels"
                      className="h-9 w-24 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
                    />
                  </label>
                  <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
                    Height (px)
                    <input
                      type="number"
                      min={DIMENSION_MIN}
                      max={DIMENSION_MAX}
                      value={heightDraft}
                      onChange={(e) => setHeightDraft(e.target.value)}
                      onBlur={commitHeightDraft}
                      onKeyDown={blurOnEnter}
                      aria-label="Image height in pixels"
                      className="h-9 w-24 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
                    />
                  </label>
                </>
              )}
            </div>
          </div>
        ) : (
          data.caption && <figcaption className="mt-2 text-sm text-muted">{data.caption}</figcaption>
        )}
      </figure>
    </Container>
  );
}
