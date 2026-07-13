"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/admin/toast";
import { summarizeAuditEntry } from "@/lib/audit-log-summary";
import { pagePath } from "@/lib/routes";
import { AuditPreviewModal, isPreviewableBlockType, type AuditPreviewPayload } from "@/components/admin/audit-preview-modal";

/**
 * Admin UI for the audit trail (`GET /api/audit-log`) and its
 * single-step undo (`POST /api/audit-log/[id]/undo`). Mirrors
 * components/admin/pages-admin.tsx's conventions: local `useState` + `fetch`,
 * `useToast()` for feedback, a `parseError`-shaped helper reading
 * `body.error`, and `window.confirm` before a state-mutating action (here:
 * undo, which is not literally destructive but does overwrite live data --
 * same affordance `deletePage` uses).
 *
 * Deliberately duplicates the entity-type list rather than importing
 * `AUDIT_ENTITY_TYPES` from lib/audit-log.ts -- that module also imports
 * `node:fs` (for resource-pack undo) and other server-only validation
 * schemas, which has no business being pulled into a client bundle.
 */

const ENTITY_TYPES = [
  "Page",
  "Block",
  "NavItem",
  "CustomTheme",
  "User",
  "ResourcePack",
  "SiteSettings",
  "UploadedImage",
  "Tag",
] as const;

type AuditEntityType = (typeof ENTITY_TYPES)[number];
type AuditAction = "create" | "update" | "delete";

type AuditLogEntry = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  before: string | null;
  after: string | null;
  actorEmail: string | null;
  createdAt: string;
  /** Which page (if any) this entity lived on -- both null when the entity
   * type isn't "on a page" at all, or when it was but the page has since
   * been deleted. Populated server-side by `GET /api/audit-log` via
   * `extractPageId` + a batch `Page` lookup. */
  pageSlug: string | null;
  pageTitle: string | null;
};

const ACTION_STYLES: Record<AuditAction, string> = {
  create: "border-primary/40 bg-primary/10 text-primary",
  update: "border-accent/40 bg-accent/10 text-accent",
  delete: "border-danger/40 bg-danger/10 text-danger",
};

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function formatJson(json: string | null): string {
  if (json === null) return "(none)";
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/**
 * Builds the `{ type, before, after }` payload `AuditPreviewModal` needs
 * out of a Block entry's raw `before`/`after` JSON strings, or `null` if
 * this entry can't be previewed -- not a `Block` entry at all, unparseable
 * snapshot JSON, or a block type excluded from preview (`hero`/`ruleList`/
 * `featureGrid`/`postList`, which each need server-fetched reference data a
 * snapshot doesn't carry).
 */
function getPreviewPayload(entry: AuditLogEntry): AuditPreviewPayload | null {
  if (entry.entityType !== "Block") return null;

  function parseSide(raw: string | null): { type: string; data: unknown } | null {
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as { type: string; data: unknown };
    } catch {
      return null;
    }
  }

  const before = parseSide(entry.before);
  const after = parseSide(entry.after);
  const type = after?.type ?? before?.type;
  if (!type || !isPreviewableBlockType(type)) return null;

  return { type, before: before?.data ?? null, after: after?.data ?? null };
}

export function AuditLogAdmin({ isOwner }: { isOwner: boolean }) {
  // User-entity audit entries are owner-only server-side (GET /api/audit-log
  // filters them out, and the undo route requires requireOwner() for them --
  // matching every other /api/users/** route being owner-gated). Hiding the
  // filter option for non-owners avoids offering a control that would just
  // 401 -- same reasoning as not showing an editable slug control that always
  // fails server-side for protected pages.
  const visibleEntityTypes = isOwner ? ENTITY_TYPES : ENTITY_TYPES.filter((type) => type !== "User");
  const { showError, showSuccess } = useToast();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [entityTypeFilter, setEntityTypeFilter] = useState<AuditEntityType | "">("");
  const [actorEmailFilter, setActorEmailFilter] = useState("");
  const [actorOptions, setActorOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<AuditPreviewPayload | null>(null);

  const fetchPage = useCallback(
    async (params: { entityType: AuditEntityType | ""; actorEmail: string; page: number }) => {
      const search = new URLSearchParams();
      if (params.entityType) search.set("entityType", params.entityType);
      if (params.actorEmail) search.set("actorEmail", params.actorEmail);
      search.set("page", String(params.page));
      const res = await fetch(`/api/audit-log?${search.toString()}`);
      if (!res.ok) throw new Error(await parseError(res, "Failed to load audit log."));
      return (await res.json()) as { data: AuditLogEntry[]; page: number; totalPages: number };
    },
    [],
  );

  const reload = useCallback(
    async (params: { entityType: AuditEntityType | ""; actorEmail: string; page: number }) => {
      setLoading(true);
      setLoadError(null);
      try {
        const body = await fetchPage(params);
        setEntries(body.data);
        setPage(body.page);
        setTotalPages(body.totalPages);
        setExpanded(new Set());
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : "Failed to load audit log.");
      } finally {
        setLoading(false);
      }
    },
    [fetchPage],
  );

  useEffect(() => {
    // Wrapped in an IIFE (matching site-settings-admin.tsx's load effect)
    // rather than calling `reload` as a direct statement -- its setState
    // calls only run after the `await fetch`, not synchronously during this
    // effect, but the lint rule can't see through the indirection otherwise.
    // Changing either filter always resets back to page 1.
    (async () => {
      await reload({ entityType: entityTypeFilter, actorEmail: actorEmailFilter, page: 1 });
    })();
  }, [entityTypeFilter, actorEmailFilter, reload]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/audit-log/actors");
        if (!res.ok) return;
        const body = (await res.json()) as { data: string[] };
        setActorOptions(body.data);
      } catch {
        // Non-critical -- the datalist just stays empty, filtering by
        // hand-typed email still works.
      }
    })();
  }, []);

  function goToPage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return;
    void reload({ entityType: entityTypeFilter, actorEmail: actorEmailFilter, page: nextPage });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /**
   * Best-effort staleness check: flags an entry
   * whose entity shows up again with a later timestamp among the
   * currently-loaded entries. There's no server-computed "is this stale"
   * flag, and this only sees the current page of entries -- an even-newer
   * entry for the same entity could exist on a different page. That's fine:
   * the warning is explicitly non-blocking either way, so under-flagging an
   * entity change on another page is an acceptable simplification, not a
   * correctness bug.
   */
  function isStale(entry: AuditLogEntry): boolean {
    const entryTime = new Date(entry.createdAt).getTime();
    return entries.some(
      (other) =>
        other.id !== entry.id && other.entityId === entry.entityId && new Date(other.createdAt).getTime() > entryTime,
    );
  }

  async function handleUndo(entry: AuditLogEntry) {
    const parts = [`Undo this ${entry.action} on ${entry.entityType} (${entry.entityId})?`];
    if (entry.entityType === "Page" && entry.action === "delete") {
      parts.push("This restores the page row only -- its blocks are not recovered.");
    }
    if (isStale(entry)) {
      parts.push("This entity has changed since this entry -- undo will still apply the older snapshot.");
    }
    if (typeof window !== "undefined" && !window.confirm(parts.join(" "))) return;

    setUndoingId(entry.id);
    try {
      const res = await fetch(`/api/audit-log/${entry.id}/undo`, { method: "POST" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to undo."));
      showSuccess(`Reverted ${entry.entityType} ${entry.entityId}.`);
      // The undo endpoint itself writes a new audit entry, so a full reload
      // (rather than a local splice) keeps the list honestly reflecting it.
      await reload({ entityType: entityTypeFilter, actorEmail: actorEmailFilter, page });
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to undo.");
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex w-fit items-center gap-2 text-xs font-medium text-muted">
          Entity type
          <select
            value={entityTypeFilter}
            onChange={(e) => setEntityTypeFilter(e.target.value as AuditEntityType | "")}
            aria-label="Filter by entity type"
            className="h-8 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary"
          >
            <option value="">All</option>
            {visibleEntityTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="flex w-fit items-center gap-2 text-xs font-medium text-muted">
          Actor
          <input
            type="text"
            value={actorEmailFilter}
            onChange={(e) => setActorEmailFilter(e.target.value)}
            list="audit-actor-options"
            placeholder="All"
            aria-label="Filter by actor email"
            className="h-8 w-56 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary"
          />
          <datalist id="audit-actor-options">
            {actorOptions.map((email) => (
              <option key={email} value={email} />
            ))}
          </datalist>
        </label>
      </div>

      {loadError && (
        <div className="rounded-md border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">{loadError}</div>
      )}

      {loading ? (
        <div className="text-sm text-muted">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-muted">
          No audit log entries yet.
        </div>
      ) : (
        <div className="overflow-hidden rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2.5 font-medium">Entity</th>
                <th className="px-4 py-2.5 font-medium">Action</th>
                <th className="px-4 py-2.5 font-medium">Actor</th>
                <th className="px-4 py-2.5 font-medium">When</th>
                <th className="px-4 py-2.5 font-medium">&nbsp;</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {entries.map((entry) => {
                const isExpanded = expanded.has(entry.id);
                const stale = isStale(entry);
                const isPageDelete = entry.entityType === "Page" && entry.action === "delete";
                const previewPayloadForEntry = getPreviewPayload(entry);
                const canViewPage = entry.entityType === "Page" && entry.pageSlug !== null;
                return (
                  <Fragment key={entry.id}>
                    <tr className="bg-surface">
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-medium text-foreground">{summarizeAuditEntry(entry)}</span>
                          <span className="text-xs text-muted">
                            {entry.entityType} ·{" "}
                            <span className="font-mono" title={entry.entityId}>
                              {entry.entityId.slice(0, 10)}
                            </span>
                          </span>
                          {entry.pageTitle && entry.pageSlug && (
                            <a
                              href={pagePath(entry.pageSlug)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary hover:underline"
                            >
                              {entry.pageTitle}
                            </a>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${ACTION_STYLES[entry.action]}`}
                        >
                          {entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted">{entry.actorEmail ?? "system"}</td>
                      <td className="px-4 py-3 whitespace-nowrap text-muted">{formatTimestamp(entry.createdAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          {previewPayloadForEntry && (
                            <button
                              type="button"
                              onClick={() => setPreviewPayload(previewPayloadForEntry)}
                              className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                            >
                              Preview
                            </button>
                          )}
                          {canViewPage && (
                            <a
                              href={pagePath(entry.pageSlug!)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                            >
                              View page
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => toggleExpanded(entry.id)}
                            aria-expanded={isExpanded}
                            className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                          >
                            {isExpanded ? "Hide" : "Details"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUndo(entry)}
                            disabled={undoingId === entry.id}
                            className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {undoingId === entry.id ? "Undoing…" : "Undo"}
                          </button>
                        </div>
                        {(stale || isPageDelete) && (
                          <div className="mt-1.5 flex flex-col items-end gap-0.5 text-right">
                            {stale && <span className="text-[11px] text-accent">⚠ Changed since this entry</span>}
                            {isPageDelete && (
                              <span className="text-[11px] text-muted">
                                Restores the page only — its blocks are not recovered.
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-2">
                        <td colSpan={5} className="px-4 py-4">
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-medium tracking-wide text-muted uppercase">Before</span>
                              <pre className="overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
                                {formatJson(entry.before)}
                              </pre>
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <span className="text-xs font-medium tracking-wide text-muted uppercase">After</span>
                              <pre className="overflow-auto rounded-md border border-border bg-surface p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
                                {formatJson(entry.after)}
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
      )}

      {!loading && entries.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted">
            Page {page} of {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => goToPage(page - 1)}
              disabled={page <= 1}
              className="flex h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => goToPage(page + 1)}
              disabled={page >= totalPages}
              className="flex h-9 items-center justify-center rounded-md border border-border-strong px-3 text-sm font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {previewPayload && <AuditPreviewModal payload={previewPayload} onClose={() => setPreviewPayload(null)} />}
    </div>
  );
}
