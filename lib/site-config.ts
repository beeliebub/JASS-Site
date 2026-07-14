// `nav` was removed -- SiteHeader/SiteFooter now read the
// admin-manageable header nav from `getNavTree()` (lib/content.ts) instead.
// name/tagline/ip stay: they're still used as ContentBlock fallback
// defaults in lib/content.ts's getSiteContent().
export const siteConfig = {
  name: "JASS",
  tagline: "Just A Simple Server — survival worth logging back into.",
  ip: "justasimpleserver.net",
} as const;

/** Shared browser-tab title format for every protected `Page` row and every
 * admin-created custom page (Home excluded -- see app/page.tsx's
 * generateMetadata for why it has its own fallback logic instead). `suffix`
 * is the resolved `SiteSettings.pageTitleSuffix` (admin-configurable),
 * falling back to `siteConfig.name` when unset -- callers pass
 * `settings.pageTitleSuffix ?? siteConfig.name`. `"Rules"` -> `"Rules — JASS"`. */
export function formatPageTitle(title: string, suffix: string): string {
  return `${title} — ${suffix}`;
}
