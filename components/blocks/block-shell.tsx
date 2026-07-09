"use client";

import type { ReactNode } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { DeleteButton, MoveDownButton, MoveUpButton } from "@/components/admin/list-controls";

/**
 * Shared edit-mode chrome for every block on a page: a dashed outline plus
 * move-up/move-down/delete controls (reused from list-controls.tsx, same as
 * rules/features editors) for reordering or removing the block itself.
 * Renders `children` bare (no chrome at all) for visitors and non-edit-mode
 * admins -- this never leaks outside edit mode.
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

  if (!isAdmin || !editMode) {
    return <>{children}</>;
  }

  return (
    <div className="group/block relative border border-dashed border-border-strong transition-colors hover:border-primary">
      <div className="pointer-events-none absolute -top-3.5 right-3 z-10 flex items-center gap-1 opacity-0 transition-opacity focus-within:pointer-events-auto focus-within:opacity-100 group-hover/block:pointer-events-auto group-hover/block:opacity-100">
        <span className="mr-1 rounded-sm border border-border-strong bg-surface px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
          {label}
        </span>
        <MoveUpButton disabled={!canMoveUp} onClick={onMoveUp} className="bg-surface" />
        <MoveDownButton disabled={!canMoveDown} onClick={onMoveDown} className="bg-surface" />
        <DeleteButton label="Delete block" onClick={onDelete} className="bg-surface" />
      </div>
      {children}
    </div>
  );
}
