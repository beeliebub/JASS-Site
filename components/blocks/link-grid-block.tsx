"use client";

import { useState, type ButtonHTMLAttributes, type ChangeEvent } from "react";
import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";
import { formatBytes } from "@/lib/format";

export type QuickLink = { href: string; title: string; description: string; image?: string };
export type LinkGridData = { links: QuickLink[]; tone?: Tone; heading?: string };

const DEFAULT_HEADING = "Get oriented";

// Mirrors the server-side cap in the POST /api/uploads/images route
// -- checked here too so we never start a doomed upload. Kept in
// sync with the identical constant in image-block.tsx (same upload pipeline).
const MAX_UPLOAD_BYTES = 10485760;

const ALLOWED_MIME_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

/** Small circular overlay control for the image thumbnail -- needs a solid
 * background (to stay legible over arbitrary photo content) and full
 * rounding, unlike the inline square controls in list-controls.tsx. */
function RemoveImageButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-label="Remove image"
      title="Remove image"
      className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-surface text-muted shadow-sm transition hover:border-danger hover:text-danger motion-safe:active:scale-90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-border-strong disabled:hover:text-muted"
      {...props}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
        <path d="M2 2l6 6M8 2l-6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    </button>
  );
}

/** Full literal `group-hover:text-*` class per tone -- kept as complete,
 * non-interpolated strings so Tailwind's static source scanner can see them
 * (it reads raw file text, not evaluated JS, so `` `group-hover:${x}` ``
 * template concatenation would silently fail to generate the CSS). Warning
 * reuses the accent color, matching the rest of TONE_STYLES. */
const GROUP_HOVER_TEXT: Record<Tone, string> = {
  neutral: "group-hover:text-primary",
  primary: "group-hover:text-primary",
  accent: "group-hover:text-accent",
  info: "group-hover:text-info",
  warning: "group-hover:text-accent",
  danger: "group-hover:text-danger",
};

/** The hardcoded `links` array from components/home/quick-links.tsx. */
export function LinkGridBlock({
  data,
  onSaveData,
}: {
  data: LinkGridData;
  onSaveData: (next: LinkGridData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError, showSuccess } = useToast();
  const [links, setLinks] = useState(data.links);
  const [tone, setTone] = useState<Tone>(data.tone ?? "neutral");
  const [heading, setHeading] = useState(data.heading ?? DEFAULT_HEADING);
  const [saving, setSaving] = useState(false);
  const [uploadingIndex, setUploadingIndex] = useState<number | null>(null);

  const showEditable = isAdmin && editMode;
  // Neutral keeps today's exact hover treatment (primary title/arrow on
  // hover). Toned grids swap the hover accent for the tone's color.
  const hoverClass = GROUP_HOVER_TEXT[tone];

  if (!showEditable) {
    return (
      <section className="border-b border-border">
        <Container className="py-16 sm:py-20">
          <EditableText
            as="h2"
            value={heading}
            onSave={saveHeading}
            label="section heading"
            className="text-sm font-medium tracking-wide text-muted uppercase"
          />
          <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
            {links.map((link) => {
              const textContent = (
                <>
                  <span className={`flex items-center justify-between text-base font-semibold text-foreground transition-colors ${hoverClass}`}>
                    {link.title}
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className={`text-muted transition group-hover:translate-x-0.5 ${hoverClass}`}>
                      <path d="M3 8h9.5M8.5 3.5L13 8l-4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                  <span className="text-sm text-pretty text-muted">{link.description}</span>
                </>
              );
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group bg-surface p-6 transition-colors hover:bg-surface-2 ${
                    link.image ? "flex items-start gap-4" : "flex flex-col gap-2"
                  }`}
                >
                  {link.image ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for. */}
                      <img src={link.image} alt="" className="h-16 w-16 shrink-0 rounded object-cover" loading="lazy" />
                      <span className="flex min-w-0 flex-1 flex-col gap-2">{textContent}</span>
                    </>
                  ) : (
                    textContent
                  )}
                </Link>
              );
            })}
          </div>
        </Container>
      </section>
    );
  }

  async function persist(next: QuickLink[]) {
    const previous = links;
    setLinks(next);
    setSaving(true);
    try {
      await onSaveData({ links: next, tone, heading });
    } catch (error) {
      setLinks(previous);
      showError(error instanceof Error ? error.message : "Failed to save links.");
    } finally {
      setSaving(false);
    }
  }

  function updateField(index: number, field: keyof QuickLink, value: string) {
    return persist(links.map((it, i) => (i === index ? { ...it, [field]: value } : it)));
  }

  async function handleImageFileChange(index: number, e: ChangeEvent<HTMLInputElement>) {
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

    setUploadingIndex(index);
    try {
      const res = await fetch("/api/uploads/images", {
        method: "POST",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to upload image."));
      const { data: uploaded } = (await res.json()) as { data: { url: string } };
      await persist(links.map((it, i) => (i === index ? { ...it, image: uploaded.url } : it)));
      showSuccess("Image uploaded.");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload image.");
    } finally {
      setUploadingIndex(null);
    }
  }

  function removeImage(index: number) {
    return persist(links.map((it, i) => (i === index ? { ...it, image: undefined } : it)));
  }

  function addLink() {
    return persist([...links, { href: "/", title: "New link", description: "Describe where this goes." }]);
  }

  function deleteLink(index: number) {
    return persist(links.filter((_, i) => i !== index));
  }

  function moveLink(index: number, direction: -1 | 1) {
    const swapIdx = index + direction;
    if (swapIdx < 0 || swapIdx >= links.length) return Promise.resolve();
    const next = [...links];
    [next[index], next[swapIdx]] = [next[swapIdx], next[index]];
    return persist(next);
  }

  async function changeTone(next: Tone) {
    const previous = tone;
    setTone(next);
    try {
      await onSaveData({ links, tone: next, heading });
    } catch (error) {
      setTone(previous);
      showError(error instanceof Error ? error.message : "Failed to save tone.");
    }
  }

  async function saveHeading(next: string) {
    const previous = heading;
    setHeading(next);
    try {
      await onSaveData({ links, tone, heading: next });
    } catch (error) {
      setHeading(previous);
      showError(error instanceof Error ? error.message : "Failed to save heading.");
    }
  }

  return (
    <section className="border-b border-border">
      <Container className="py-16 sm:py-20">
        <div className="flex items-center justify-between gap-3">
          <EditableText
            as="h2"
            value={heading}
            onSave={saveHeading}
            label="section heading"
            className="text-sm font-medium tracking-wide text-muted uppercase"
          />
          <ToneSelect value={tone} onChange={changeTone} />
        </div>
        <div className="mt-6 flex flex-col gap-3">
          {links.map((link, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md border border-border bg-surface p-4">
              {link.image ? (
                <div className="relative shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for. */}
                  <img src={link.image} alt="" className="h-16 w-16 rounded object-cover" />
                  <RemoveImageButton onClick={() => removeImage(i)} disabled={saving} />
                </div>
              ) : null}
              <div className="min-w-0 flex-1">
                <EditableText
                  as="span"
                  value={link.title}
                  onSave={(v) => updateField(i, "title", v)}
                  label={`link ${i + 1} title`}
                  className="block text-base font-semibold text-foreground"
                />
                <EditableText
                  as="span"
                  value={link.href}
                  onSave={(v) => updateField(i, "href", v)}
                  label={`link ${i + 1} href`}
                  className="mt-1 block font-mono text-xs text-primary"
                />
                <EditableText
                  as="span"
                  multiline
                  value={link.description}
                  onSave={(v) => updateField(i, "description", v)}
                  label={`link ${i + 1} description`}
                  className="mt-1 block text-sm text-muted"
                />
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/gif,image/webp"
                    onChange={(e) => handleImageFileChange(i, e)}
                    disabled={uploadingIndex === i || saving}
                    aria-label={`Upload link ${i + 1} image`}
                    className="block text-xs text-muted file:mr-3 file:h-8 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-2 file:text-xs file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  {uploadingIndex === i && <span className="text-xs text-muted">Uploading…</span>}
                </div>
                <label className="mt-1 flex flex-col gap-1 text-xs text-muted">
                  Image URL (optional)
                  <EditableText
                    as="span"
                    value={link.image ?? ""}
                    onSave={(v) => updateField(i, "image", v)}
                    label={`link ${i + 1} image URL`}
                    allowEmpty
                    placeholder="https://example.com/image.png"
                    className="block font-mono text-xs text-foreground"
                  />
                </label>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <MoveUpButton disabled={i === 0 || saving} onClick={() => moveLink(i, -1)} />
                <MoveDownButton disabled={i === links.length - 1 || saving} onClick={() => moveLink(i, 1)} />
                <DeleteButton label="Delete link" onClick={() => deleteLink(i)} disabled={saving} />
              </div>
            </div>
          ))}
          <AddButton onClick={addLink} disabled={saving} className="self-start">
            Add link
          </AddButton>
        </div>
      </Container>
    </section>
  );
}
