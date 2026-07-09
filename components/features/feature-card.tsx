import type { ReactNode } from "react";

type FeatureCardProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: ReactNode;
  accent?: boolean;
};

/**
 * One flat surface per card — no nested bordered boxes. The icon sits in a
 * plain color chip (background tint only, no border) so it reads as a small
 * glyph, not a card-within-a-card.
 *
 * Heading is h2: the Features page has no intervening section heading
 * between its h1 and this grid (same flat pattern as NewsPostItem's h2),
 * so cards sit one level below the page title, not two.
 */
export function FeatureCard({ eyebrow, title, description, icon, accent = false }: FeatureCardProps) {
  return (
    <div
      className="group flex h-full flex-col gap-4 rounded-lg border border-border bg-surface p-6 transition motion-safe:hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/20"
    >
      <div
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md transition-transform motion-safe:group-hover:scale-105 ${
          accent ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
        }`}
      >
        {icon}
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        <span className="font-mono text-xs font-medium uppercase tracking-wider text-muted">
          {eyebrow}
        </span>
        <h2 className="text-base font-semibold text-balance text-foreground">{title}</h2>
        <p className="text-sm leading-relaxed text-pretty text-muted">{description}</p>
      </div>
    </div>
  );
}
