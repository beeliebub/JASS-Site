"use client";

import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import type { CustomFieldInputProps } from "@/components/blocks/custom-fields/types";

/** Markdown field -- the exact same react-markdown + rehype-sanitize pipeline
 * as RichTextBlock (components/blocks/rich-text-block.tsx). No new
 * sanitization path: raw HTML from a custom block's stored markdown never
 * reaches the page unsanitized (locked requirement, not new here). */
export function RichTextFieldInput({ field, value, onChange, showLabel = true }: CustomFieldInputProps) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const markdown = typeof value === "string" ? value : "";
  const [draft, setDraft] = useState(markdown);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const showEditable = isAdmin && editMode;

  if (!showEditable) {
    if (!markdown) return null;
    return (
      <div className="markdown-content">
        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
      </div>
    );
  }

  async function commit() {
    setEditing(false);
    if (draft === markdown) return;
    setSaving(true);
    try {
      await onChange(draft);
    } catch (error) {
      setDraft(markdown);
      showError(error instanceof Error ? error.message : "Failed to save text.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      {showLabel && <span className="text-xs text-muted">{field.label}</span>}
      {editing ? (
        <textarea
          autoFocus
          rows={5}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          disabled={saving}
          aria-label={field.label}
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
          aria-label={`Edit ${field.label}`}
          title={`Edit ${field.label} (markdown supported)`}
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
  );
}
