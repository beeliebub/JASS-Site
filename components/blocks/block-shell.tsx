"use client";

import type { ReactNode } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

/**
 * Shared edit-mode chrome for every block on a page: a dashed outline plus
 * move-up/move-down/delete controls (reused from list-controls.tsx, same as
 * rules/features editors) for reordering or removing the block itself.
 * Renders no visible chrome for visitors and non-edit-mode admins -- this
 * never leaks outside edit mode.
 *
 * The wrapping element is always a `<div>`, in both branches -- never a
 * Fragment in one branch and a `<div>` in the other. Toggling Edit mode
 * flips `editMode` on the same `BlockShell` instance (same position in
 * `PageBlocks`'s tree, same `key`), but if the *root element type* it
 * returns changes between renders (Fragment vs. `<div>`), React tears down
 * and remounts the entire subtree at that position -- including whatever
 * block editor lives in `children`. For data-referencing editors
 * (RulesEditor/FeaturesEditor) whose "initial" props are a page-load-time
 * server snapshot that's never refreshed afterward, that remount silently
 * resets their in-progress local state back to that stale snapshot: every
 * section/rule/feature added since the page loaded visually vanishes the
 * instant Edit mode is toggled, even though each individual add/edit had
 * already saved to the database via its own fetch call -- a plain reload
 * (fresh SSR fetch) shows the true, already-correct state, which is what
 * made this look like "doesn't save without a reload." `display: contents`
 * keeps the always-present wrapper from affecting layout when chrome isn't
 * shown, reproducing the old Fragment's zero-footprint behavior exactly.
 */
export function BlockShell({
  label,
  canMoveUp,
  canMoveDown,
  onMoveUp,
  onMoveDown,
  onDelete,
  children,
}: {
  label: string;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
  children: ReactNode;
}) {
  const { editMode, isAdmin } = useEditMode();
  const showChrome = isAdmin && editMode;

  return (
    <div
      className={
        showChrome
          ? "group/block relative border border-dashed border-border-strong hover:border-primary"
          : "contents"
      }
    >
      {showChrome && (
        <div className="pointer-events-none absolute -top-3.5 right-3 z-10 flex items-center gap-1 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/block:pointer-events-auto group-hover/block:opacity-100">
          <span className="mr-1 rounded-sm border border-border-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
            {label}
          </span>
          <MoveUpButton disabled={!canMoveUp} onClick={onMoveUp} className="bg-surface" />
          <MoveDownButton disabled={!canMoveDown} onClick={onMoveDown} className="bg-surface" />
          <DeleteButton label="Delete block" onClick={onDelete} className="bg-surface" />
        </div>
      )}
      {children}
    </div>
  );
}
