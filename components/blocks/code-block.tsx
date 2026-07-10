"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type CodeData = { code: string; language?: string; caption?: string };

function CopyButton({ code, showError }: { code: string; showError: (message: string) => void }) {
  const [copied, setCopied] = useState(false);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      showError("Failed to copy code.");
    }
  }

  return (
    <button
      type="button"
      onClick={copyCode}
      className="rounded-sm px-2 py-1 text-xs text-muted transition hover:text-primary"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function CodeBoxHeader({ language, code, showError }: { language: string; code: string; showError: (message: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1.5">
      {language ? (
        <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-xs text-muted">{language}</span>
      ) : (
        <span />
      )}
      <CopyButton code={code} showError={showError} />
    </div>
  );
}

/** Themed monospace code block -- no syntax-highlighting engine in this pass
 * (PLAN.md Phase 15 decision 6). Always rendered as React text content
 * (`<code>{code}</code>`), never `dangerouslySetInnerHTML`, so arbitrary
 * admin-authored text (even `<script>`-looking strings) is safe to display. */
export function CodeBlock({
  data,
  onSaveData,
}: {
  data: CodeData;
  onSaveData: (next: CodeData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [code, setCode] = useState(data.code);
  const [language, setLanguage] = useState(data.language ?? "");
  const [caption, setCaption] = useState(data.caption ?? "");
  const [languageDraft, setLanguageDraft] = useState(data.language ?? "");
  const [captionDraft, setCaptionDraft] = useState(data.caption ?? "");

  const showEditable = isAdmin && editMode;

  async function persist(next: { code?: string; language?: string; caption?: string }) {
    const previousCode = code;
    const previousLanguage = language;
    const previousCaption = caption;
    const nextCode = next.code ?? code;
    const nextLanguage = next.language ?? language;
    const nextCaption = next.caption ?? caption;
    setCode(nextCode);
    setLanguage(nextLanguage);
    setCaption(nextCaption);
    try {
      await onSaveData({ code: nextCode, language: nextLanguage, caption: nextCaption });
    } catch (error) {
      setCode(previousCode);
      setLanguage(previousLanguage);
      setCaption(previousCaption);
      setLanguageDraft(previousLanguage);
      setCaptionDraft(previousCaption);
      showError(error instanceof Error ? error.message : "Failed to save code block.");
    }
  }

  if (!showEditable) {
    return (
      <Container className="py-6 sm:py-8">
        <div className="max-w-2xl">
          <div className="rounded-md border border-border-strong bg-surface-2">
            <CodeBoxHeader language={language} code={code} showError={showError} />
            <pre className="overflow-x-auto p-3 text-sm whitespace-pre-wrap break-words">
              <code className="font-mono text-foreground">{code}</code>
            </pre>
          </div>
          {caption && <p className="mt-2 text-xs text-muted">{caption}</p>}
        </div>
      </Container>
    );
  }

  return (
    <Container className="py-6 sm:py-8">
      <div className="max-w-2xl">
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-muted">
            Language
            <input
              type="text"
              value={languageDraft}
              onChange={(e) => setLanguageDraft(e.target.value)}
              onBlur={() => persist({ language: languageDraft })}
              placeholder="e.g. yaml"
              className="h-7 w-28 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
            />
          </label>
          <label className="flex items-center gap-1.5 text-muted">
            Caption
            <input
              type="text"
              value={captionDraft}
              onChange={(e) => setCaptionDraft(e.target.value)}
              onBlur={() => persist({ caption: captionDraft })}
              placeholder="Optional caption"
              className="h-7 w-48 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
            />
          </label>
        </div>
        <div className="rounded-md border border-border-strong bg-surface-2">
          <CodeBoxHeader language={language} code={code} showError={showError} />
          <EditableText
            as="pre"
            multiline
            value={code}
            onSave={(v) => persist({ code: v })}
            label="code body"
            placeholder="Paste or type code here"
            className="block overflow-x-auto p-3 font-mono text-sm whitespace-pre-wrap break-words text-foreground"
          />
        </div>
      </div>
    </Container>
  );
}
