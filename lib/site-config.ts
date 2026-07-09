// `nav` was removed in Phase 8 -- SiteHeader/SiteFooter now read the
// admin-manageable header nav from `getNavTree()` (lib/content.ts) instead.
// name/tagline/ip stay: they're still used as ContentBlock fallback
// defaults in lib/content.ts's getSiteContent().
export const siteConfig = {
  name: "Embervale",
  tagline: "A survival world worth logging back into.",
  ip: "play.embervale.gg",
} as const;
