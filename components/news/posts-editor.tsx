"use client";

import { useEffect, useState, type FormEvent, type KeyboardEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { NewsPostItem } from "@/components/news/news-post-item";
import { DeleteButton, AddButton } from "@/components/admin/list-controls";
import { DEFAULT_TAG_COLOR } from "@/lib/validation/content";

export type ClientTag = { id: string; name: string; color: string };

export type ClientPost = {
  id: string;
  slug: string;
  tags: ClientTag[];
  title: string;
  excerpt: string;
  body: string | null;
  publishedAt: string;
  author: string | null;
};

export type PostListData = { limit?: number | null };

type FormValues = {
  slug: string;
  tagIds: string[];
  title: string;
  excerpt: string;
  body: string;
  publishedAt: string;
  author: string;
};

const fieldClassName =
  "h-11 rounded-md border border-border-strong bg-surface-2 px-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted focus-visible:border-primary";
const labelClassName = "text-xs font-medium uppercase tracking-wide text-muted";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sortPosts(posts: ClientPost[]) {
  return [...posts].sort((a, b) => (a.publishedAt < b.publishedAt ? 1 : a.publishedAt > b.publishedAt ? -1 : 0));
}

async function parseError(res: Response, fallback: string) {
  const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? fallback;
}

function emptyForm(): FormValues {
  return {
    slug: "",
    tagIds: [],
    title: "",
    excerpt: "",
    body: "",
    publishedAt: new Date().toISOString().slice(0, 10),
    author: "",
  };
}

function toForm(post: ClientPost): FormValues {
  return {
    slug: post.slug,
    tagIds: post.tags.map((t) => t.id),
    title: post.title,
    excerpt: post.excerpt,
    body: post.body ?? "",
    publishedAt: post.publishedAt.slice(0, 10),
    author: post.author ?? "",
  };
}

/** Toggleable colored chip, reusing TagPill's visual language (border/bg at
 * reduced opacity, full-strength text, parameterized by the tag's own
 * stored color) but as an interactive `<button>` instead of a static
 * `<span>` -- selected state adds a solid background so it reads clearly
 * against a page full of same-shaped unselected chips. */
function TagChip({
  tag,
  selected,
  onToggle,
}: {
  tag: ClientTag;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      className="rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider transition motion-safe:active:scale-95"
      style={
        selected
          ? { borderColor: tag.color, backgroundColor: tag.color, color: "#0a0d0b" }
          : { borderColor: `${tag.color}4d`, backgroundColor: `${tag.color}1a`, color: tag.color }
      }
    >
      {tag.name}
    </button>
  );
}

/** Exported for reuse by `components/blocks/post-display-block.tsx`, which
 * needs the same tag multi-select UI (bound to a block's `tagIds` instead of
 * a `PostForm`'s draft) without duplicating it. */
export function TagPicker({
  availableTags,
  selectedIds,
  onChange,
  onTagCreated,
}: {
  availableTags: ClientTag[];
  selectedIds: string[];
  onChange: (next: string[]) => void;
  onTagCreated: (tag: ClientTag) => void;
}) {
  const { showError } = useToast();
  const [newTagName, setNewTagName] = useState("");
  const [creating, setCreating] = useState(false);

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter((existing) => existing !== id) : [...selectedIds, id]);
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color: DEFAULT_TAG_COLOR }),
      });
      if (!res.ok) throw new Error(await parseError(res, "Failed to create tag."));
      const { data } = (await res.json()) as { data: ClientTag };
      onTagCreated(data);
      onChange([...selectedIds, data.id]);
      setNewTagName("");
    } catch (error) {
      showError(error instanceof Error ? error.message : "Failed to create tag.");
    } finally {
      setCreating(false);
    }
  }

  function handleNewTagKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      void createTag();
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {availableTags.map((tag) => (
          <TagChip key={tag.id} tag={tag} selected={selectedIds.includes(tag.id)} onToggle={() => toggle(tag.id)} />
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={newTagName}
          onChange={(e) => setNewTagName(e.target.value)}
          onKeyDown={handleNewTagKeyDown}
          placeholder="New tag name"
          aria-label="New tag name"
          className="h-8 w-40 rounded-md border border-border-strong bg-surface-2 px-2 text-xs text-foreground outline-none focus-visible:border-primary"
        />
        <button
          type="button"
          onClick={createTag}
          disabled={!newTagName.trim() || creating}
          className="flex h-8 items-center justify-center rounded-md border border-dashed border-border-strong px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {creating ? "Adding…" : "Add tag"}
        </button>
      </div>
    </div>
  );
}

function PostForm({
  initial,
  availableTags,
  onTagCreated,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormValues;
  // Site-wide tags (across every Post List block, not just this one) --
  // tags are the one thing that stay a shared vocabulary even though posts
  // themselves are owned per-block.
  availableTags: ClientTag[];
  onTagCreated: (tag: ClientTag) => void;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
  submitLabel: string;
}) {
  const [values, setValues] = useState(initial);
  const [slugTouched, setSlugTouched] = useState(Boolean(initial.slug));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function setField<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function handleTitleChange(next: string) {
    setField("title", next);
    if (!slugTouched) setField("slug", slugify(next));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (values.tagIds.length === 0) {
      setError("At least one tag is required.");
      return;
    }
    setSaving(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save post.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex flex-col gap-4 rounded-lg border border-dashed border-primary/60 bg-surface p-5 sm:p-6"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-title" className={labelClassName}>
            Title
          </label>
          <input
            id="post-title"
            required
            value={values.title}
            onChange={(e) => handleTitleChange(e.target.value)}
            className={fieldClassName}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-slug" className={labelClassName}>
            Slug
          </label>
          <input
            id="post-slug"
            required
            value={values.slug}
            onChange={(e) => {
              setSlugTouched(true);
              setField("slug", e.target.value);
            }}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Lowercase kebab-case, e.g. patch-notes-1"
            className={`${fieldClassName} font-mono`}
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <span className={labelClassName}>Tags</span>
          <TagPicker
            availableTags={availableTags}
            selectedIds={values.tagIds}
            onChange={(next) => setField("tagIds", next)}
            onTagCreated={onTagCreated}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-date" className={labelClassName}>
            Published
          </label>
          <input
            id="post-date"
            type="date"
            required
            value={values.publishedAt}
            onChange={(e) => setField("publishedAt", e.target.value)}
            className={fieldClassName}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-author" className={labelClassName}>
            Author (optional)
          </label>
          <input
            id="post-author"
            value={values.author}
            onChange={(e) => setField("author", e.target.value)}
            className={fieldClassName}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-excerpt" className={labelClassName}>
          Excerpt
        </label>
        <textarea
          id="post-excerpt"
          required
          rows={2}
          value={values.excerpt}
          onChange={(e) => setField("excerpt", e.target.value)}
          className={`${fieldClassName} h-auto resize-y py-2`}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="post-body" className={labelClassName}>
          Body (markdown, optional)
        </label>
        <textarea
          id="post-body"
          rows={6}
          value={values.body}
          onChange={(e) => setField("body", e.target.value)}
          className={`${fieldClassName} h-auto resize-y py-2 font-mono text-xs`}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={saving}
          className="flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Saving…" : submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="flex h-10 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition hover:bg-surface-2 motion-safe:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

export function PostsEditor({
  initialPosts,
  data,
  onSaveData,
  blockId,
}: {
  initialPosts: ClientPost[];
  data: PostListData;
  onSaveData: (next: PostListData) => Promise<void>;
  blockId: string;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [posts, setPosts] = useState(() => sortPosts(initialPosts));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [limitDraft, setLimitDraft] = useState(data.limit != null ? String(data.limit) : "");
  // Purely local, ephemeral filter for the visitor-facing view -- this is the
  // *only* tag filter left (no persisted admin-curation equivalent): a Post
  // List block always shows all of its own posts in edit mode, and this is
  // just a way to browse/narrow them when actually viewing the page.
  const [visitorTagId, setVisitorTagId] = useState<string | null>(null);
  // Tags are the one thing shared across every Post List block on the site
  // (posts themselves are not) -- fetched once, admin-only, so PostForm can
  // offer every existing tag as a toggleable chip when authoring a post in
  // *any* block.
  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);

  useEffect(() => {
    if (!isAdmin || !editMode) return;
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load tags."))))
      .then((body: { data: ClientTag[] }) => setAvailableTags(body.data))
      .catch(() => {
        /* Non-critical: PostForm just falls back to showing no existing-tag chips. */
      });
  }, [isAdmin, editMode]);

  function handleTagCreated(tag: ClientTag) {
    setAvailableTags((prev) => (prev.some((t) => t.id === tag.id) ? prev : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name))));
  }

  if (!isAdmin || !editMode) {
    // `limit` caps how many of this instance's own posts are in scope at
    // all; the visitor's own tag choice then narrows *within* that already-
    // capped set, rather than re-expanding it.
    const scoped = data.limit ? posts.slice(0, data.limit) : posts;
    const visitorTags = new Map<string, ClientTag>();
    for (const post of scoped) {
      for (const tag of post.tags) visitorTags.set(tag.id, tag);
    }
    const sortedVisitorTags = Array.from(visitorTags.values()).sort((a, b) => a.name.localeCompare(b.name));
    const limited = visitorTagId ? scoped.filter((p) => p.tags.some((t) => t.id === visitorTagId)) : scoped;
    const latestPostId = posts[0]?.id;

    return (
      <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
        {sortedVisitorTags.length > 1 && (
          <label className="flex w-fit flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Filter by tag
            <select
              value={visitorTagId ?? ""}
              onChange={(e) => setVisitorTagId(e.target.value || null)}
              className="h-9 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
            >
              <option value="">All tags</option>
              {sortedVisitorTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <ol className="flex flex-col gap-4 sm:gap-5">
          {limited.map((post) => (
            <li key={post.slug}>
              <NewsPostItem post={{ ...post, publishedAt: new Date(post.publishedAt) }} featured={post.id === latestPostId} />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  async function createPost(values: FormValues) {
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        blockId,
        slug: values.slug,
        tagIds: values.tagIds,
        title: values.title,
        excerpt: values.excerpt,
        body: values.body || null,
        publishedAt: values.publishedAt,
        author: values.author || null,
      }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to create post."));
    const { data } = (await res.json()) as { data: ClientPost };
    setPosts((prev) => sortPosts([...prev, data]));
    setEditingId(null);
  }

  async function updatePost(id: string, values: FormValues) {
    const res = await fetch(`/api/posts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slug: values.slug,
        tagIds: values.tagIds,
        title: values.title,
        excerpt: values.excerpt,
        body: values.body || null,
        publishedAt: values.publishedAt,
        author: values.author || null,
      }),
    });
    if (!res.ok) throw new Error(await parseError(res, "Failed to save post."));
    const { data } = (await res.json()) as { data: ClientPost };
    setPosts((prev) => sortPosts(prev.map((p) => (p.id === id ? data : p))));
    setEditingId(null);
  }

  async function deletePost(id: string) {
    if (typeof window !== "undefined" && !window.confirm("Delete this announcement?")) return;
    const previous = posts;
    setPosts((prev) => prev.filter((p) => p.id !== id));
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error(await parseError(res, "Failed to delete post."));
    } catch (error) {
      setPosts(previous);
      showError(error instanceof Error ? error.message : "Failed to delete post.");
    }
  }

  async function changeLimit(nextLimit: number | null) {
    try {
      await onSaveData({ ...data, limit: nextLimit });
    } catch {
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  function commitLimitDraft() {
    const raw = limitDraft.trim();
    if (raw === "") {
      changeLimit(null);
      return;
    }
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed) || parsed < 1) {
      setLimitDraft("");
      changeLimit(null);
      return;
    }
    const clamped = Math.min(parsed, 200);
    setLimitDraft(String(clamped));
    changeLimit(clamped);
  }

  const totalCount = posts.length;
  let indicatorText = `Showing all ${totalCount} posts owned by this block`;
  if (data.limit) indicatorText += `, capped to ${data.limit} on the page itself`;
  indicatorText += ". Visitors can additionally browse by tag when viewing the page (not in edit mode).";

  return (
    <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
      <div className="rounded-md border border-dashed border-border-strong bg-surface p-4">
        <p className="text-sm text-muted">{indicatorText}</p>
        <div className="mt-3 flex flex-wrap gap-4">
          <label className="flex flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Limit (optional)
            <input
              type="number"
              min={1}
              max={200}
              value={limitDraft}
              onChange={(e) => setLimitDraft(e.target.value)}
              onBlur={commitLimitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
              }}
              className="h-9 w-28 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
            />
          </label>
        </div>
      </div>

      {editingId === "new" ? (
        <PostForm
          initial={emptyForm()}
          availableTags={availableTags}
          onTagCreated={handleTagCreated}
          onSubmit={createPost}
          onCancel={() => setEditingId(null)}
          submitLabel="Publish"
        />
      ) : (
        <AddButton onClick={() => setEditingId("new")} className="self-start">
          New announcement
        </AddButton>
      )}

      <ol className="flex flex-col gap-4 sm:gap-5">
        {posts.map((post, index) =>
          editingId === post.id ? (
            <li key={post.id}>
              <PostForm
                initial={toForm(post)}
                availableTags={availableTags}
                onTagCreated={handleTagCreated}
                onSubmit={(values) => updatePost(post.id, values)}
                onCancel={() => setEditingId(null)}
                submitLabel="Save changes"
              />
            </li>
          ) : (
            <li key={post.id} className="relative">
              <div className="rounded-lg outline-dashed outline-1 outline-offset-2 outline-border-strong transition-colors hover:outline-primary">
                <NewsPostItem post={{ ...post, publishedAt: new Date(post.publishedAt) }} featured={index === 0} />
              </div>
              <div className="absolute right-3 top-3 flex gap-1.5 sm:right-4 sm:top-4">
                <button
                  type="button"
                  onClick={() => setEditingId(post.id)}
                  className="flex h-8 items-center justify-center rounded-md border border-border-strong bg-surface px-2.5 text-xs font-medium text-muted transition hover:border-primary hover:text-primary motion-safe:active:scale-95"
                >
                  Edit
                </button>
                <DeleteButton label="Delete post" onClick={() => deletePost(post.id)} className="bg-surface" />
              </div>
            </li>
          ),
        )}
      </ol>
    </div>
  );
}
