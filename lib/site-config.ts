// `nav` was removed -- SiteHeader/SiteFooter now read the
// admin-manageable header nav from `getNavTree()` (lib/content.ts) instead.
// name/tagline/ip stay: they're still used as ContentBlock fallback
// defaults in lib/content.ts's getSiteContent().
export const siteConfig = {
  name: "JASS",
  tagline: "Just A Simple Server — survival worth logging back into.",
  ip: "justasimpleserver.net",
} as const;

/** Shared browser-tab title format for every protected `Page` row (Home
 * excluded -- see app/page.tsx's generateMetadata for why it has its own
 * fallback logic instead). `"Rules"` -> `"Rules — JASS"`. */
export function formatPageTitle(title: string): string {
  return `${title} — ${siteConfig.name}`;
}
