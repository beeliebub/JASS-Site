/**
 * Pure URL-mapping helpers with no DB import -- kept separate from
 * lib/content.ts (which pulls in the Prisma client, and therefore
 * better-sqlite3/node built-ins) specifically so client components like
 * components/site-header.tsx can import them without dragging a
 * server-only dependency chain into the client bundle.
 */

/** Maps a Page's `slug` to the URL it actually renders at. The "home" sentinel
 * slug renders at "/" (see app/page.tsx); every other slug (including the
 * other 3 protected pages, whose slugs equal their static route segment)
 * renders at "/{slug}" via either its own static route file or the
 * app/[slug] catch-all. */
export function pagePath(slug: string): string {
  return slug === "home" ? "/" : `/${slug}`;
}

/** Resolves a NavItem's target URL: an external `href`, or the page it
 * points at via `pageId` (mutually exclusive, enforced at the API layer). */
export function navItemHref(item: { href: string | null; page: { slug: string } | null }): string {
  if (item.href) return item.href;
  if (item.page) return pagePath(item.page.slug);
  return "#";
}
