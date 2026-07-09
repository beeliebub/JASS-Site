"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";

export type CalloutData = {
  variant: "warning" | "info";
  body: string;
};

const VARIANT_STYLES: Record<CalloutData["variant"], { wrap: string; icon: string; text: string }> = {
  warning: { wrap: "border-accent/30 bg-accent/10", icon: "text-accent", text: "⚠" },
  info: { wrap: "border-primary/30 bg-primary/10", icon: "text-primary", text: "ℹ" },
};

/** The amber "Read carefully" warning box from app/rules/page.tsx, now a
 * general-purpose callout block usable on any page. */
export function CalloutBlock({
  data,
  onSaveData,
}: {
  data: CalloutData;
  onSaveData: (next: CalloutData) => Promise<void>;
}) {
  const { editMode, isAdmin } = useEditMode();
  const styles = VARIANT_STYLES[data.variant] ?? VARIANT_STYLES.warning;

  return (
    <Container className="py-3 sm:py-4">
      <div className={`flex gap-3 rounded-md border px-4 py-3 sm:px-5 sm:py-4 ${styles.wrap}`}>
        <span aria-hidden className={`mt-0.5 shrink-0 ${styles.icon}`}>
          {styles.text}
        </span>
        <div className="min-w-0 flex-1">
          {isAdmin && editMode && (
            <label className="mb-1.5 flex items-center gap-1.5 text-xs text-muted">
              Variant
              <select
                value={data.variant}
                onChange={(e) => onSaveData({ ...data, variant: e.target.value as CalloutData["variant"] })}
                className="h-7 rounded-sm border border-border-strong bg-surface-2 px-1.5 text-xs text-foreground outline-none focus-visible:border-primary"
              >
                <option value="warning">Warning</option>
                <option value="info">Info</option>
              </select>
            </label>
          )}
          <EditableText
            as="p"
            multiline
            value={data.body}
            onSave={(v) => onSaveData({ ...data, body: v })}
            label="callout body"
            className="block text-sm leading-relaxed text-pretty text-foreground/90"
          />
        </div>
      </div>
    </Container>
  );
}
