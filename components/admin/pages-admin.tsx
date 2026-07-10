"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Page } from "@/app/generated/prisma/client";
import { useToast } from "@/components/admin/toast";
import { DeleteButton } from "@/components/admin/list-controls";
import { pagePath } from "@/lib/routes";
import { THEME_IDS, THEMES, type ThemeId } from "@/lib/themes";

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function PagesAdmin({ initialPages }: { initialPages: Page[] }) {
  const router = useRouter();
  const { showError } = useToast();
  const [pages, setPages] = useState(initialPages);
  const [creating, setCreating] = useState(false);

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

  async function changeTheme(page: Page, theme: ThemeId | null) {
    const previous = pages;
    setPages((prev) => prev.map((p) => (p.id === page.id ? { ...p, theme } : p)));
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to update page theme."));
    } catch (error) {
      setPages(previous);
      showError(error instanceof Error ? error.message : "Failed to update page theme.");
    }
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
      if (!res.ok) throw new Error(await parseError(res, "Failed to create page."));
      const { data } = (await res.json()) as { data: Page };
      router.push(pagePath(data.slug));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create page.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Title</th>
              <th className="px-4 py-2.5 font-medium">Slug</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 font-medium">Theme</th>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {pages.map((page) => (
              <tr key={page.id} className="bg-surface">
                <td className="px-4 py-3 font-medium text-foreground">
                  {page.title}
                  {page.protected && (
                    <span className="ml-2 rounded-full border border-border-strong px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Protected
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-muted">/{page.slug === "home" ? "" : page.slug}</td>
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => togglePublished(page)}
                    aria-pressed={page.published}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                      page.published
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-border-strong text-muted hover:text-foreground"
                    }`}
                  >
                    {page.published ? "Published" : "Draft"}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={page.theme ?? ""}
                    onChange={(e) => changeTheme(page, e.target.value === "" ? null : (e.target.value as ThemeId))}
                    aria-label={`Theme for ${page.title}`}
                    className="h-8 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary"
                  >
                    <option value="">Default</option>
                    {THEME_IDS.map((id) => (
                      <option key={id} value={id}>
                        {THEMES[id].label}
                      </option>
                    ))}
                  </select>
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
            ))}
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
