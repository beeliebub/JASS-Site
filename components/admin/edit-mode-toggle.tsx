"use client";

import { useEditMode } from "@/components/admin/edit-mode-context";

/**
 * Global edit-mode switch, shown in the header nav only for admins
 * (SiteHeader already gates rendering on `isAdmin`, this double-checks via
 * context so the toggle can never render — let alone flip on — for a
 * non-admin session).
 */
export function EditModeToggle() {
  const { editMode, isAdmin, toggle } = useEditMode();

  if (!isAdmin) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={editMode}
      className={`flex h-9 shrink-0 items-center gap-2 rounded-full border px-3 text-xs font-medium transition motion-safe:active:scale-95 ${
        editMode
          ? "border-primary/50 bg-primary/10 text-primary"
          : "border-border-strong text-muted hover:text-foreground"
      }`}
    >
      <span
        aria-hidden
        className={`relative flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
          editMode ? "bg-primary" : "bg-surface-2 border border-border-strong"
        }`}
      >
        <span
          className={`absolute h-3 w-3 rounded-full bg-background transition-transform ${
            editMode ? "translate-x-3.5" : "translate-x-0.5"
          }`}
        />
      </span>
      Edit mode
    </button>
  );
}
