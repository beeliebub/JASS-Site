"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";
import { Container } from "@/components/container";
import { formatBytes } from "@/lib/format";

// Mirrors the server-side cap in lib/uploads.ts / the POST route
// -- checked here too so we never start a doomed upload.
const MAX_UPLOAD_BYTES = 268435456;

type HistoryPack = {
  id: string;
  filename: string;
  size: number;
  sha1: string;
  active: boolean;
  uploadedAt: string;
  uploadedBy: string | null;
};

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function formatDate(iso: string) {
  return iso.slice(0, 10);
}

/** Self-hiding admin panel appended below the public ResourcePackView --
 * only ever renders (and only ever fetches admin-only history) once
 * `useEditMode().editMode` is true, matching the pattern of other admin
 * components in this repo (e.g. components/admin/pages-admin.tsx). */
export function ResourcePackAdmin() {
  const { editMode } = useEditMode();
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [history, setHistory] = useState<HistoryPack[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // `history === null` doubles as the "still loading" flag -- every
  // subsequent reload (after upload/activate/delete) leaves it non-null, so
  // the "Loading…" row only ever appears on first mount.
  //
  // Used by the mutation handlers below (plain event handlers, not effects,
  // so no restriction on when they call setState).
  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/resource-pack/history");
      if (!res.ok) throw new Error(await parseError(res, "Failed to load upload history."));
      const { data } = (await res.json()) as { data: HistoryPack[] };
      setHistory(data);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to load upload history.");
    }
  }, [showError]);

  // The mount-time fetch is deliberately inlined here (mirrors
  // live-status-badge.tsx) rather than calling the `loadHistory` callback
  // above -- react-hooks/set-state-in-effect can't trace setState calls
  // through an externally-defined function reference, so it flags them as
  // synchronous even when they only happen after an `await`. Every setState
  // call below is gated on `!cancelled` and only reached post-await.
  useEffect(() => {
    if (!editMode) return;
    let cancelled = false;

    async function fetchHistory() {
      try {
        const res = await fetch("/api/resource-pack/history");
        if (!res.ok) throw new Error(await parseError(res, "Failed to load upload history."));
        const { data } = (await res.json()) as { data: HistoryPack[] };
        if (!cancelled) setHistory(data);
      } catch (error) {
        if (!cancelled) showError(error instanceof Error ? error.message : "Failed to load upload history.");
      }
    }

    fetchHistory();
    return () => {
      cancelled = true;
    };
  }, [editMode, showError]);

  async function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".zip")) {
      showError("Resource packs must be a .zip file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      showError(`"${file.name}" is ${formatBytes(file.size)} -- the max is 256 MB.`);
      return;
    }

    setUploading(true);
    try {
      const res = await fetch("/api/resource-pack", {
        method: "POST",
        body: file,
        headers: { "X-Filename": file.name, "Content-Type": "application/zip" },
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to upload resource pack."));
      showSuccess("Resource pack uploaded.");
      router.refresh();
      await loadHistory();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload resource pack.");
    } finally {
      setUploading(false);
    }
  }

  async function activatePack(pack: HistoryPack) {
    setPendingId(pack.id);
    try {
      const res = await fetch(`/api/resource-pack/${pack.id}/activate`, { method: "POST" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to activate resource pack."));
      showSuccess(`"${pack.filename}" activated.`);
      router.refresh();
      await loadHistory();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to activate resource pack.");
    } finally {
      setPendingId(null);
    }
  }

  async function deletePack(pack: HistoryPack) {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${pack.filename}"? This can't be undone.`)) return;
    setPendingId(pack.id);
    try {
      const res = await fetch(`/api/resource-pack/${pack.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete resource pack."));
      showSuccess(`"${pack.filename}" deleted.`);
      router.refresh();
      await loadHistory();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete resource pack.");
    } finally {
      setPendingId(null);
    }
  }

  if (!editMode) return null;

  return (
    <section className="border-b border-border bg-surface-2/40">
      <Container className="flex flex-col gap-4 py-8">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted">Admin</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Manage resource packs</h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            disabled={uploading}
            aria-label="Upload resource pack"
            className="block text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          {uploading && <span className="text-sm text-muted">Uploading…</span>}
        </div>

        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Filename</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Uploaded</th>
                <th className="px-4 py-2.5 font-medium">SHA-1</th>
                <th className="px-4 py-2.5 font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {!history && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    Loading…
                  </td>
                </tr>
              )}
              {history && history.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No uploads yet.
                  </td>
                </tr>
              )}
              {history?.map((pack) => (
                <tr key={pack.id} className="bg-surface">
                  <td className="max-w-48 truncate px-4 py-3 font-medium text-foreground">{pack.filename}</td>
                  <td className="px-4 py-3 text-muted">{formatBytes(pack.size)}</td>
                  <td className="px-4 py-3">
                    <time dateTime={pack.uploadedAt} className="font-mono text-xs text-muted">
                      {formatDate(pack.uploadedAt)}
                    </time>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{pack.sha1.slice(0, 10)}…</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {pack.active ? (
                        <span className="rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          Active
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => activatePack(pack)}
                          disabled={pendingId === pack.id}
                          className="rounded-full border border-border-strong px-2.5 py-1 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Activate
                        </button>
                      )}
                      <DeleteButton
                        label={`Delete ${pack.filename}`}
                        onClick={() => deletePack(pack)}
                        disabled={pack.active || pendingId === pack.id}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
