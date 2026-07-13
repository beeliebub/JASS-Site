export type TagPillTag = { name: string; color: string };

/**
 * Renders `color` at reduced opacity for the border/background (same visual
 * treatment the old fixed `accent` classes gave every tag), full-strength
 * for the text -- inline styles because the color is admin-editable data,
 * not one of a fixed set of Tailwind classes.
 */
export function TagPill({ tag }: { tag: TagPillTag }) {
  return (
    <span
      className="rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider"
      style={{
        borderColor: `${tag.color}4d`, // ~30% opacity
        backgroundColor: `${tag.color}1a`, // ~10% opacity
        color: tag.color,
      }}
    >
      {tag.name}
    </span>
  );
}
