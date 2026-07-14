/**
 * Fixed library of layout template ids a `BlockDefinition` picks one of. The
 * admin block-type builder shows this list in its layout picker; the
 * instance renderer (a later pass) maps a definition's fields into whichever
 * template's fixed slots this id points at. Kept in its own module (not
 * inline in the builder component) because both sides need to agree on the
 * exact same set of ids -- this is the single shared source of truth for
 * that set, not a builder-only concern.
 *
 * A small, fixed set of templates is a deliberate first step before any
 * free-form per-field layout canvas: admins pick the closest-fit template
 * now, and a fuller layout system (if it turns out to be needed at all) gets
 * built later, once real definitions exist to learn from.
 */
export const BLOCK_LAYOUT_TEMPLATES = [
  {
    id: "stacked",
    label: "Stacked",
    description: "Every field rendered in order, one above the next. The safest default for any mix of fields.",
  },
  {
    id: "banner",
    label: "Banner",
    description: "A large full-width media/heading area with supporting text and an optional button below it.",
  },
  {
    id: "split",
    label: "Split",
    description: "Media on one side, heading/body/button stacked on the other -- good for a feature callout.",
  },
  {
    id: "repeaterGrid",
    label: "Repeater grid",
    description: "A repeater field's rows laid out as a responsive grid of cards instead of a stacked list.",
  },
] as const;

export type BlockLayoutTemplateId = (typeof BLOCK_LAYOUT_TEMPLATES)[number]["id"];
