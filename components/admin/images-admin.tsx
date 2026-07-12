"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";
import { formatBytes } from "@/lib/format";

export type ImageLibraryEntry = {
  id: string;
  sha1: string;
  ext: string;
  mime: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string | null;
  used: boolean;
};

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

export function ImagesAdmin({ initialImages }: { initialImages: ImageLibraryEntry[] }) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [images, setImages] = useState(initialImages);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function deleteImage(image: ImageLibraryEntry) {
    if (typeof window !== "undefined" && !window.confirm(`Delete this image (${image.sha1.slice(0, 10)}…)? This can't be undone.`)) {
      return;
    }
    setPendingId(image.id);
    try {
      const res = await fetch(`/api/uploads/images/${image.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete image."));
      showSuccess("Image deleted.");
      setImages((prev) => prev.filter((it) => it.id !== image.id));
      router.refresh();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete image.");
    } finally {
      setPendingId(null);
    }
  }

  if (images.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
        No images have been uploaded yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {images.map((image) => (
        <div key={image.id} className="flex flex-col gap-3 rounded-md border border-border bg-surface p-4">
          {/* eslint-disable-next-line @next/next/no-img-element -- content-addressed local uploads, not a known set of domains next/image can be configured for. */}
          <img
            src={`/api/uploads/images/${image.sha1}.${image.ext}`}
            alt=""
            className="h-40 w-full rounded object-cover"
          />
          <div className="flex flex-col gap-1 text-xs text-muted">
            <span className="font-mono text-foreground" title={image.sha1}>
              {image.sha1.slice(0, 12)}…
            </span>
            <span>
              {image.mime} · {formatBytes(image.size)}
            </span>
            <span>
              {formatDate(image.uploadedAt)}
              {image.uploadedBy ? ` · ${image.uploadedBy}` : ""}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                image.used ? "border-primary/40 bg-primary/10 text-primary" : "border-border-strong text-muted"
              }`}
            >
              {image.used ? "Used" : "Unused"}
            </span>
            {!image.used && (
              <DeleteButton
                label="Delete image"
                onClick={() => deleteImage(image)}
                disabled={pendingId === image.id}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
