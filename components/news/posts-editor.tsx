"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { NewsPostItem } from "@/components/news/news-post-item";
import { DeleteButton, AddButton } from "@/components/admin/list-controls";

export type ClientPost = {
  id: string;
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  body: string | null;
  publishedAt: string;
  author: string | null;
};

export type PostListData = { limit?: number | null };

type FormValues = {
  slug: string;
  tag: string;
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
    tag: "Announcement",
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
    tag: post.tag,
    title: post.title,
    excerpt: post.excerpt,
    body: post.body ?? "",
    publishedAt: post.publishedAt.slice(0, 10),
    author: post.author ?? "",
  };
}

function PostForm({
  initial,
  existingTags,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormValues;
  // Site-wide tag names (across every Post List block, not just this one) --
  // tags are the one thing that stay a shared vocabulary even though posts
  // themselves are now owned per-block. Offered as datalist suggestions so
  // an admin can reuse an existing tag or type a brand new one; either way
  // it's just a plain string on this post, no separate Tag row is created.
  existingTags: string[];
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
        <div className="flex flex-col gap-1.5">
          <label htmlFor="post-tag" className={labelClassName}>
            Tag
          </label>
          <input
            id="post-tag"
            required
            list="post-tag-options"
            value={values.tag}
            onChange={(e) => setField("tag", e.target.value)}
            className={fieldClassName}
          />
          <datalist id="post-tag-options">
            {existingTags.map((tag) => (
              <option key={tag} value={tag} />
            ))}
          </datalist>
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
  const [visitorTag, setVisitorTag] = useState<string | null>(null);
  // Tags are the one thing shared across every Post List block on the site
  // (posts themselves are not) -- fetched once, admin-only, so PostForm can
  // suggest existing tag names when authoring a post in *any* block.
  const [existingTags, setExistingTags] = useState<string[]>([]);

  useEffect(() => {
    if (!isAdmin || !editMode) return;
    fetch("/api/posts/tags")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load tags."))))
      .then((body: { data: string[] }) => setExistingTags(body.data))
      .catch(() => {
        /* Non-critical: PostForm just falls back to a plain text input with no suggestions. */
      });
  }, [isAdmin, editMode]);

  if (!isAdmin || !editMode) {
    // `limit` caps how many of this instance's own posts are in scope at
    // all; the visitor's own tag choice then narrows *within* that already-
    // capped set, rather than re-expanding it.
    const scoped = data.limit ? posts.slice(0, data.limit) : posts;
    const visitorTags = Array.from(new Set(scoped.map((p) => p.tag))).sort();
    const limited = visitorTag ? scoped.filter((p) => p.tag === visitorTag) : scoped;
    const latestPostId = posts[0]?.id;

    return (
      <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
        {visitorTags.length > 1 && (
          <label className="flex w-fit flex-col gap-1.5 text-xs font-medium uppercase tracking-wide text-muted">
            Filter by tag
            <select
              value={visitorTag ?? ""}
              onChange={(e) => setVisitorTag(e.target.value || null)}
              className="h-9 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-foreground outline-none focus-visible:border-primary"
            >
              <option value="">All tags</option>
              {visitorTags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
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
        tag: values.tag,
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
        tag: values.tag,
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
          existingTags={existingTags}
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
                existingTags={existingTags}
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
