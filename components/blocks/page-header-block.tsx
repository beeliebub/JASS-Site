"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type PageHeaderData = {
  eyebrow?: string;
  heading: string;
  description?: string;
};

/**
 * The eyebrow + h1 + intro-paragraph pattern that used to be hardcoded at
 * the top of app/rules/page.tsx, app/features/page.tsx, and app/news/page.tsx
 * -- now a data-carrying block so any page (including new custom ones) can
 * have the same header treatment.
 */
export function PageHeaderBlock({
  data,
  onSaveData,
}: {
  data: PageHeaderData;
  onSaveData: (next: PageHeaderData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;

  return (
    <section className="border-b border-border bg-grid">
      <Container className="py-12 sm:py-16">
        <header className="max-w-2xl">
          {(showEditable || data.eyebrow) && (
            <EditableText
              as="p"
              value={data.eyebrow ?? ""}
              onSave={(v) => onSaveData({ ...data, eyebrow: v })}
              label="page eyebrow"
              allowEmpty
              placeholder="Eyebrow (optional)"
              className="font-mono text-xs uppercase tracking-widest text-muted"
            />
          )}
          <EditableText
            as="h1"
            value={data.heading}
            onSave={(v) => onSaveData({ ...data, heading: v })}
            label="page heading"
            className="mt-2 block text-3xl font-semibold tracking-tight text-balance text-foreground sm:text-4xl"
          />
          {(showEditable || data.description) && (
            <EditableText
              as="p"
              multiline
              value={data.description ?? ""}
              onSave={(v) => onSaveData({ ...data, description: v })}
              label="page description"
              allowEmpty
              placeholder="Description (optional)"
              className="mt-3 block text-pretty text-muted"
            />
          )}
        </header>
      </Container>
    </section>
  );
}
