import type { Block, Page } from "@/app/generated/prisma/client";
import { Hero } from "@/components/home/hero";
import { getFeatures, getPosts, getRuleSections } from "@/lib/content";
import { BLOCK_TYPES, parseBlockData, type BlockType } from "@/lib/validation/pages";
import { defaultBlockData, type ClientBlock, type ReferenceData } from "@/components/blocks/registry";
import { PageBlocks } from "@/components/pages/page-blocks";
import { THEME_IDS, type ThemeId } from "@/lib/themes";

export type PageWithBlocks = Page & { blocks: Block[] };

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
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

  const blocks = <PageBlocks pageId={page.id} initialBlocks={clientBlocks} referenceData={referenceData} />;

  // A forced per-page theme (Page.theme) wins over the visitor's site-wide
  // choice: [data-theme="…"] is the same attribute-only selector family
  // defined in app/globals.css, so this wrapper re-declares every color
  // token closer to the content than <html>'s visitor theme/accent --
  // no JS arbitration needed, the cascade just wins by proximity. Re-assert
  // bg/text classes so the wrapper actually repaints with the overridden
  // tokens instead of only affecting descendants.
  // Validated the same way write-time Zod validation does -- fails safe
  // (falls back to the visitor's own theme) rather than rendering a
  // meaningless data-theme attribute for a corrupted/out-of-band DB value.
  if (page.theme && isThemeId(page.theme)) {
    return (
      <div data-theme={page.theme} className="bg-background text-foreground">
        {blocks}
      </div>
    );
  }

  return blocks;
}
