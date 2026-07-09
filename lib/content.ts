import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/site-config";

/**
 * Server-only data layer for editable content. Reads go straight through
 * Prisma with fallback defaults so a missing row (e.g. a fresh DB before
 * seeding) never crashes a page — it just renders the Phase 1 placeholder
 * text instead. No `server-only` package is installed, so don't import this
 * from a Client Component.
 */

export const CONTENT_KEYS = {
  heroName: "hero.name",
  heroTagline: "hero.tagline",
  serverIp: "server.ip",
} as const;

export type SiteContent = {
  heroName: string;
  heroTagline: string;
  serverIp: string;
};

export async function getContentBlock(key: string): Promise<string | null> {
  const block = await prisma.contentBlock.findUnique({ where: { key } });
  return block?.value ?? null;
}

export async function getSiteContent(): Promise<SiteContent> {
  const blocks = await prisma.contentBlock.findMany({
    where: { key: { in: Object.values(CONTENT_KEYS) } },
  });
  const values = new Map(blocks.map((block) => [block.key, block.value]));

  return {
    heroName: values.get(CONTENT_KEYS.heroName) ?? siteConfig.name,
    heroTagline: values.get(CONTENT_KEYS.heroTagline) ?? siteConfig.tagline,
    serverIp: values.get(CONTENT_KEYS.serverIp) ?? siteConfig.ip,
  };
}

export async function getRuleSections() {
  return prisma.ruleSection.findMany({
    orderBy: { order: "asc" },
    include: { rules: { orderBy: { order: "asc" } } },
  });
}

export async function getFeatures() {
  return prisma.feature.findMany({ orderBy: { order: "asc" } });
}

export async function getPosts() {
  return prisma.post.findMany({ orderBy: { publishedAt: "desc" } });
}

// ---------------------------------------------------------------------------
// Phase 8 — Pages, Blocks, Nav
// ---------------------------------------------------------------------------

export async function getPageBySlug(slug: string) {
  return prisma.page.findUnique({
    where: { slug },
    include: { blocks: { orderBy: { order: "asc" } } },
  });
}

export async function getPages() {
  return prisma.page.findMany({ orderBy: { title: "asc" } });
}

// pagePath/navItemHref moved to lib/routes.ts (pure, no Prisma import) so
// client components (components/site-header.tsx, site-footer.tsx) can use
// them without pulling the Prisma/better-sqlite3 chain into the client
// bundle. Re-exported here so existing server-only imports of
// `pagePath` from "@/lib/content" keep working.
export { pagePath, navItemHref } from "@/lib/routes";

export async function getNavTree() {
  return prisma.navItem.findMany({
    where: { parentId: null },
    orderBy: { order: "asc" },
    include: {
      page: { select: { slug: true } },
      children: { orderBy: { order: "asc" }, include: { page: { select: { slug: true } } } },
    },
  });
}
