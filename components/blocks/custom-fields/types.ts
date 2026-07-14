import type { BlockFieldType } from "@/lib/validation/block-definitions";

/**
 * Shape a `CustomFieldInput` (and each per-fieldType component it dispatches
 * to, in this same directory) needs to render or edit one field of a
 * `BlockDefinition` instance -- whether that's a top-level field of the
 * definition itself, or one of a `repeater` field's own inline item fields
 * (see repeater-field.tsx). `config`'s real shape depends on `fieldType`,
 * same as everywhere else this config blob is threaded through
 * (lib/validation/block-definitions.ts, components/admin/block-definitions-admin.tsx).
 *
 * Also re-exported (as a value the page-rendering layer needs, not just this
 * directory) from components/blocks/registry.tsx, alongside
 * `BlockDefinitionWithFields` below -- kept here, not defined twice, so
 * registry.tsx and components/blocks/custom-block-renderer.tsx (which both
 * need it) don't end up importing it from each other and creating a cycle.
 */
export type CustomFieldDef = {
  id: string;
  key: string;
  label: string;
  fieldType: BlockFieldType;
  order: number;
  required: boolean;
  helpText: string | null;
  config: unknown;
};

/** A `BlockDefinition` plus its ordered fields, exactly as much shape as
 * `CustomBlockRenderer` and the "custom" registry.tsx entry need -- not the
 * full API row shape (no `description`/`createdAt`/usage count/etc). */
export type BlockDefinitionWithFields = {
  id: string;
  name: string;
  layout: string;
  renderMode: "fields" | "html";
  htmlTemplate: string | null;
  remapThemeColors: boolean;
  fields: CustomFieldDef[];
};

export type CustomFieldInputProps = {
  field: CustomFieldDef;
  value: unknown;
  /** Persists the new value for this field. Callers (custom-block-renderer.tsx,
   * repeater-field.tsx's own row fields) merge it into the owning `Block.data`
   * object and call the block's real `onSaveData` -- the same
   * "spread existing data, overwrite one key" pattern every other block
   * editor in this codebase already uses (e.g. CtaBannerBlock). */
  onChange: (next: unknown) => Promise<void>;
  /** Suppress the field's own label -- used by layout templates that supply
   * their own heading/typography around a slot (e.g. BannerTemplate's
   * heading slot) rather than the field's generic label row. Defaults to
   * true (show the label), the right choice for stacked/fallback rendering. */
  showLabel?: boolean;
  /** Only consulted by RepeaterFieldInput's read-only (visitor-facing)
   * rendering -- "grid" lays rows out as a responsive card grid
   * (repeaterGrid template) instead of the default stacked list. Edit mode
   * always uses the stacked list regardless of this hint, since
   * move-up/move-down controls are inherently linear. */
  layoutHint?: "list" | "grid";
};
