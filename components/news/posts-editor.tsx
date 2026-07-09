"use client";

import { useState, type FormEvent } from "react";
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
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial: FormValues;
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
            value={values.tag}
            onChange={(e) => setField("tag", e.target.value)}
            className={fieldClassName}
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

export function PostsEditor({ initialPosts }: { initialPosts: ClientPost[] }) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [posts, setPosts] = useState(() => sortPosts(initialPosts));
  const [editingId, setEditingId] = useState<string | null>(null);

  if (!isAdmin || !editMode) {
    return (
      <ol className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
        {posts.map((post, index) => (
          <li key={post.slug}>
            <NewsPostItem post={{ ...post, publishedAt: new Date(post.publishedAt) }} featured={index === 0} />
          </li>
        ))}
      </ol>
    );
  }

  async function createPost(values: FormValues) {
    const res = await fetch("/api/posts", {
      method: "POST",
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

  return (
    <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
      {editingId === "new" ? (
        <PostForm initial={emptyForm()} onSubmit={createPost} onCancel={() => setEditingId(null)} submitLabel="Publish" />
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
