"use client";

import { useEffect, useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { NewsPostItem } from "@/components/news/news-post-item";
import { TagPicker, type ClientTag, type ClientPost } from "@/components/news/posts-editor";

export type PostDisplayData = {
  tagIds: string[];
  heading?: string | null;
  description?: string | null;
  limit?: number | null;
};

/**
 * Post Display block: structurally parallel to `PostsEditor` but simpler --
 * it never creates/edits/deletes posts, only selects existing ones (owned by
 * *other* Post List blocks anywhere on the site) by tag. `posts` arrives
 * pre-fetched and pre-filtered to this block's own `data.tagIds` by
 * page-renderer.tsx (see its `postDisplay` handling), the same
 * `referenceData.postsByBlockId?.[block.id]` pattern `postList` uses.
 *
 * The tag selection itself (`TagPicker`) is admin-edit-mode-only, both in
 * the "only rendered inside the edit-mode branch" sense and in the "resolved
 * posts carry no trace of which tags drove the match" sense -- visitor mode
 * below renders nothing but an optional heading/description and a flat list
 * of `NewsPostItem`s, no tag UI, no `title`/`aria-label`/comment hinting at
 * the filter.
 */
export function PostDisplayBlock({
  data,
  onSaveData,
  posts,
}: {
  data: PostDisplayData;
  onSaveData: (next: PostDisplayData) => Promise<void>;
  posts: ClientPost[];
}) {
  const { editMode, isAdmin } = useEditMode();
  const [availableTags, setAvailableTags] = useState<ClientTag[]>([]);
  // Same local-state + onSaveData-with-rollback convention as
  // HeroOverrideControls (components/home/hero-override-controls.tsx).
  const [heading, setHeading] = useState(data.heading ?? "");
  const [description, setDescription] = useState(data.description ?? "");
  // Same `limitDraft` + commit-on-blur pattern as PostsEditor
  // (components/news/posts-editor.tsx) -- this instance's own cap,
  // independent of any Post List block's own `limit`.
  const [limitDraft, setLimitDraft] = useState(data.limit != null ? String(data.limit) : "");

  useEffect(() => {
    if (!isAdmin || !editMode) return;
    fetch("/api/tags")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error("Failed to load tags."))))
      .then((body: { data: ClientTag[] }) => setAvailableTags(body.data))
      .catch(() => {
        /* Non-critical: TagPicker just falls back to showing no existing-tag chips. */
      });
  }, [isAdmin, editMode]);

  function handleTagCreated(tag: ClientTag) {
    setAvailableTags((prev) =>
      prev.some((t) => t.id === tag.id) ? prev : [...prev, tag].sort((a, b) => a.name.localeCompare(b.name)),
    );
  }

  async function handleTagIdsChange(next: string[]) {
    try {
      await onSaveData({ ...data, tagIds: next });
    } catch {
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  async function saveHeading(next: string) {
    const previous = heading;
    setHeading(next);
    try {
      await onSaveData({ ...data, heading: next || null });
    } catch {
      setHeading(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  async function saveDescription(next: string) {
    const previous = description;
    setDescription(next);
    try {
      await onSaveData({ ...data, description: next || null });
    } catch {
      setDescription(previous);
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
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

  // This block's own tag filter is redundant to show back on each post it
  // displays (the visitor already knows why these posts are grouped here) --
  // strip it out locally rather than teaching NewsPostItem about the concept.
  function tagsForDisplay(post: ClientPost) {
    return post.tags.filter((tag) => !data.tagIds.includes(tag.id));
  }

  if (!isAdmin || !editMode) {
    const scoped = data.limit ? posts.slice(0, data.limit) : posts;
    return (
      <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
        {(data.heading || data.description) && (
          <div>
            {data.heading && (
              <h2 className="text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl">
                {data.heading}
              </h2>
            )}
            {data.description && (
              <p className="mt-2 max-w-prose text-pretty text-muted">{data.description}</p>
            )}
          </div>
        )}
        <ol className="flex flex-col gap-4 sm:gap-5">
          {scoped.map((post) => (
            <li key={post.slug}>
              <NewsPostItem
                post={{ ...post, tags: tagsForDisplay(post), publishedAt: new Date(post.publishedAt) }}
              />
            </li>
          ))}
        </ol>
      </div>
    );
  }

  const totalCount = posts.length;
  let indicatorText = `Showing all ${totalCount} matched posts`;
  if (data.limit) indicatorText += `, capped to ${data.limit} on the page itself`;
  indicatorText += ".";

  const scoped = data.limit ? posts.slice(0, data.limit) : posts;

  return (
    <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
      <div>
        <EditableText
          as="h2"
          value={heading}
          onSave={saveHeading}
          label="post display heading"
          allowEmpty
          placeholder="Heading (optional)"
          className="block text-2xl font-semibold tracking-tight text-balance text-foreground sm:text-3xl"
        />
        <EditableText
          as="p"
          multiline
          value={description}
          onSave={saveDescription}
          label="post display description"
          allowEmpty
          placeholder="Description (optional)"
          className="mt-2 block max-w-prose text-pretty text-muted"
        />
      </div>

      <div className="rounded-md border border-dashed border-border-strong bg-surface p-4">
        <p className="mb-3 text-sm text-muted">
          Select one or more tags -- every post carrying any of them, from every Post List block on the site, will
          display here. Visitors never see which tags were selected.
        </p>
        <TagPicker
          availableTags={availableTags}
          selectedIds={data.tagIds}
          onChange={handleTagIdsChange}
          onTagCreated={handleTagCreated}
        />
        <p className="mt-3 text-sm text-muted">{indicatorText}</p>
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

      {data.tagIds.length === 0 ? (
        <p className="text-sm text-muted">Select at least one tag to display posts.</p>
      ) : (
        <ol className="flex flex-col gap-4 sm:gap-5">
          {scoped.map((post) => (
            <li key={post.slug}>
              <NewsPostItem
                post={{ ...post, tags: tagsForDisplay(post), publishedAt: new Date(post.publishedAt) }}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
