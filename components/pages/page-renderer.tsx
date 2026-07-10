import type { Block, Page } from "@/app/generated/prisma/client";
import { Hero } from "@/components/home/hero";
import { getFeatures, getPosts, getRuleSections } from "@/lib/content";
import { BLOCK_TYPES, parseBlockData, type BlockType } from "@/lib/validation/pages";
import { defaultBlockData, type ClientBlock, type ReferenceData } from "@/components/blocks/registry";
import { PageBlocks } from "@/components/pages/page-blocks";

export type PageWithBlocks = Page & { blocks: Block[] };

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

/**
 * Server component: maps a Page's Blocks to their renderers by `type` (see
 * components/blocks/registry.tsx) and delegates the interactive list
 * (reorder/add/delete in edit mode) to the client-owned PageBlocks.
 *
 * Pre-fetches the data data-referencing blocks need server-side (hero via
 * the existing Hero() Server Component; ruleList/featureGrid/postList via
 * the same lib/content.ts reads app/rules|features|news/page.tsx already
 * used) so those unchanged Phase 2/4 editor components render exactly as
 * they did before this phase, just reachable from any Page now.
 *
 * Does NOT apply `page.theme`/`page.customThemeId` -- as of Phase 12 that
 * override has to wrap the header and footer too, not just these blocks, so
 * it's resolved and applied one level up by the route file + SiteChrome (see
 * components/pages/site-chrome.tsx and lib/custom-themes.ts's
 * resolvePageTheme). This component only ever renders the block list.
 */
export async function PageRenderer({ page }: { page: PageWithBlocks }) {
  const types = new Set(page.blocks.map((b) => b.type));

  const [ruleSections, features, posts] = await Promise.all([
    types.has("ruleList") ? getRuleSections() : Promise.resolve(undefined),
    types.has("featureGrid") ? getFeatures() : Promise.resolve(undefined),
    types.has("postList") ? getPosts() : Promise.resolve(undefined),
  ]);

  const referenceData: ReferenceData = {
    ruleSections,
    features,
    posts: posts?.map((post) => ({ ...post, publishedAt: post.publishedAt.toISOString() })),
  };

  const clientBlocks: ClientBlock[] = page.blocks.flatMap((block): ClientBlock[] => {
    if (!isBlockType(block.type)) {
      // Unknown/legacy type -- skip rather than crash the page for visitors.
      return [];
    }

    if (block.type === "hero") {
      const heroBlock: ClientBlock = { id: block.id, type: "hero", order: block.order, data: {}, heroContent: <Hero /> };
      return [heroBlock];
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(block.data);
    } catch {
      parsed = undefined;
    }

    // Guard against corrupt/stale rows: validate on read the same way writes
    // are validated, falling back to a safe default instead of crashing.
    const result = parseBlockData(block.type, parsed);
    const data = result.success ? result.data : defaultBlockData[block.type];

    const otherBlock: ClientBlock = { id: block.id, type: block.type, order: block.order, data };
    return [otherBlock];
  });

  return <PageBlocks pageId={page.id} initialBlocks={clientBlocks} referenceData={referenceData} />;
}
