"use client";

import { useState, type FormEvent } from "react";
import { useToast } from "@/components/admin/toast";
import { AddButton, DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

type PageOption = { id: string; title: string; slug: string };

export type NavChildItem = {
  id: string;
  label: string;
  href: string | null;
  pageId: string | null;
  order: number;
};

export type NavTopItem = NavChildItem & { children: NavChildItem[] };

type FormValues = {
  label: string;
  targetType: "page" | "url";
  pageId: string;
  href: string;
};

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function toValues(item?: NavChildItem): FormValues {
  return {
    label: item?.label ?? "",
    targetType: item?.href ? "url" : "page",
    pageId: item?.pageId ?? "",
    href: item?.href ?? "",
  };
}

function NavItemForm({
  pages,
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  pages: PageOption[];
  initial: FormValues;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 rounded-md border border-dashed border-primary/60 bg-surface p-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium uppercase tracking-wide text-muted">Label</label>
        <input
          required
          value={values.label}
          onChange={(e) => setField("label", e.target.value)}
          className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-foreground outline-none focus-visible:border-primary"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted">Target</span>
        <div className="flex gap-4 text-sm text-foreground">
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={values.targetType === "page"}
              onChange={() => setField("targetType", "page")}
              className="accent-primary"
            />
            Internal page
          </label>
          <label className="flex items-center gap-1.5">
            <input
              type="radio"
              checked={values.targetType === "url"}
              onChange={() => setField("targetType", "url")}
              className="accent-primary"
            />
            External URL
          </label>
        </div>

        {values.targetType === "page" ? (
          <select
            required
            value={values.pageId}
            onChange={(e) => setField("pageId", e.target.value)}
            className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 text-sm text-foreground outline-none focus-visible:border-primary"
          >
            <option value="" disabled>
              Select a page…
            </option>
            {pages.map((p) => (
              <option key={p.id} value={p.id}>
                {p.title} (/{p.slug === "home" ? "" : p.slug})
              </option>
            ))}
          </select>
        ) : (
          <input
            required
            value={values.href}
            onChange={(e) => setField("href", e.target.value)}
            placeholder="https://example.com"
            className="h-9 rounded-md border border-border-strong bg-surface-2 px-2.5 font-mono text-xs text-foreground outline-none focus-visible:border-primary"
          />
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex h-9 items-center justify-center rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex h-9 items-center justify-center rounded-md border border-border-strong px-3.5 text-sm font-medium text-foreground transition hover:bg-surface-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function NavAdmin({ initialItems, pages }: { initialItems: NavTopItem[]; pages: PageOption[] }) {
  const { showError } = useToast();
  const [items, setItems] = useState(initialItems);
  const [addingTop, setAddingTop] = useState(false);
  const [addingChildOf, setAddingChildOf] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const sorted = [...items].sort((a, b) => a.order - b.order);

  function bodyFrom(values: FormValues, order: number, parentId?: string) {
    return {
      label: values.label,
      order,
      parentId,
      ...(values.targetType === "page" ? { pageId: values.pageId } : { href: values.href }),
    };
  }

  async function createTop(values: FormValues) {
    const nextOrder = items.length ? Math.max(...items.map((i) => i.order)) + 1 : 0;
    const res = await fetch("/api/nav-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFrom(values, nextOrder)),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to add nav item."));
    const { data } = (await res.json()) as { data: NavChildItem };
    setItems((prev) => [...prev, { ...data, children: [] }]);
    setAddingTop(false);
  }

  async function createChild(parentId: string, values: FormValues) {
    const parent = items.find((i) => i.id === parentId);
    const nextOrder = parent && parent.children.length ? Math.max(...parent.children.map((c) => c.order)) + 1 : 0;
    const res = await fetch("/api/nav-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(bodyFrom(values, nextOrder, parentId)),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to add dropdown item."));
    const { data } = (await res.json()) as { data: NavChildItem };
    setItems((prev) => prev.map((i) => (i.id === parentId ? { ...i, children: [...i.children, data] } : i)));
    setAddingChildOf(null);
  }

  async function updateItem(id: string, values: FormValues, parentId?: string) {
    const res = await fetch(`/api/nav-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        label: values.label,
        ...(values.targetType === "page" ? { pageId: values.pageId, href: null } : { href: values.href, pageId: null }),
      }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save nav item."));
    const { data } = (await res.json()) as { data: NavChildItem };
    setItems((prev) =>
      parentId
        ? prev.map((i) => (i.id === parentId ? { ...i, children: i.children.map((c) => (c.id === id ? data : c)) } : i))
        : prev.map((i) => (i.id === id ? { ...i, ...data } : i)),
    );
    setEditingId(null);
  }

  async function deleteItem(id: string, parentId?: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this nav item?")) return;
    const previous = items;
    setItems((prev) =>
      parentId
        ? prev.map((i) => (i.id === parentId ? { ...i, children: i.children.filter((c) => c.id !== id) } : i))
        : prev.filter((i) => i.id !== id),
    );
    try {
      const res = await fetch(`/api/nav-items/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete nav item."));
    } catch (error) {
      setItems(previous);
      showError(error instanceof Error ? error.message : "Failed to delete nav item.");
    }
  }

  async function moveTop(id: string, direction: -1 | 1) {
    const idx = sorted.findIndex((i) => i.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const previous = items;
    setItems((prev) => prev.map((i) => (i.id === a.id ? { ...i, order: b.order } : i.id === b.id ? { ...i, order: a.order } : i)));
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/nav-items/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: b.order }) }),
        fetch(`/api/nav-items/${b.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: a.order }) }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder.");
    } catch (error) {
      setItems(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder.");
    }
  }

  async function moveChild(parentId: string, id: string, direction: -1 | 1) {
    const parent = items.find((i) => i.id === parentId);
    if (!parent) return;
    const children = [...parent.children].sort((a, b) => a.order - b.order);
    const idx = children.findIndex((c) => c.id === id);
    const swapIdx = idx + direction;
    if (idx === -1 || swapIdx < 0 || swapIdx >= children.length) return;
    const a = children[idx];
    const b = children[swapIdx];
    const previous = items;
    setItems((prev) =>
      prev.map((i) =>
        i.id === parentId
          ? { ...i, children: i.children.map((c) => (c.id === a.id ? { ...c, order: b.order } : c.id === b.id ? { ...c, order: a.order } : c)) }
          : i,
      ),
    );
    try {
      const [resA, resB] = await Promise.all([
        fetch(`/api/nav-items/${a.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: b.order }) }),
        fetch(`/api/nav-items/${b.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ order: a.order }) }),
      ]);
      if (!resA.ok || !resB.ok) throw new Error("Failed to reorder.");
    } catch (error) {
      setItems(previous);
      showError(error instanceof Error ? error.message : "Failed to reorder.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {sorted.map((item, i) => {
        const children = [...item.children].sort((a, b) => a.order - b.order);
        return (
          <div key={item.id} className="rounded-md border border-border bg-surface">
            {editingId === item.id ? (
              <div className="p-3">
                <NavItemForm
                  pages={pages}
                  initial={toValues(item)}
                  onSubmit={(v) => updateItem(item.id, v)}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{item.label}</p>
                  <p className="truncate font-mono text-xs text-muted">{item.href ?? "internal page"}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <MoveUpButton disabled={i === 0} onClick={() => moveTop(item.id, -1)} />
                  <MoveDownButton disabled={i === sorted.length - 1} onClick={() => moveTop(item.id, 1)} />
                  <button
                    type="button"
                    onClick={() => setEditingId(item.id)}
                    className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                  >
                    Edit
                  </button>
                  <DeleteButton label="Delete nav item" onClick={() => deleteItem(item.id)} />
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2 border-t border-border px-4 py-3 pl-8">
              {children.map((child, ci) =>
                editingId === child.id ? (
                  <NavItemForm
                    key={child.id}
                    pages={pages}
                    initial={toValues(child)}
                    onSubmit={(v) => updateItem(child.id, v, item.id)}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save"
                  />
                ) : (
                  <div key={child.id} className="flex items-center justify-between gap-3 rounded-md bg-surface-2 px-3 py-2">
                    <div className="min-w-0">
                      <p className="text-sm text-foreground">{child.label}</p>
                      <p className="truncate font-mono text-[11px] text-muted">{child.href ?? "internal page"}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <MoveUpButton disabled={ci === 0} onClick={() => moveChild(item.id, child.id, -1)} />
                      <MoveDownButton disabled={ci === children.length - 1} onClick={() => moveChild(item.id, child.id, 1)} />
                      <button
                        type="button"
                        onClick={() => setEditingId(child.id)}
                        className="flex h-8 items-center justify-center rounded-md border border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary"
                      >
                        Edit
                      </button>
                      <DeleteButton label="Delete dropdown item" onClick={() => deleteItem(child.id, item.id)} />
                    </div>
                  </div>
                ),
              )}

              {addingChildOf === item.id ? (
                <NavItemForm
                  pages={pages}
                  initial={toValues()}
                  onSubmit={(v) => createChild(item.id, v)}
                  onCancel={() => setAddingChildOf(null)}
                  submitLabel="Add"
                />
              ) : (
                <AddButton onClick={() => setAddingChildOf(item.id)} className="w-fit">
                  Add dropdown item
                </AddButton>
              )}
            </div>
          </div>
        );
      })}

      {addingTop ? (
        <NavItemForm pages={pages} initial={toValues()} onSubmit={createTop} onCancel={() => setAddingTop(false)} submitLabel="Add" />
      ) : (
        <AddButton onClick={() => setAddingTop(true)} className="w-fit">
          Add top-level item
        </AddButton>
      )}
    </div>
  );
}
