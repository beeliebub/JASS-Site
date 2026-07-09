"use client";

import { useRef, useState, type ElementType, type KeyboardEvent } from "react";
import { useEditMode } from "@/components/admin/edit-mode-context";
import { useToast } from "@/components/admin/toast";

type EditableTextProps = {
  value: string;
  /** Persists the new value. Throw (or reject) to trigger rollback + toast. */
  onSave: (next: string) => Promise<void>;
  /** Tag used to render the plain/display state. Defaults to "span". */
  as?: ElementType;
  /** Use a <textarea> instead of an <input> while editing. */
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  /** Accessible name for the edit control — required, never shown visually. */
  label: string;
  /** Allow saving an empty string (defaults to false — most content is required). */
  allowEmpty?: boolean;
};

/**
 * Renders `value` as plain content for visitors and non-edit-mode admins.
 * When edit mode is on, clicking swaps in an input/textarea; saving is
 * optimistic (the display updates immediately) and rolls back with a toast
 * on a failed `onSave`.
 */
export function EditableText({
  value,
  onSave,
  as,
  multiline = false,
  className = "",
  placeholder,
  label,
  allowEmpty = false,
}: EditableTextProps) {
  const { editMode, isAdmin } = useEditMode();
  const { showError } = useToast();
  const Tag = (as ?? "span") as ElementType;

  const [localValue, setLocalValue] = useState(value);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const cancelledRef = useRef(false);

  if (!isAdmin || !editMode) {
    return <Tag className={className}>{localValue}</Tag>;
  }

  function startEditing() {
    setDraft(localValue);
    cancelledRef.current = false;
    setEditing(true);
  }

  function cancelEditing() {
    cancelledRef.current = true;
    setEditing(false);
  }

  async function commit() {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      return;
    }
    const trimmed = draft.trim();
    setEditing(false);

    if (trimmed === localValue) return;
    if (!trimmed && !allowEmpty) {
      showError("This field can't be empty.");
      return;
    }

    const previous = localValue;
    setLocalValue(trimmed);

    try {
      await onSave(trimmed);
    } catch (error) {
      setLocalValue(previous);
      showError(error instanceof Error ? error.message : "Failed to save changes.");
    }
  }

  function handleDisplayKeyDown(event: KeyboardEvent) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      startEditing();
    }
  }

  function handleFieldKeyDown(event: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEditing();
      return;
    }
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      event.currentTarget.blur();
      return;
    }
    if (multiline && event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      event.currentTarget.blur();
    }
  }

  if (editing) {
    // Same border-width + padding as the display state below (only the
    // color changes) so swapping between them doesn't reflow surrounding
    // layout -- a border here where the display state used a bare outline
    // (which occupies no box space) would otherwise shift neighboring
    // content by a couple pixels every time an admin starts/stops editing.
    const fieldClassName = `${className} w-full min-w-0 rounded-sm border border-primary bg-surface-2 px-2 py-1 outline-none`;
    return multiline ? (
      <textarea
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={handleFieldKeyDown}
        placeholder={placeholder}
        aria-label={label}
        rows={4}
        className={`${fieldClassName} resize-y`}
      />
    ) : (
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={commit}
        onKeyDown={handleFieldKeyDown}
        placeholder={placeholder}
        aria-label={label}
        className={fieldClassName}
      />
    );
  }

  return (
    <Tag
      role="button"
      tabIndex={0}
      onClick={startEditing}
      onKeyDown={handleDisplayKeyDown}
      aria-label={`Edit ${label}`}
      title={`Edit ${label}`}
      className={`${className} cursor-text rounded-sm border border-transparent px-2 py-1 outline-dashed outline-1 outline-offset-2 outline-border-strong transition-colors hover:outline-primary focus-visible:outline-primary`}
    >
      {localValue || <span className="text-muted italic">{placeholder ?? "Click to add text"}</span>}
    </Tag>
  );
}
