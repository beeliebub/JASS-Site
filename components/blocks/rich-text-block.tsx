"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { Container } from "@/components/container";

export type RichTextData = { markdown: string };

/** General-purpose markdown block. Never renders raw HTML from the DB
 * unsanitized -- rehype-sanitize strips anything outside its safe schema
 * before react-markdown renders the result. */
export function RichTextBlock({
  data,
  onSaveData,
}: {
  data: RichTextData;
  onSaveData: (next: RichTextData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [markdown, setMarkdown] = useState(data.markdown);
  const [draft, setDraft] = useState(data.markdown);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    return (
      <Container className="py-6 sm:py-8">
        <div className="markdown-content max-w-2xl">
          <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
        </div>
      </Container>
    );
  }

  async function commit() {
    setEditing(false);
    if (draft === markdown) return;
    const previous = markdown;
    setMarkdown(draft);
    setSaving(true);
    try {
      await onSaveData({ markdown: draft });
    } catch (error) {
      setMarkdown(previous);
      setDraft(previous);
      showError(error instanceof Error ? error.message : "Failed to save text.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Container className="py-6 sm:py-8">
      <div className="max-w-2xl">
        {editing ? (
          <textarea
            autoFocus
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            disabled={saving}
            aria-label="Rich text markdown"
            className="w-full resize-y rounded-md border border-primary bg-surface-2 px-3 py-2 font-mono text-sm text-foreground outline-none"
          />
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setDraft(markdown);
              setEditing(true);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setDraft(markdown);
                setEditing(true);
              }
            }}
            aria-label="Edit rich text"
            title="Edit rich text (markdown supported)"
            className="markdown-content cursor-text rounded-sm border border-transparent px-2 py-1 outline-dashed outline-1 outline-offset-2 outline-border-strong transition-colors hover:outline-primary"
          >
            {markdown ? (
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
            ) : (
              <span className="text-muted italic">Click to add text (markdown supported)</span>
            )}
          </div>
        )}
      </div>
    </Container>
  );
}
