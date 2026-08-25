"use client";

import { useMemo, useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { Container } from "@/components/container";
import { extractWikiHeadings } from "@/components/blocks/wiki-headings";
import { WikiMarkdown } from "@/components/blocks/wiki-markdown";
import type { WikiPageReference } from "@/lib/wiki-links";

export type WikiArticleData = { markdown: string; showToc?: boolean };

export function WikiArticleBlock({
  data,
  wikiPages,
  onSaveData,
}: {
  data: WikiArticleData;
  wikiPages: readonly WikiPageReference[];
  onSaveData: (next: WikiArticleData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [markdown, setMarkdown] = useState(data.markdown);
  const [draft, setDraft] = useState(data.markdown);
  const [showToc, setShowToc] = useState(data.showToc ?? false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const showEditable = isAdmin && editMode;
  const headings = useMemo(() => extractWikiHeadings(markdown), [markdown]);

  async function persist(next: WikiArticleData) {
    const previous = { markdown, showToc };
    setMarkdown(next.markdown);
    setDraft(next.markdown);
    setShowToc(next.showToc ?? false);
    setSaving(true);
    try {
      await onSaveData(next);
    } catch (error) {
      setMarkdown(previous.markdown);
      setDraft(previous.markdown);
      setShowToc(previous.showToc);
      showError(error instanceof Error ? error.message : "Failed to save wiki article.");
    } finally {
      setSaving(false);
    }
  }

  const article = (
    <div className="markdown-content max-w-3xl">
      <WikiMarkdown markdown={markdown} pages={wikiPages} showMissingLinks={showEditable} showHeadingIds />
    </div>
  );

  const toc = showToc && headings.length > 0 && (
    <nav aria-label="Article table of contents" className="mb-6 rounded-md border border-border bg-surface p-4">
      <p className="mb-2 text-sm font-semibold text-foreground">Contents</p>
      <ol className="flex flex-col gap-1 text-sm">
        {headings.map((heading, index) => (
          <li key={`${heading.id}-${index}`} style={{ paddingLeft: `${Math.max(0, heading.level - 1) * 12}px` }}>
            <a href={`#${heading.id}`} className="text-primary hover:underline">{heading.text}</a>
          </li>
        ))}
      </ol>
    </nav>
  );

  if (!showEditable) {
    return <Container className="py-6 sm:py-8">{toc}{article}</Container>;
  }

  return (
    <Container className="py-6 sm:py-8">
      <div className="max-w-3xl">
        <label className="mb-3 flex items-center gap-2 text-sm text-muted">
          <input
            type="checkbox"
            checked={showToc}
            disabled={saving}
            onChange={(event) => void persist({ markdown, showToc: event.target.checked })}
          />
          Show table of contents
        </label>
        {editing ? (
          <textarea
            autoFocus
            rows={14}
            maxLength={20000}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => {
              setEditing(false);
              if (draft !== markdown) void persist({ markdown: draft, showToc });
            }}
            disabled={saving}
            aria-label="Wiki article markdown"
            className="w-full resize-y rounded-md border border-primary bg-surface-2 px-3 py-2 font-mono text-sm text-foreground outline-none"
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => { setDraft(markdown); setEditing(true); }}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setDraft(markdown);
                setEditing(true);
              }
            }}
            aria-label="Edit wiki article"
            className="cursor-text rounded-sm border border-transparent outline-dashed outline-1 outline-offset-2 outline-border-strong transition-colors hover:outline-primary"
          >
            {markdown ? article : <span className="text-muted italic">Click to add wiki article markdown</span>}
          </div>
        )}
      </div>
    </Container>
  );
}
