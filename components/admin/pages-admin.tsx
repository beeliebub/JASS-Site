"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CustomTheme, Page } from "@/app/generated/prisma/client";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";
import { EditableText } from "@/components/admin/editable-text";
import { ServerStatusTest } from "@/components/admin/server-status-test";
import { pagePath } from "@/lib/routes";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";
import {
  parseHeaderContent,
  pageUpdateSchema,
  serializeHeaderContent,
  slugSchema,
  type HeaderContent,
} from "@/lib/validation/pages";

/**
 * `preferFieldDetail` is opt-in (only createPage/saveSlug pass it): when the
 * server falls back to a genuine `validation_error` response with exactly
 * one field-level detail (e.g. the reserved-slug "api" case in
 * app/api/pages/route.ts), that detail's message is more specific than the
 * generic top-level "Request validation failed." A response carrying
 * multiple simultaneous field errors doesn't reduce to one string, so those
 * still fall back to the generic message. Other callers in this file
 * (toggle/theme/title/delete) are out of scope and keep today's behavior.
 */
async function parseError(res: Response, fallback: string, opts?: { preferFieldDetail?: boolean }) {
  const body = (await res.json().catch(() => null)) as
    | { error?: { message?: string; details?: { message: string }[] } }
    | null;
  if (opts?.preferFieldDetail && body?.error?.details?.length === 1) {
    return body.error.details[0].message;
  }
  return body?.error?.message ?? fallback;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type StatusHeaderContent = Extract<HeaderContent, { kind: "status" }>;

function RedirectEditor({
  page,
  onSave,
}: {
  page: Page;
  onSave: (redirectUrl: string | null) => Promise<void>;
}) {
  const { showError } = useToast();
  const [enabled, setEnabled] = useState(Boolean(page.redirectUrl));
  const [target, setTarget] = useState(page.redirectUrl ?? "");

  async function persist(next: string | null) {
    const previousEnabled = enabled;
    const previousTarget = target;
    setEnabled(Boolean(next));
    setTarget(next ?? "");
    try {
      await onSave(next);
    } catch (error) {
      setEnabled(previousEnabled);
      setTarget(previousTarget);
      showError(error instanceof Error ? error.message : "Failed to update redirect.");
    }
  }

  return (
    <div className="mt-2 flex min-w-0 flex-col gap-1.5 font-sans">
      <label
        className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted"
        title={page.protected ? "Protected pages cannot be redirect pages." : undefined}
      >
        <input
          type="checkbox"
          checked={enabled}
          disabled={page.protected}
          onChange={(event) => {
            if (event.target.checked) {
              setEnabled(true);
              return;
            }
            void persist(null);
          }}
        />
        Redirect page
        {page.redirectUrl && (
          <span className="rounded-full border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] font-medium normal-case tracking-normal text-accent">
            Redirect
          </span>
        )}
      </label>
      {enabled && (
        <input
          type="text"
          value={target}
          maxLength={2000}
          placeholder="/destination or https://…"
          disabled={page.protected}
          aria-label={`Redirect target for ${page.title}`}
          onChange={(event) => setTarget(event.target.value)}
          onBlur={() => {
            const next = target.trim();
            if (!next) return;
            if (!pageUpdateSchema.safeParse({ redirectUrl: next }).success) {
              showError("Redirect must be an absolute http(s) URL or a root-relative path.");
              return;
            }
            void persist(next);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 w-full min-w-0 rounded-md border border-border-strong bg-surface-2 px-2 font-mono text-xs text-foreground outline-none placeholder:text-muted focus-visible:border-primary disabled:opacity-60"
        />
      )}
    </div>
  );
}

function usesGlobalStatus(content: StatusHeaderContent): boolean {
  if (content.protocol === "manual") return false;
  return content.useGlobalStatus ?? !(content.host && content.port);
}

function HeaderContentEditor({
  page,
  onSave,
}: {
  page: Page;
  onSave: (content: HeaderContent | null) => Promise<void>;
}) {
  const { showError } = useToast();
  const [draft, setDraft] = useState<HeaderContent>(() => parseHeaderContent(page.headerContent) ?? { kind: "none" });
  const [saving, setSaving] = useState(false);

  async function persist(next: HeaderContent) {
    const previous = draft;
    setDraft(next);
    setSaving(true);
    try {
      await onSave(next.kind === "none" ? null : next);
    } catch (error) {
      setDraft(previous);
      showError(error instanceof Error ? error.message : "Failed to update header content.");
    } finally {
      setSaving(false);
    }
  }

  function updateStatus(patch: Partial<StatusHeaderContent>) {
    if (draft.kind !== "status") return;
    setDraft({ ...draft, ...patch });
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-2">
      <select
        value={draft.kind}
        onChange={(event) => {
          const kind = event.target.value as HeaderContent["kind"];
          if (kind === "none") void persist({ kind: "none" });
          if (kind === "status") void persist({ kind: "status", protocol: "minecraft-java", useGlobalStatus: true });
          if (kind === "text") setDraft({ kind: "text", text: "" });
        }}
        disabled={saving}
        aria-label={`Header content for ${page.title}`}
        className="h-8 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
      >
        <option value="none">None</option>
        <option value="status">Server status</option>
        <option value="text">Text</option>
      </select>

      {draft.kind === "text" && (
        <input
          type="text"
          value={draft.text}
          maxLength={200}
          placeholder="Header text"
          disabled={saving}
          aria-label={`Header text for ${page.title}`}
          onChange={(event) => setDraft({ kind: "text", text: event.target.value })}
          onBlur={() => {
            const text = draft.text.trim();
            void persist(text ? { kind: "text", text } : { kind: "none" });
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
          className="h-8 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none placeholder:text-muted focus-visible:border-primary disabled:opacity-60"
        />
      )}

      {draft.kind === "status" && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
            Protocol
            <select
              value={draft.protocol ?? "minecraft-java"}
              disabled={saving}
              aria-label={`Status protocol for ${page.title}`}
              onChange={(event) => {
                const protocol = event.target.value as NonNullable<StatusHeaderContent["protocol"]>;
                if (protocol === "manual") {
                  void persist({
                    ...draft,
                    protocol,
                    useGlobalStatus: false,
                    host: undefined,
                    port: undefined,
                  });
                } else {
                  void persist({
                    ...draft,
                    protocol,
                    useGlobalStatus: true,
                    manualOnline: undefined,
                    manualPlayers: undefined,
                    manualMaxPlayers: undefined,
                  });
                }
              }}
              className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
            >
              <option value="minecraft-java">Minecraft (Java)</option>
              <option value="manual">Manual</option>
            </select>
          </label>
          <input
            type="text"
            value={draft.label ?? ""}
            maxLength={80}
            placeholder="Optional label"
            disabled={saving}
            aria-label={`Status label for ${page.title}`}
            onChange={(event) => updateStatus({ label: event.target.value })}
            onBlur={() => {
              const label = draft.label?.trim();
              void persist({ ...draft, label: label || undefined });
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
            className="h-8 rounded-md border border-border-strong bg-surface px-2 text-xs text-foreground outline-none placeholder:text-muted focus-visible:border-primary disabled:opacity-60"
          />
          {draft.protocol === "manual" ? (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex items-center gap-2 pb-1 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={draft.manualOnline ?? false}
                  disabled={saving}
                  onChange={(event) => void persist({ ...draft, manualOnline: event.target.checked })}
                />
                Online
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                Players
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={draft.manualPlayers ?? 0}
                  disabled={saving}
                  aria-label={`Manual player count for ${page.title}`}
                  onChange={(event) => updateStatus({ manualPlayers: event.target.value ? Number(event.target.value) : undefined })}
                  onBlur={() => {
                    const manualPlayers = draft.manualPlayers ?? 0;
                    void persist({ ...draft, manualPlayers });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="h-8 w-20 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wide text-muted">
                Max players
                <input
                  type="number"
                  min={0}
                  max={100000}
                  value={draft.manualMaxPlayers ?? 0}
                  disabled={saving}
                  aria-label={`Manual max players for ${page.title}`}
                  onChange={(event) => updateStatus({ manualMaxPlayers: event.target.value ? Number(event.target.value) : undefined })}
                  onBlur={() => {
                    const manualMaxPlayers = draft.manualMaxPlayers ?? 0;
                    void persist({ ...draft, manualMaxPlayers });
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  className="h-8 w-20 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
                />
              </label>
            </div>
          ) : (
            <>
              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={usesGlobalStatus(draft)}
                  disabled={saving}
                  onChange={(event) => {
                    const next: StatusHeaderContent = {
                      ...draft,
                      useGlobalStatus: event.target.checked,
                      port: event.target.checked ? draft.port : (draft.port ?? 25565),
                    };
                    void persist(next);
                  }}
                />
                Use global server
              </label>
              {!usesGlobalStatus(draft) && (
                <div className="flex flex-wrap items-end gap-2">
              <input
                type="text"
                value={draft.host ?? ""}
                maxLength={300}
                placeholder="mc.example.net"
                disabled={saving}
                aria-label={`Status host for ${page.title}`}
                onChange={(event) => updateStatus({ host: event.target.value })}
                onBlur={() => {
                  const host = draft.host?.trim();
                  void persist({ ...draft, host: host || undefined });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="h-8 min-w-0 flex-1 basis-40 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none placeholder:text-muted focus-visible:border-primary disabled:opacity-60"
              />
              <input
                type="number"
                min={1}
                max={65535}
                value={draft.port ?? ""}
                disabled={saving}
                aria-label={`Status port for ${page.title}`}
                onChange={(event) => updateStatus({ port: event.target.value ? Number(event.target.value) : undefined })}
                onBlur={() => {
                  const port = draft.port ? Math.min(Math.max(draft.port, 1), 65535) : undefined;
                  void persist({ ...draft, port });
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
                className="h-8 w-20 min-w-0 rounded-md border border-border-strong bg-surface px-2 font-mono text-xs text-foreground outline-none focus-visible:border-primary disabled:opacity-60"
              />
                  <ServerStatusTest host={draft.host} port={draft.port} disabled={saving} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function PagesAdmin({
  initialPages,
  initialCustomThemes,
}: {
  initialPages: Page[];
  initialCustomThemes: CustomTheme[];
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [pages, setPages] = useState(initialPages);
  const [creating, setCreating] = useState(false);
  const customThemes = initialCustomThemes;

  async function togglePublished(page: Page) {
    const previous = pages;
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, published: !p.published } : p)));
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ published: !page.published }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to update page."));
    } catch (error) {
      setPages(previous);
      showError(error instanceof Error ? error.message : "Failed to update page.");
    }
  }

  /** Parses the combined theme `<select>`'s string value into the mutually
   * exclusive `{theme, customThemeId}` pair the API expects: "" is the
   * default (both null), a bare built-in id is a built-in theme, and
   * `custom:<id>` is a custom theme. */
  function parseThemeSelection(value: string): { theme: ThemeId | null; customThemeId: string | null } {
    if (value === "") return { theme: null, customThemeId: null };
    if (value.startsWith("custom:")) return { theme: null, customThemeId: value.slice("custom:".length) };
    return { theme: value as ThemeId, customThemeId: null };
  }

  async function changeThemeSelection(page: Page, value: string) {
    const { theme, customThemeId } = parseThemeSelection(value);
    const previous = pages;
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, theme, customThemeId } : p)));
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme, customThemeId }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to update page theme."));
    } catch (error) {
      setPages(previous);
      showError(error instanceof Error ? error.message : "Failed to update page theme.");
    }
  }

  async function saveTitle(page: Page, next: string) {
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: next }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to update page title."));
    // title isn't part of EditableText's own display state -- it also feeds
    // deletePage's confirm dialog and other labels in this row, so update it
    // here on success too (same reasoning as saveSlug below).
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, title: next } : p)));
  }

  async function saveSlug(page: Page, nextSegment: string, parentSlug = "") {
    const next = parentSlug ? `${parentSlug}/${nextSegment}` : nextSegment;
    const parsed = slugSchema.safeParse(next);
    if (!parsed.success) {
      throw new Error("Slug must use lowercase kebab-case segments separated by /, with no more than 3 segments.");
    }
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: parsed.data }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to update page slug.", { preferFieldDetail: true }));
    // The slug isn't part of EditableText's own display state -- it also
    // feeds the "Edit" button href and the /-prefixed slug text below, both
    // rendered from `pages`, so update it here on success too.
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, slug: parsed.data } : p)));
  }

  async function saveHeaderContent(page: Page, content: HeaderContent | null) {
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ headerContent: content }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to update header content."));
    const headerContent = serializeHeaderContent(content) ?? null;
    setPages((prev) => prev.map((candidate) => (candidate.id === page.id ? { ...candidate, headerContent } : candidate)));
  }

  async function deletePage(page: Page) {
    if (typeof window !== "undefined" && !window.confirm(`Delete "${page.title}"? This can't be undone.`)) return;
    const previous = pages;
    setPages((prev) => prev.filter((p) => p.id !== page.id));
    try {
      const res = await fetch(`/api/pages/${page.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete page."));
    } catch (error) {
      setPages(previous);
      showError(error instanceof Error ? error.message : "Failed to delete page.");
    }
  }

  async function createPage() {
    const title = typeof window !== "undefined" ? window.prompt("Title for the new page?") : null;
    if (!title || !title.trim()) return;

    setCreating(true);
    try {
      const res = await fetch("/api/pages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), slug: slugify(title) || undefined }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to create page.", { preferFieldDetail: true }));
      const { data } = (await res.json()) as { data: Page };
      router.push(pagePath(data.slug));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create page.");
    } finally {
      setCreating(false);
    }
  }

  async function saveRedirect(page: Page, redirectUrl: string | null) {
    const res = await fetch(`/api/pages/${page.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ redirectUrl }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to update redirect."));
    setPages((prev) => prev.map((candidate) => (candidate.id === page.id ? { ...candidate, redirectUrl } : candidate)));
  }

  const pagesForDisplay = [...pages].sort((a, b) => a.slug.localeCompare(b.slug));

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Theme</th>
              <th className="px-3 py-2.5 font-medium">Header</th>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pagesForDisplay.map((page) => {
              const slugParts = page.slug.split("/");
              const parentSlug = slugParts.slice(0, -1).join("/");
              const leafSlug = slugParts[slugParts.length - 1];
              const depth = slugParts.length - 1;

              return (
              <tr key={page.id} className="bg-surface">
                <td
                  className="px-4 py-3 font-medium text-foreground"
                  style={{ paddingLeft: `${16 + depth * 16}px` }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <EditableText
                      value={page.title}
                      onSave={(next) => saveTitle(page, next)}
                      label={`title for ${page.title}`}
                    />
                    {page.protected && (
                      <span className="rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                        Protected
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">
                  {page.protected ? (
                    `/${page.slug === "home" ? "" : page.slug}`
                  ) : (
                    <span className="inline-flex items-center">
                      /
                      {parentSlug && <span className="text-muted/60">{parentSlug}/</span>}
                      <EditableText
                        value={leafSlug}
                        onSave={(next) => saveSlug(page, next, parentSlug)}
                        label={`slug for ${page.title}`}
                        className="font-mono text-xs"
                      />
                    </span>
                  )}
                  <RedirectEditor page={page} onSave={(redirectUrl) => saveRedirect(page, redirectUrl)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => togglePublished(page)}
                      disabled={page.protected}
                      title={
                        page.protected
                          ? "Protected pages always render regardless of this setting"
                          : undefined
                      }
                      aria-pressed={page.published}
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        page.published
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border-strong text-muted hover:text-foreground"
                      }`}
                    >
                      {page.published ? "Published" : "Draft"}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <select
                    value={page.customThemeId ? `custom:${page.customThemeId}` : (page.theme ?? "")}
                    onChange={(e) => changeThemeSelection(page, e.target.value)}
                    aria-label={`Theme for ${page.title}`}
                    className="h-8 w-full min-w-0 max-w-40 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary"
                  >
                    <option value="">Default</option>
                    {THEME_IDS.map((id) => (
                      <option key={id} value={id}>
                        {THEMES[id].label}
                      </option>
                    ))}
                    {customThemes.length > 0 && (
                      <optgroup label="Custom">
                        {customThemes.map((ct) => (
                          <option key={ct.id} value={`custom:${ct.id}`}>
                            {ct.name}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </td>
                <td className="px-3 py-3 align-top">
                  <HeaderContentEditor page={page} onSave={(content) => saveHeaderContent(page, content)} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={pagePath(page.slug)}
                      className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                    >
                      Edit
                    </Link>
                    {!page.protected && <DeleteButton label="Delete page" onClick={() => deletePage(page)} />}
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <button
        type="button"
        onClick={createPage}
        disabled={creating}
        className="flex h-10 w-fit items-center justify-center gap-1.5 rounded-md border border-dashed border-border-strong px-4 text-sm font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
      >
        {creating ? "Creating…" : "New page"}
      </button>
    </div>
  );
}
