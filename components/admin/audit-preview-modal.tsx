"use client";

import { useEffect, useState } from "react";
import { EditModeProvider } from "@/components/admin/edit-mode-context";
import { blockComponents, type ClientBlock, type ReferenceData } from "@/components/blocks/registry";
import { blockTypeLabels, type BlockType } from "@/lib/validation/pages";

/**
 * Block types whose renderer needs nothing but its own `data` -- no
 * server-fetched reference data, no rows owned elsewhere via `blockId`. This
 * is exactly what `AuditPreviewModal` can render from a stored audit
 * snapshot alone. Excluded: `hero` (needs site-wide hero content the
 * snapshot doesn't carry), `ruleList`/`featureGrid`/`postList` (each renders
 * rows it owns via `blockId`, not its own `data` -- the snapshot has no row
 * data to show).
 */
export const PREVIEWABLE_BLOCK_TYPES: readonly BlockType[] = [
  "pageHeader",
  "callout",
  "linkGrid",
  "richText",
  "image",
  "ctaBanner",
  "code",
  "accordion",
  "table",
  "toc",
];

export function isPreviewableBlockType(type: string): type is BlockType {
  return (PREVIEWABLE_BLOCK_TYPES as readonly string[]).includes(type);
}

async function noopSave(): Promise<void> {
  // Unreachable in practice -- EditModeProvider isAdmin={false} forces
  // editMode: false, so every block component renders its plain read-only
  // branch and never calls onSaveData. Kept as a real async no-op (not a
  // thrown error) so a future block that ever called it regardless would
  // fail silently rather than crash the preview.
}

export type AuditPreviewPayload = {
  type: BlockType;
  /** Parsed block `data` (already `JSON.parse`d), or `null` if that side of
   * the entry doesn't exist -- a create has no `before`, a delete has no
   * `after`. */
  before: unknown;
  after: unknown;
};

/**
 * Read-only rendering of a single block snapshot, forced through
 * `EditModeProvider isAdmin={false}` so every block component takes its
 * plain visitor-facing branch regardless of the real admin viewing the
 * modal (see edit-mode-context.tsx: `editMode` can never be true when
 * `isAdmin` is false). An update entry has both `before` and `after` and
 * gets a toggle between them; a create/delete entry has only one side.
 */
export function AuditPreviewModal({ payload, onClose }: { payload: AuditPreviewPayload; onClose: () => void }) {
  const hasBefore = payload.before !== null;
  const hasAfter = payload.after !== null;
  const [showing, setShowing] = useState<"before" | "after">(hasAfter ? "after" : "before");

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const Component = blockComponents[payload.type];
  const data = showing === "before" ? payload.before : payload.after;
  const block: ClientBlock = { id: "audit-preview", type: payload.type, order: 0, data };
  const referenceData: ReferenceData = {};

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Preview ${blockTypeLabels[payload.type]} block`}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-border-strong bg-surface shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-foreground">Preview: {blockTypeLabels[payload.type]}</span>
            {hasBefore && hasAfter && (
              <div className="flex overflow-hidden rounded-md border border-border-strong text-xs">
                <button
                  type="button"
                  onClick={() => setShowing("before")}
                  className={`px-2.5 py-1 font-medium transition ${
                    showing === "before" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  Before
                </button>
                <button
                  type="button"
                  onClick={() => setShowing("after")}
                  className={`px-2.5 py-1 font-medium transition ${
                    showing === "after" ? "bg-primary text-primary-foreground" : "text-muted hover:text-foreground"
                  }`}
                >
                  After
                </button>
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close preview"
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-surface-2 hover:text-foreground"
          >
            ✕
          </button>
        </div>
        <div className="overflow-auto p-5">
          <EditModeProvider isAdmin={false} editingEnabled={false}>
            <Component block={block} referenceData={referenceData} onSaveData={noopSave} />
          </EditModeProvider>
        </div>
      </div>
    </div>
  );
}
