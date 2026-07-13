"use client";

import { useEffect, useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { NewsPostItem } from "@/components/news/news-post-item";
import { TagPicker, type ClientTag, type ClientPost } from "@/components/news/posts-editor";

export type PostDisplayData = { tagIds: string[] };

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
 * below renders nothing but a flat list of `NewsPostItem`s, no tag UI, no
 * `title`/`aria-label`/comment hinting at the filter.
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
      await onSaveData({ tagIds: next });
    } catch {
      // onSaveData's caller (page-blocks.tsx) already rolled back block state + showed a toast.
    }
  }

  if (!isAdmin || !editMode) {
    return (
      <ol className="flex flex-col gap-4 sm:gap-5">
        {posts.map((post) => (
          <li key={post.slug}>
            <NewsPostItem post={{ ...post, publishedAt: new Date(post.publishedAt) }} />
          </li>
        ))}
      </ol>
    );
  }

  return (
    <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:gap-5">
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
      </div>

      {data.tagIds.length === 0 ? (
        <p className="text-sm text-muted">Select at least one tag to display posts.</p>
      ) : (
        <ol className="flex flex-col gap-4 sm:gap-5">
          {posts.map((post) => (
            <li key={post.slug}>
              <NewsPostItem post={{ ...post, publishedAt: new Date(post.publishedAt) }} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
