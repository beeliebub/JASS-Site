"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type ImageData = { src: string; alt: string; caption?: string };

/** URL-only for this phase -- no file upload pipeline (no object storage
 * configured). `src` must be an absolute URL; see next.config.ts's CSP
 * `img-src`, which allows `https:` for exactly this. */
export function ImageBlock({
  data,
  onSaveData,
}: {
  data: ImageData;
  onSaveData: (next: ImageData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;

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
