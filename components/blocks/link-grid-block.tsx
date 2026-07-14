"use client";

import {
  useState,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";
import { ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";
import { formatBytes } from "@/lib/format";
import { SCALE_MIN, SCALE_MAX, DIMENSION_MIN, DIMENSION_MAX, buildImageStyle } from "@/lib/image-size";

/** `sizeMode`/`scale`/`width`/`height` mirror ImageBlock's display-size
 * override exactly (see lib/image-size.ts) -- applied per-link instead of
 * once per block. `objectPosition` is the click-and-drag focal point
 * `object-cover` crops around; `null`/unset = today's implicit center, no
 * visible change. All optional/nullable so pre-existing links (saved before
 * this field existed) render pixel-identical to before. */
export type QuickLink = {
  href: string;
  title: string;
  description: string;
  image?: string;
  sizeMode?: "scale" | "custom" | null;
  scale?: number | null;
  width?: number | null;
  height?: number | null;
  objectPosition?: { x: number; y: number } | null;
};
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

function clampPercent(n: number) {
  return Math.min(100, Math.max(0, n));
}

/** `x`/`y` as whole-number percentages of `rect`, from a pointer's client
 * coordinates -- shared by pointerdown (start of drag) and pointermove
 * (during drag). */
function positionFromPointer(e: { clientX: number; clientY: number }, rect: DOMRect) {
  const x = rect.width > 0 ? ((e.clientX - rect.left) / rect.width) * 100 : 50;
  const y = rect.height > 0 ? ((e.clientY - rect.top) / rect.height) * 100 : 50;
  return { x: Math.round(clampPercent(x)), y: Math.round(clampPercent(y)) };
}

const POSITION_KEY_STEP = 5;

/** Per-link image sizing (same Scale/Custom mechanism as ImageBlock, see
 * lib/image-size.ts) plus a click-and-drag focal point (`objectPosition`) --
 * the crop point `object-cover` uses once the box is smaller than the
 * source image. Both unset/null reproduce today's exact fixed 64x64
 * centered thumbnail (verified by `buildImageStyle` returning `{}` and
 * `objectPosition` staying `undefined` in that case).
 *
 * The thumbnail is wrapped in a box that's a definite `h-16 w-16` except in
 * "custom" mode: a CSS percentage width (used by "scale" mode) only
 * resolves against a *definite* containing-block width, and this row's
 * layout would otherwise make that box's width depend on its own content
 * (the image being sized) -- an unresolvable circular reference that
 * browsers silently fall back to "no shrinking" for. Pinning the box to the
 * original 64px reference size sidesteps that, and conveniently also means
 * 100% scale reproduces today's exact box. "Custom" mode's width/height are
 * absolute pixels, so no such ambiguity applies there and the box is left
 * to size itself around them instead (avoiding clipping a larger image). */
function LinkImageEditor({
  link,
  index,
  disabled,
  onPatch,
  onRemoveImage,
}: {
  link: QuickLink;
  index: number;
  disabled: boolean;
  onPatch: (patch: Partial<QuickLink>) => Promise<void>;
  onRemoveImage: () => void;
}) {
  // Draft strings for the number inputs -- committed on blur (not per
  // keystroke), same pattern as ImageBlock's scaleDraft/commitScaleDraft.
  const [scaleDraft, setScaleDraft] = useState(link.scale != null ? String(link.scale) : "");
  const [widthDraft, setWidthDraft] = useState(link.width != null ? String(link.width) : "");
  const [heightDraft, setHeightDraft] = useState(link.height != null ? String(link.height) : "");

  // Position tracking: `livePosition` is the in-progress drag/keyboard-nudge
  // value, shown immediately but not yet persisted; it's cleared once the
  // patch settles (success or failure), at which point the marker/image
  // fall back to reading the (now-updated, or rolled-back) `link` prop --
  // the same "commit once, not per-tick" principle as the drafts above,
  // just triggered by pointerup/keydown instead of blur.
  const [dragging, setDragging] = useState(false);
  const [livePosition, setLivePosition] = useState<{ x: number; y: number } | null>(null);

  const committedPosition = link.objectPosition ?? { x: 50, y: 50 };
  const position = livePosition ?? committedPosition;

  function changeSizeMode(nextMode: "" | "scale" | "custom") {
    onPatch({ sizeMode: nextMode === "" ? null : nextMode });
  }

  function commitScaleDraft() {
    const raw = scaleDraft.trim();
    if (raw === "") {
      onPatch({ scale: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setScaleDraft(link.scale != null ? String(link.scale) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, SCALE_MIN), SCALE_MAX);
    setScaleDraft(String(clamped));
    onPatch({ scale: clamped });
  }

  function commitWidthDraft() {
    const raw = widthDraft.trim();
    if (raw === "") {
      onPatch({ width: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setWidthDraft(link.width != null ? String(link.width) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, DIMENSION_MIN), DIMENSION_MAX);
    setWidthDraft(String(clamped));
    onPatch({ width: clamped });
  }

  function commitHeightDraft() {
    const raw = heightDraft.trim();
    if (raw === "") {
      onPatch({ height: null });
      return;
    }
    const parsed = Number.parseInt(raw, 10);
    if (Number.isNaN(parsed)) {
      setHeightDraft(link.height != null ? String(link.height) : "");
      return;
    }
    const clamped = Math.min(Math.max(parsed, DIMENSION_MIN), DIMENSION_MAX);
    setHeightDraft(String(clamped));
    onPatch({ height: clamped });
  }

  function blurOnEnter(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") e.currentTarget.blur();
  }

  function handlePointerDown(e: PointerEvent<HTMLDivElement>) {
    if (disabled) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setLivePosition(positionFromPointer(e, e.currentTarget.getBoundingClientRect()));
    setDragging(true);
  }

  function handlePointerMove(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    setLivePosition(positionFromPointer(e, e.currentTarget.getBoundingClientRect()));
  }

  async function handlePointerUp(e: PointerEvent<HTMLDivElement>) {
    if (!dragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
    const final = livePosition ?? committedPosition;
    try {
      await onPatch({ objectPosition: final });
    } finally {
      setLivePosition(null);
    }
  }

  // Arrow-key nudging: each keypress is already a discrete, deliberate
  // action (unlike pointermove's continuous stream), so each one commits
  // immediately rather than accumulating toward a separate blur/Enter step.
  async function nudgePosition(dx: number, dy: number) {
    const next = { x: Math.round(clampPercent(position.x + dx)), y: Math.round(clampPercent(position.y + dy)) };
    setLivePosition(next);
    try {
      await onPatch({ objectPosition: next });
    } finally {
      setLivePosition(null);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (disabled) return;
    switch (e.key) {
      case "ArrowLeft":
        e.preventDefault();
        nudgePosition(-POSITION_KEY_STEP, 0);
        break;
      case "ArrowRight":
        e.preventDefault();
        nudgePosition(POSITION_KEY_STEP, 0);
        break;
      case "ArrowUp":
        e.preventDefault();
        nudgePosition(0, -POSITION_KEY_STEP);
        break;
      case "ArrowDown":
        e.preventDefault();
        nudgePosition(0, POSITION_KEY_STEP);
        break;
      default:
        break;
    }
  }

  const imageStyle = { ...buildImageStyle(link), objectPosition: `${position.x}% ${position.y}%` };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative shrink-0 touch-none${link.sizeMode === "custom" ? "" : " h-16 w-16"}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleKeyDown}
        tabIndex={disabled ? -1 : 0}
        role="group"
        aria-label={`Link ${index + 1} image focal point -- drag or use arrow keys to adjust`}
        title={`Focal point: ${position.x}%, ${position.y}%`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for. */}
        <img src={link.image} alt="" className="h-16 w-16 rounded object-cover" style={imageStyle} draggable={false} />
        <span
          aria-hidden
          className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-primary shadow"
          style={{ left: `${position.x}%`, top: `${position.y}%` }}
        />
        <RemoveImageButton onClick={onRemoveImage} disabled={disabled} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
          Size
          <select
            value={link.sizeMode ?? ""}
            onChange={(e) => changeSizeMode(e.target.value as "" | "scale" | "custom")}
            disabled={disabled}
            className="h-8 w-24 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
          >
            <option value="">Original</option>
            <option value="scale">Scale</option>
            <option value="custom">Custom</option>
          </select>
        </label>

        {link.sizeMode === "scale" && (
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            Scale (%)
            <input
              type="number"
              min={SCALE_MIN}
              max={SCALE_MAX}
              value={scaleDraft}
              onChange={(e) => setScaleDraft(e.target.value)}
              onBlur={commitScaleDraft}
              onKeyDown={blurOnEnter}
              disabled={disabled}
              aria-label={`Link ${index + 1} image scale percentage`}
              className="h-8 w-20 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
            />
          </label>
        )}

        {link.sizeMode === "custom" && (
          <>
            <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Width (px)
              <input
                type="number"
                min={DIMENSION_MIN}
                max={DIMENSION_MAX}
                value={widthDraft}
                onChange={(e) => setWidthDraft(e.target.value)}
                onBlur={commitWidthDraft}
                onKeyDown={blurOnEnter}
                disabled={disabled}
                aria-label={`Link ${index + 1} image width in pixels`}
                className="h-8 w-20 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
              />
            </label>
            <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
              Height (px)
              <input
                type="number"
                min={DIMENSION_MIN}
                max={DIMENSION_MAX}
                value={heightDraft}
                onChange={(e) => setHeightDraft(e.target.value)}
                onBlur={commitHeightDraft}
                onKeyDown={blurOnEnter}
                disabled={disabled}
                aria-label={`Link ${index + 1} image height in pixels`}
                className="h-8 w-20 rounded-md border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
              />
            </label>
          </>
        )}
      </div>
    </div>
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
            {links.map((link, index) => {
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
                  key={index}
                  href={link.href}
                  className={`group bg-surface p-6 transition-colors hover:bg-surface-2 ${
                    link.image ? "flex items-start gap-4" : "flex flex-col gap-2"
                  }`}
                >
                  {link.image ? (
                    <>
                      {/* See LinkImageEditor's comment on the definite-width wrapper: percentage
                          "scale" sizing needs it, "custom" mode leaves it unset to avoid clipping. */}
                      <div className={`relative shrink-0${link.sizeMode === "custom" ? "" : " h-16 w-16"}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- arbitrary absolute admin-supplied URLs, not a known set of domains next/image can be configured for. */}
                        <img
                          src={link.image}
                          alt=""
                          className="h-16 w-16 rounded object-cover"
                          style={{
                            ...buildImageStyle(link),
                            objectPosition: link.objectPosition
                              ? `${link.objectPosition.x}% ${link.objectPosition.y}%`
                              : undefined,
                          }}
                          loading="lazy"
                        />
                      </div>
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

  // General nested-patch used by resize/position controls (Partial<QuickLink>
  // instead of a single string field); updateField below is just the
  // single-string-field case of the same operation.
  function patchLink(index: number, patch: Partial<QuickLink>) {
    return persist(links.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  function updateField(index: number, field: "href" | "title" | "description" | "image", value: string) {
    return patchLink(index, { [field]: value });
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
                <LinkImageEditor
                  link={link}
                  index={i}
                  disabled={saving}
                  onPatch={(patch) => patchLink(i, patch)}
                  onRemoveImage={() => removeImage(i)}
                />
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
