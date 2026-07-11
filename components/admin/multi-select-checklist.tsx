"use client";

export type ChecklistOption = { id: string; label: string };

/**
 * Generic edit-mode checklist for a Phase 18 per-instance filter
 * (`sectionIds`/`featureIds`): `null` means "everything selected" (the
 * unset/default state, matching each filter schema's semantics in
 * lib/validation/pages.ts), so ticking every box collapses the selection
 * back to `null` rather than persisting a full explicit list.
 */
export function MultiSelectChecklist({
  options,
  selectedIds,
  onChange,
  label,
}: {
  options: ChecklistOption[];
  selectedIds: string[] | null;
  onChange: (next: string[] | null) => void;
  label: string;
}) {
  const allSelected = selectedIds === null;

  function toggle(id: string) {
    const current = selectedIds ?? options.map((o) => o.id);
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange(next.length === options.length ? null : next);
  }

  return (
    <fieldset className="flex flex-col gap-1.5 rounded-md border border-border-strong bg-surface-2 p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted">{label}</legend>
      {options.length === 0 ? (
        <p className="px-1 text-xs text-muted">Nothing to select yet.</p>
      ) : (
        options.map((opt) => {
          const checked = allSelected || (selectedIds?.includes(opt.id) ?? false);
          return (
            <label key={opt.id} className="flex items-center gap-2 px-1 text-sm text-foreground">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.id)}
                className="h-3.5 w-3.5 accent-primary"
              />
              {opt.label}
            </label>
          );
        })
      )}
    </fieldset>
  );
}
