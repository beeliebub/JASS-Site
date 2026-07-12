import Link from "next/link";
import { TagPill } from "@/components/news/tag-pill";

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

// Structural subset of `Post`/`ClientPost`, not the full Prisma `Post` type --
// this only ever renders these 5 fields, so it shouldn't need to track
// unrelated columns like `blockId`/`body`/`author` just to typecheck.
type DisplayPost = {
  slug: string;
  tag: string;
  title: string;
  excerpt: string;
  publishedAt: Date;
};

export function NewsPostItem({
  post,
  featured = false,
}: {
  post: DisplayPost;
  featured?: boolean;
}) {
  const dateLabel = formatDate(post.publishedAt);

  return (
    <article
      className={`rounded-lg border p-5 sm:p-6 ${
        featured
          ? "border-border-strong bg-surface-2"
          : "border-border bg-surface"
      }`}
    >
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:shrink-0">
          <time dateTime={post.publishedAt.toISOString()} className="font-mono text-xs text-muted">
            {dateLabel}
          </time>
          <TagPill tag={post.tag} />
          {featured && (
            <span className="text-[11px] font-medium uppercase tracking-wider text-accent">
              Latest
            </span>
          )}
        </div>

        <h2 className="text-lg font-semibold text-balance text-foreground sm:text-xl">
          <Link href={`/news/${post.slug}`} className="rounded-sm transition-colors hover:text-primary focus-visible:text-primary">
            {post.title}
          </Link>
        </h2>
      </div>

      <p className="mt-2 max-w-prose text-sm leading-relaxed text-pretty text-muted sm:text-base">
        {post.excerpt}
      </p>
    </article>
  );
}
