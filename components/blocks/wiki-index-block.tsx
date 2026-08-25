"use client";

import { useState } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";
import { AddButton } from "@/components/admin/list-controls";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import type { WikiPageReference } from "@/lib/wiki-links";
import { pagePath } from "@/lib/routes";

export type WikiIndexData = { heading?: string; prefix?: string | null };

export function WikiIndexBlock({
  data,
  pages,
  currentSlug,
  onSaveData,
}: {
  data: WikiIndexData;
  pages: WikiPageReference[];
  currentSlug: string;
  onSaveData: (next: WikiIndexData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const [heading, setHeading] = useState(data.heading ?? "");
  const [prefix, setPrefix] = useState(data.prefix ?? "");
  const [saving, setSaving] = useState(false);
  const showEditable = isAdmin && editMode;

  async function persist(next: WikiIndexData) {
    const previous = { heading, prefix };
    setHeading(next.heading ?? "");
    setPrefix(next.prefix ?? "");
    setSaving(true);
    try {
      await onSaveData(next);
    } catch (error) {
      setHeading(previous.heading);
      setPrefix(previous.prefix);
      showError(error instanceof Error ? error.message : "Failed to save wiki index.");
    } finally {
      setSaving(false);
    }
  }

  const label = heading || "Related pages";

  return (
    <Container className="py-6 sm:py-8">
      <nav aria-label={label} className="w-full max-w-xl rounded-md border border-border bg-surface p-4">
        {showEditable ? (
          <EditableText
            as="h2"
            value={heading}
            onSave={(value) => persist({ heading: value, prefix: prefix || null })}
            label="wiki index heading"
            allowEmpty
            placeholder="Related pages"
            className="mb-2 block text-base font-semibold text-foreground"
          />
        ) : (
          heading && <h2 className="mb-2 text-base font-semibold text-foreground">{heading}</h2>
        )}
        {showEditable && (
          <EditableText
            value={prefix}
            onSave={(value) => persist({ heading: heading || undefined, prefix: value || null })}
            label="wiki index prefix"
            allowEmpty
            placeholder="Auto parent prefix"
            className="mb-3 block font-mono text-xs text-primary"
          />
        )}
        {pages.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {pages.map((page) => (
              <li key={page.slug}>
                <a
                  href={pagePath(page.slug)}
                  aria-current={page.slug === currentSlug ? "page" : undefined}
                  className={`text-sm ${page.slug === currentSlug ? "font-semibold text-foreground" : "text-primary hover:underline"}`}
                >
                  {page.title}
                </a>
              </li>
            ))}
          </ul>
        ) : showEditable ? (
          <p className="text-xs text-muted">No published child pages match this prefix yet.</p>
        ) : null}
        {showEditable && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AddButton disabled={saving} onClick={() => void persist({ heading: heading || undefined, prefix: null })}>
              Use parent prefix
            </AddButton>
            <span className="text-xs text-muted">Leave the prefix empty to derive it from this page.</span>
          </div>
        )}
      </nav>
    </Container>
  );
}
