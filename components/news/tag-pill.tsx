export function TagPill({ tag }: { tag: string }) {
  return (
    <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wider text-accent">
      {tag}
    </span>
  );
}
