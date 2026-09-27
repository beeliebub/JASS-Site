"use client";

import { Fragment, useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";
import { Container } from "@/components/container";
import { CopyButton } from "@/components/resource/copy-button";
import { buildResourcePackSnippet, formatBytes } from "@/lib/format";

// Mirrors the server-side cap in lib/uploads.ts / the POST route
// -- checked here too so we never start a doomed upload.
const MAX_UPLOAD_BYTES = 268435456;

type HistoryPack = {
  id: string;
  filename: string;
  size: number;
  sha1: string;
  uuid: string;
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
export function ResourcePackAdmin({ siteUrl }: { siteUrl: string }) {
  const { editMode } = useEditMode();
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const [history, setHistory] = useState<HistoryPack[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [statusPendingId, setStatusPendingId] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [shareFromId, setShareFromId] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  // `history === null` doubles as the "still loading" flag -- every
  // subsequent reload (after upload/delete) leaves it non-null, so
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

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) {
      setSelectedFile(null);
      return;
    }

    if (!file.name.toLowerCase().endsWith(".zip")) {
      e.target.value = "";
      setSelectedFile(null);
      showError("Resource packs must be a .zip file.");
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      e.target.value = "";
      setSelectedFile(null);
      showError(`"${file.name}" is ${formatBytes(file.size)} -- the max is 256 MB.`);
      return;
    }

    setSelectedFile(file);
  }

  async function handleUpload() {
    const file = selectedFile;
    if (!file) return;

    setUploading(true);
    try {
      const headers: Record<string, string> = {
        "X-Filename": file.name,
        "Content-Type": "application/zip",
      };
      if (shareFromId) headers["X-Share-Uuid-From"] = shareFromId;

      const res = await fetch("/api/resource-pack", {
        method: "POST",
        body: file,
        headers,
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to upload resource pack."));
      showSuccess("Resource pack uploaded.");
      router.refresh();
      await loadHistory();
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to upload resource pack.");
    } finally {
      setSelectedFile(null);
      setShareFromId("");
      setInputKey((key) => key + 1);
      setUploading(false);
    }
  }

  async function toggleActive(pack: HistoryPack) {
    if (!history) return;

    const previous = history;
    const active = !pack.active;
    setHistory((current) => current?.map((candidate) => (candidate.id === pack.id ? { ...candidate, active } : candidate)) ?? current);
    setStatusPendingId(pack.id);
    try {
      const res = await fetch(`/api/resource-pack/${pack.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to update resource-pack status."));
    } catch (error) {
      setHistory(previous);
      showError(error instanceof Error ? error.message : "Failed to update resource-pack status.");
    } finally {
      setStatusPendingId(null);
    }
  }

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
            key={inputKey}
            type="file"
            accept=".zip"
            onChange={handleFileChange}
            disabled={uploading}
            aria-label="Upload resource pack"
            className="block max-w-full text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer file:rounded-md file:border file:border-border-strong file:bg-surface file:px-3 file:text-sm file:font-medium file:text-foreground file:transition hover:file:border-primary hover:file:text-primary disabled:cursor-not-allowed disabled:opacity-50"
          />
          <select
            value={shareFromId}
            onChange={(event) => setShareFromId(event.target.value)}
            disabled={uploading || !history}
            aria-label="Share UUID from existing resource pack"
            className="h-9 max-w-full rounded-md border border-border-strong bg-surface px-2.5 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Generate new UUID</option>
            {history?.map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.filename} · {formatDate(pack.uploadedAt)}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={handleUpload}
            disabled={!selectedFile || uploading}
            className="flex h-9 items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-2 py-2.5 font-medium sm:px-4">Filename</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Size</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Uploaded</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">Status</th>
                <th className="px-2 py-2.5 font-medium sm:px-4">&nbsp;</th>
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
              {history?.map((pack) => {
                const isExpanded = expanded.has(pack.id);
                const downloadUrl = `${siteUrl}/api/resource-pack/${pack.id}`;
                const snippet = buildResourcePackSnippet({ downloadUrl, sha1: pack.sha1, uuid: pack.uuid });

                return (
                  <Fragment key={pack.id}>
                    <tr className="bg-surface align-top">
                      <td className="max-w-32 truncate px-2 py-3 font-medium text-foreground sm:max-w-48 sm:px-4">
                        {pack.filename}
                      </td>
                      <td className="whitespace-nowrap px-2 py-3 text-muted sm:px-4">{formatBytes(pack.size)}</td>
                      <td className="whitespace-nowrap px-2 py-3 sm:px-4">
                        <time dateTime={pack.uploadedAt} className="font-mono text-xs text-muted">
                          {formatDate(pack.uploadedAt)}
                        </time>
                      </td>
                      <td className="px-2 py-3 sm:px-4">
                        <button
                          type="button"
                          onClick={() => toggleActive(pack)}
                          disabled={statusPendingId === pack.id}
                          aria-pressed={pack.active}
                          title="Admin-only label; public resource-pack listings are unchanged"
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                            pack.active
                              ? "border-primary/40 bg-primary/10 text-primary"
                              : "border-border-strong text-muted hover:text-foreground"
                          }`}
                        >
                          {pack.active ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="px-2 py-3 sm:px-4">
                        <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(pack.id)}
                            aria-expanded={isExpanded}
                            className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                          >
                            {isExpanded ? "Hide" : "Details"}
                          </button>
                          <DeleteButton
                            label={`Delete ${pack.filename}`}
                            onClick={() => deletePack(pack)}
                            disabled={pendingId === pack.id || statusPendingId === pack.id}
                          />
                        </div>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-2">
                        <td colSpan={5} className="px-3 py-4 sm:px-4">
                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted">UUID</p>
                              <div className="mt-2 flex items-center gap-2">
                                <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-foreground">
                                  {pack.uuid}
                                </code>
                                <CopyButton value={pack.uuid} label={`Copy UUID for ${pack.filename}`} />
                              </div>
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-medium uppercase tracking-wide text-muted">SHA-1</p>
                              <div className="mt-2 flex items-center gap-2">
                                <code className="min-w-0 flex-1 break-all rounded-md bg-surface px-3 py-2 font-mono text-xs text-foreground">
                                  {pack.sha1}
                                </code>
                                <CopyButton value={pack.sha1} label={`Copy SHA-1 digest for ${pack.filename}`} />
                              </div>
                            </div>
                            <div className="min-w-0 sm:col-span-2">
                              <div className="flex items-center justify-between gap-2">
                                <p className="text-xs font-medium uppercase tracking-wide text-muted">
                                  server.properties snippet
                                </p>
                                <CopyButton value={snippet} label={`Copy server.properties snippet for ${pack.filename}`} />
                              </div>
                              <pre className="mt-2 overflow-x-auto rounded-md bg-surface px-3 py-2 font-mono text-xs leading-relaxed text-foreground">
                                <code>{snippet}</code>
                              </pre>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Container>
    </section>
  );
}
