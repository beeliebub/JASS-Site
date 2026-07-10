"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";
import { EditableText } from "@/components/admin/editable-text";
import { Container } from "@/components/container";
import { TONE_STYLES, ToneSelect } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

export type CalloutData = {
  variant: Tone;
  body: string;
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
  const styles = TONE_STYLES[data.variant] ?? TONE_STYLES.neutral;

  return (
    <Container className="py-3 sm:py-4">
      <div className={`flex gap-3 rounded-md border px-4 py-3 sm:px-5 sm:py-4 ${styles.container}`}>
        <span aria-hidden className={`mt-0.5 shrink-0 ${styles.title}`}>
          {styles.icon}
        </span>
        <div className="min-w-0 flex-1">
          {isAdmin && editMode && (
            <ToneSelect
              value={data.variant}
              onChange={(next) => onSaveData({ ...data, variant: next })}
              label="Variant"
            />
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
