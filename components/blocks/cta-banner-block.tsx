"use client";

import Link from "next/link";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type CtaBannerData = {
  heading: string;
  body?: string;
  buttonLabel: string;
  buttonHref: string;
};

export function CtaBannerBlock({
  data,
  onSaveData,
}: {
  data: CtaBannerData;
  onSaveData: (next: CtaBannerData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const showEditable = isAdmin && editMode;
  const isInternal = data.buttonHref.startsWith("/");

  return (
    <Container className="py-8 sm:py-10">
      <div className="flex flex-col items-start gap-4 rounded-lg border border-border-strong bg-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="min-w-0 flex-1">
          <EditableText
            as="h2"
            value={data.heading}
            onSave={(v) => onSaveData({ ...data, heading: v })}
            label="CTA heading"
            className="block text-xl font-semibold text-balance text-foreground"
          />
          {(showEditable || data.body) && (
            <EditableText
              as="p"
              multiline
              value={data.body ?? ""}
              onSave={(v) => onSaveData({ ...data, body: v })}
              label="CTA body"
              allowEmpty
              placeholder="Description (optional)"
              className="mt-1.5 block text-sm text-pretty text-muted"
            />
          )}
        </div>

        {showEditable ? (
          <div className="flex shrink-0 flex-col gap-2 rounded-md border border-border bg-surface-2 p-3">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Button label
              <EditableText
                as="span"
                value={data.buttonLabel}
                onSave={(v) => onSaveData({ ...data, buttonLabel: v })}
                label="CTA button label"
                className="block text-sm text-foreground"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Button link
              <EditableText
                as="span"
                value={data.buttonHref}
                onSave={(v) => onSaveData({ ...data, buttonHref: v })}
                label="CTA button link"
                className="block font-mono text-xs text-foreground"
              />
            </label>
          </div>
        ) : isInternal ? (
          <Link
            href={data.buttonHref}
            className="flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]"
          >
            {data.buttonLabel}
          </Link>
        ) : (
          <a
            href={data.buttonHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-11 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]"
          >
            {data.buttonLabel}
          </a>
        )}
      </div>
    </Container>
  );
}
