"use client";

import { useState, type FormEvent } from "react";
import { EditableText } from "@/components/admin/editable-text";
import { DeleteButton, AddButton } from "@/components/admin/list-controls";
import { useToast } from "@/components/admin/toast";
import { DEFAULT_TAG_COLOR } from "@/lib/validation/content";

export type TagRow = { id: string; name: string; color: string; postCount: number };

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function sortByName(a: TagRow, b: TagRow) {
  return a.name.localeCompare(b.name);
}

export function TagsAdmin({ initialTags }: { initialTags: TagRow[] }) {
  const { showError, showSuccess } = useToast();
  const [tags, setTags] = useState(initialTags);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_TAG_COLOR);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  async function renameTag(tag: TagRow, nextName: string) {
    const res = await fetch(`/api/tags/${tag.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: nextName }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to rename tag."));
    const { data } = (await res.json()) as { data: { name: string } };
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, name: data.name } : t)).sort(sortByName));
  }

  async function recolorTag(tag: TagRow, nextColor: string) {
    const previous = tags;
    setTags((prev) => prev.map((t) => (t.id === tag.id ? { ...t, color: nextColor } : t)));
    try {
      const res = await fetch(`/api/tags/${tag.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color: nextColor }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to recolor tag."));
    } catch (error) {
      setTags(previous);
      showError(error instanceof Error ? error.message : "Failed to recolor tag.");
    }
  }

  async function deleteTag(tag: TagRow) {
    if (typeof window !== "undefined" && !window.confirm(`Delete the "${tag.name}" tag? This can't be undone.`)) {
      return;
    }
    setPendingDeleteId(tag.id);
    try {
      const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete tag."));
      showSuccess(`Deleted "${tag.name}".`);
      setTags((prev) => prev.filter((t) => t.id !== tag.id));
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to delete tag.");
    } finally {
      setPendingDeleteId(null);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: newColor }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to create tag."));
      const { data } = (await res.json()) as { data: { id: string; name: string; color: string } };
      setTags((prev) => [...prev, { ...data, postCount: 0 }].sort(sortByName));
      setNewName("");
      setNewColor(DEFAULT_TAG_COLOR);
      showSuccess(`Created "${data.name}".`);
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create tag.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="overflow-hidden rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-4 py-2.5 font-medium">Name</th>
              <th className="px-4 py-2.5 font-medium">Color</th>
              <th className="px-4 py-2.5 font-medium">Posts</th>
              <th className="px-4 py-2.5 font-medium">&nbsp;</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {tags.length === 0 && (
              <tr className="bg-surface">
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-muted">
                  No tags yet.
                </td>
              </tr>
            )}
            {tags.map((tag) => (
              <tr key={tag.id} className="bg-surface">
                <td className="px-4 py-3 font-medium text-foreground">
                  <EditableText
                    value={tag.name}
                    onSave={(next) => renameTag(tag, next)}
                    label={`Tag name for ${tag.name}`}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={tag.color}
                      onChange={(e) => recolorTag(tag, e.target.value)}
                      aria-label={`Color for ${tag.name}`}
                      className="h-8 w-10 cursor-pointer rounded-md border border-border-strong bg-surface-2"
                    />
                    <span className="font-mono text-xs text-muted">{tag.color}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-muted">{tag.postCount}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {tag.postCount === 0 && (
                      <DeleteButton
                        label="Delete tag"
                        onClick={() => deleteTag(tag)}
                        disabled={pendingDeleteId === tag.id}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          New tag name
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Announcement"
            className="h-9 w-56 rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none focus-visible:border-primary"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
          Color
          <input
            type="color"
            value={newColor}
            onChange={(e) => setNewColor(e.target.value)}
            aria-label="New tag color"
            className="h-9 w-14 cursor-pointer rounded-md border border-border-strong bg-surface-2"
          />
        </label>
        <AddButton type="submit" disabled={!newName.trim() || creating}>
          {creating ? "Creating…" : "New tag"}
        </AddButton>
      </form>
    </div>
  );
}
