"use client";

import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import type { ResolvedSiteSettings } from "@/lib/site-settings";
import { useToast } from "@/components/admin/toast";

/**
 * Phase 17 admin editor for site-wide favicon + link-share (embed) defaults.
 * Mirrors components/admin/custom-themes-admin.tsx's conventions (local
 * `useState`, `useToast()` for feedback, a `parseError`-shaped helper reading
 * `body.error`) and reuses components/blocks/image-block.tsx's exact
 * upload-widget flow (same client-side MIME/size checks, same
 * POST /api/uploads/images call) for both the favicon and embed image.
 */

// Mirrors the server-side cap in POST /api/uploads/images (PLAN.md Phase 14).
const MAX_UPLOAD_BYTES = 10485760;
const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

const TITLE_MAX = 70;
const DESCRIPTION_MAX = 200;

type SettingsUpdate = Partial<{
  faviconImageId: string | null;
  embedImageId: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
}>;

// The upload route's response didn't originally carry the `UploadedImage`
// row's id (only `url`/`sha1`/`mime`/`size`, which is all components/blocks/
// image-block.tsx ever needed). This admin page needs to send
// `faviconImageId`/`embedImageId` (a real UploadedImage.id) to
// PUT /api/site-settings, so app/api/uploads/images/route.ts now also
// returns `id` in its success response -- an additive, backward-compatible
// change (image-block.tsx only reads `url` and ignores the rest).
type UploadResponse = { id: string; url: string; sha1: string; mime: string; size: number };

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

function ImageUploadField({
  label,
  hint,
  imageUrl,
  uploading,
  onUpload,
  onClear,
  previewClassName,
}: {
  label: string;
  hint: string;
  imageUrl: string | null;
  uploading: boolean;
  onUpload: (e: ChangeEvent<HTMLInputElement>) => void;
  onClear: () => void;
  previewClassName: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-4">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-foreground">{label}</h3>
        <p className="text-xs text-muted">{hint}</p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- content-addressed local upload, same as image-block.tsx.
          <img
            src={imageUrl}
            alt={`Current ${label.toLowerCase()}`}
            className={`rounded-md border border-border-strong object-cover ${previewClassName}`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded-md border border-dashed border-border-strong text-[11px] text-muted ${previewClassName}`}
          >
            Default
          </div>
        )}

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              onChange={onUpload}
              disabled={uploading}
              aria-label={`Upload ${label.toLowerCase()}`}
              className="block text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            />
            {uploading && <span className="text-sm text-muted">Uploading…</span>}
          </div>
          {imageUrl && (
            <button
              type="button"
              onClick={onClear}
              disabled={uploading}
              className="w-fit text-xs font-medium text-muted transition hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear and use default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function SiteSettingsAdmin() {
  const { showError, showSuccess } = useToast();
  const [settings, setSettings] = useState<ResolvedSiteSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingEmbed, setUploadingEmbed] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [savingText, setSavingText] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/site-settings");
        if (!res.ok) throw new Error(await parseError(res, "Failed to load settings."));
        const { data } = (await res.json()) as { data: ResolvedSiteSettings };
        if (cancelled) return;
        setSettings(data);
        setTitleDraft(data.embedTitle ?? "");
        setDescriptionDraft(data.embedDescription ?? "");
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Failed to load settings.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateSettings(body: SettingsUpdate): Promise<ResolvedSiteSettings> {
    const res = await fetch("/api/site-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save settings."));
    const { data } = (await res.json()) as { data: ResolvedSiteSettings };
    setSettings(data);
    return data;
  }

  async function handleUpload(
    e: ChangeEvent<HTMLInputElement>,
    field: "faviconImageId" | "embedImageId",
    label: string,
  ) {
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

    const setUploading = field === "faviconImageId" ? setUploadingFavicon : setUploadingEmbed;
    setUploading(true);
    try {
      const res = await fetch("/api/uploads/images", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to upload image."));
      const { data: uploaded } = (await res.json()) as { data: UploadResponse };
      await updateSettings({ [field]: uploaded.id });
      showSuccess(`${label} updated.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploading(false);
    }
  }

  async function handleClear(field: "faviconImageId" | "embedImageId", label: string) {
    try {
      await updateSettings({ [field]: null });
      showSuccess(`${label} cleared -- using the default.`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to clear.");
    }
  }

  async function handleSaveText(e: FormEvent) {
    e.preventDefault();
    setSavingText(true);
    try {
      const nextTitle = titleDraft.trim();
      const nextDescription = descriptionDraft.trim();
      await updateSettings({
        embedTitle: nextTitle ? nextTitle : null,
        embedDescription: nextDescription ? nextDescription : null,
      });
      showSuccess("Embed text saved.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to save changes.");
    } finally {
      setSavingText(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
        {loadError}
      </div>
    );
  }

  if (!settings) {
    return <div className="text-sm text-muted">Loading…</div>;
  }

  const embedTextDisabled = Boolean(settings.embedImageUrl);

  return (
    <div className="flex flex-col gap-6">
      <ImageUploadField
        label="Favicon"
        hint="Shown as the browser tab icon site-wide. Falls back to the default icon when unset."
        imageUrl={settings.faviconUrl}
        uploading={uploadingFavicon}
        onUpload={(e) => handleUpload(e, "faviconImageId", "Favicon")}
        onClear={() => handleClear("faviconImageId", "Favicon")}
        previewClassName="h-10 w-10"
      />

      <ImageUploadField
        label="Embed image"
        hint="Shown as the preview image when a link to this site is shared (Discord, Slack, iMessage, etc.)."
        imageUrl={settings.embedImageUrl}
        uploading={uploadingEmbed}
        onUpload={(e) => handleUpload(e, "embedImageId", "Embed image")}
        onClear={() => handleClear("embedImageId", "Embed image")}
        previewClassName="h-20 w-36"
      />

      <form
        onSubmit={handleSaveText}
        className="flex flex-col gap-4 rounded-md border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Fallback embed text</h3>
          <p className="text-xs text-muted">
            {embedTextDisabled
              ? "Falls back to the image above -- an embed image is set, so this text is not used. Clear the embed image to use it."
              : "Used for link previews when no embed image is set. Leave blank to use the site's default name and tagline."}
          </p>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-muted">
            <span>Title</span>
            <span>
              {titleDraft.length}/{TITLE_MAX}
            </span>
          </span>
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value.slice(0, TITLE_MAX))}
            maxLength={TITLE_MAX}
            disabled={embedTextDisabled}
            placeholder="JASS — Minecraft Server"
            className="h-9 rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between text-xs font-medium text-muted">
            <span>Description</span>
            <span>
              {descriptionDraft.length}/{DESCRIPTION_MAX}
            </span>
          </span>
          <textarea
            value={descriptionDraft}
            onChange={(e) => setDescriptionDraft(e.target.value.slice(0, DESCRIPTION_MAX))}
            maxLength={DESCRIPTION_MAX}
            disabled={embedTextDisabled}
            rows={3}
            placeholder="Just A Simple Server — survival worth logging back into."
            className="resize-y rounded-md border border-border-strong bg-surface-2 px-3 py-2 text-sm text-foreground outline-none focus-visible:border-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
        </label>

        <button
          type="submit"
          disabled={savingText || embedTextDisabled}
          className="flex h-9 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {savingText ? "Saving…" : "Save text"}
        </button>
      </form>
    </div>
  );
}
