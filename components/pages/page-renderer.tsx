import type { Block, Page } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  CONTENT_KEYS,
  getFeaturesByBlockIds,
  getPostsByBlockIds,
  getPostsByTagIds,
  getRuleSectionsByBlockIds,
  getSiteContent,
} from "@/lib/content";
import { BLOCK_TYPES, parseBlockData, type BlockType } from "@/lib/validation/pages";
import {
  buildDataSchemaFromDefinition,
  defaultDataForFields,
  type BlockFieldType,
} from "@/lib/validation/block-definitions";
import {
  defaultBlockData,
  type BlockDefinitionWithFields,
  type ClientBlock,
  type ReferenceData,
} from "@/components/blocks/registry";
import type { PostDisplayData } from "@/components/blocks/post-display-block";
import { PageBlocks } from "@/components/pages/page-blocks";
import { renderCustomHtml } from "@/lib/render-custom-html";

export type PageWithBlocks = Page & { blocks: Block[] };

function isBlockType(value: string): value is BlockType {
  return (BLOCK_TYPES as readonly string[]).includes(value);
}

function safeJsonParse(raw: string): unknown {
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** Groups `rows` by `keyOf(row)` into a `Record<key, row[]>` -- used below to
 * turn a flat `findMany({ where: { blockId: { in: [...] } } })` result back
 * into the per-block-id shape `ReferenceData` expects. */
function groupBy<T, K extends string>(rows: T[], keyOf: (row: T) => K): Record<K, T[]> {
  const result = {} as Record<K, T[]>;
  for (const row of rows) {
    const key = keyOf(row);
    (result[key] ??= []).push(row);
  }
  return result;
}

/**
 * Server component: maps a Page's Blocks to their renderers by `type` (see
 * components/blocks/registry.tsx) and delegates the interactive list
 * (reorder/add/delete in edit mode) to the client-owned PageBlocks.
 *
 * Pre-fetches the data data-referencing blocks need server-side (hero via
 * getSiteContent(); ruleList/featureGrid/postList via lib/content.ts's
 * `getXByBlockIds`, scoped to just the block ids of that type on *this*
 * page -- each block owns its own sections/features/
 * posts now, so there's no single site-wide array to fetch once and hand to
 * every instance) so those editor components render, just reachable
 * from any Page now. `postDisplay` blocks are the one exception to "owns its
 * own rows": they select *other* postList blocks' posts by tag, site-wide,
 * via `getPostsByTagIds` -- see the tagIds union/single-query/per-block
 * re-filter/merge sequence below, right before `referenceData` is built.
 *
 * Does NOT apply `page.theme`/`page.customThemeId` -- that
 * override has to wrap the header and footer too, not just these blocks, so
 * it's resolved and applied one level up by the route file + SiteChrome (see
 * components/pages/site-chrome.tsx and lib/custom-themes.ts's
 * resolvePageTheme). This component only ever renders the block list.
 */
export async function PageRenderer({ page }: { page: PageWithBlocks }) {
  const ruleListBlockIds = page.blocks.filter((b) => b.type === "ruleList").map((b) => b.id);
  const featureGridBlockIds = page.blocks.filter((b) => b.type === "featureGrid").map((b) => b.id);
  const postListBlockIds = page.blocks.filter((b) => b.type === "postList").map((b) => b.id);
  const hasHero = page.blocks.some((b) => b.type === "hero");
  // Distinct definitions referenced by this page's custom blocks -- several
  // instances of the same BlockDefinition only need it fetched once.
  const blockDefinitionIds = Array.from(
    new Set(
      page.blocks
        .filter((b) => b.type === "custom" && b.blockDefinitionId)
        .map((b) => b.blockDefinitionId as string),
    ),
  );

  // `postDisplay` blocks don't own posts -- they select other blocks' posts
  // by tag -- so we need each instance's own `data.tagIds` *before* the
  // Promise.all below can even know what to query for. This is the same
  // parse/validate-with-fallback pass the `clientBlocks` mapping further
  // down this file does for every block, just done early and scoped to only
  // `postDisplay` blocks.
  const postDisplayBlocks = page.blocks
    .filter((b) => b.type === "postDisplay")
    .map((b) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(b.data);
      } catch {
        parsed = undefined;
      }
      const result = parseBlockData("postDisplay", parsed);
      const data = (result.success ? result.data : defaultBlockData.postDisplay) as PostDisplayData;
      return { id: b.id, tagIds: data.tagIds };
    });
  // Union every postDisplay block's tagIds together (deduped) so a single
  // getPostsByTagIds call can cover every instance on the page -- avoids an
  // N-query render when multiple postDisplay blocks exist. Empty when there
  // are no postDisplay blocks, or every one of them has zero tags selected.
  const tagIdUnion = Array.from(new Set(postDisplayBlocks.flatMap((b) => b.tagIds)));

  const [ruleSections, features, posts, matchedPosts, siteContent, blockDefinitions] = await Promise.all([
    ruleListBlockIds.length ? getRuleSectionsByBlockIds(ruleListBlockIds) : Promise.resolve([]),
    featureGridBlockIds.length ? getFeaturesByBlockIds(featureGridBlockIds) : Promise.resolve([]),
    postListBlockIds.length ? getPostsByBlockIds(postListBlockIds) : Promise.resolve([]),
    tagIdUnion.length ? getPostsByTagIds(tagIdUnion) : Promise.resolve([]),
    hasHero ? getSiteContent() : Promise.resolve(undefined),
    blockDefinitionIds.length
      ? prisma.blockDefinition.findMany({
          where: { id: { in: blockDefinitionIds } },
          include: { fields: { orderBy: { order: "asc" } } },
        })
      : Promise.resolve([]),
  ]);

  // Keyed by id for the flatMap below's dynamic-schema validation, which
  // needs each field's `config` as the raw JSON *string*
  // (buildDataSchemaFromDefinition/defaultDataForFields both parse it
  // themselves, same as every other caller of those two functions) --
  // separate from `blockDefinitionsById` just below, whose `config` is
  // pre-parsed for the client-rendering shape instead.
  const rawDefinitionsById = new Map(blockDefinitions.map((d) => [d.id, d]));

  // Parsed once here (not re-parsed per rendering pass) -- see
  // BlockDefinitionWithFields's doc comment in custom-fields/types.ts on why
  // `config` arrives already-parsed at this point.
  const blockDefinitionsById: Record<string, BlockDefinitionWithFields> = {};
  for (const definition of blockDefinitions) {
    blockDefinitionsById[definition.id] = {
      id: definition.id,
      name: definition.name,
      layout: definition.layout,
      renderMode: definition.renderMode === "html" ? "html" : "fields",
      htmlTemplate: definition.htmlTemplate,
      remapThemeColors: definition.remapThemeColors,
      fields: definition.fields.map((field) => ({
        id: field.id,
        key: field.key,
        label: field.label,
        fieldType: field.fieldType as BlockFieldType,
        order: field.order,
        required: field.required,
        helpText: field.helpText,
        config: safeJsonParse(field.config),
      })),
    };
  }

  const postsByBlockId = groupBy(
    posts.map((post) => ({ ...post, publishedAt: post.publishedAt.toISOString() })),
    (p) => p.blockId,
  );

  // Merge each postDisplay block's own matched posts into the *same*
  // postsByBlockId map postList's owned posts just populated above -- block
  // ids are globally unique across every block type on a page, so there's no
  // key collision. The union fetch above may contain posts matching *other*
  // postDisplay blocks' tags too, so each instance locally filters back down
  // to just its own tagIds subset before merging.
  const serializedMatchedPosts = matchedPosts.map((post) => ({ ...post, publishedAt: post.publishedAt.toISOString() }));
  for (const { id, tagIds } of postDisplayBlocks) {
    if (tagIds.length === 0) {
      // Explicit "show nothing" -- never fall back to the full union.
      postsByBlockId[id] = [];
      continue;
    }
    const tagIdSet = new Set(tagIds);
    postsByBlockId[id] = serializedMatchedPosts.filter((post) => post.tags.some((tag) => tagIdSet.has(tag.id)));
  }

  const referenceData: ReferenceData = {
    ruleSectionsByBlockId: groupBy(ruleSections, (s) => s.blockId),
    featuresByBlockId: groupBy(features, (f) => f.blockId),
    postsByBlockId,
    blockDefinitionsById,
  };

  const clientBlocks: ClientBlock[] = page.blocks.flatMap((block): ClientBlock[] => {
    if (block.type === "custom") {
      const rawDefinition = block.blockDefinitionId ? rawDefinitionsById.get(block.blockDefinitionId) : undefined;
      // Deleted/missing definition -- skip the block, same "don't crash the
      // page for visitors" stance as an unknown legacy built-in type below.
      // registry.tsx's "custom" entry additionally guards against this (a
      // notice for admins) for the narrower case where the block still made
      // it into clientBlocks some other way, but it shouldn't when skipped
      // here.
      if (!rawDefinition) return [];

      let parsed: unknown;
      try {
        parsed = JSON.parse(block.data);
      } catch {
        parsed = undefined;
      }

      // Same guard-against-corrupt/stale-rows idea as built-in types below,
      // just validated against this definition's own dynamic schema instead
      // of a static one.
      const schema = buildDataSchemaFromDefinition(rawDefinition.fields);
      const result = schema.safeParse(parsed);
      const data = result.success ? result.data : defaultDataForFields(rawDefinition.fields);
      const renderedHtml = renderCustomHtml(rawDefinition, data as Record<string, unknown>);

      const customBlock: ClientBlock = {
        id: block.id,
        type: "custom",
        order: block.order,
        data,
        blockDefinitionId: block.blockDefinitionId,
        renderedHtml,
      };
      return [customBlock];
    }

    if (!isBlockType(block.type)) {
      // Unknown/legacy type -- skip rather than crash the page for visitors.
      return [];
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

    if (block.type === "hero" && siteContent) {
      // Plain serializable data, not a pre-rendered element -- registry.tsx's
      // `hero` entry builds <HeroContent> itself, live, from this plus
      // block.data, so the per-instance override updates immediately on
      // save. See components/home/hero-content.tsx's HeroContentData doc.
      const heroBlock: ClientBlock = {
        id: block.id,
        type: "hero",
        order: block.order,
        data,
        heroContent: {
          heroName: siteContent.heroName,
          heroTagline: siteContent.heroTagline,
          serverIp: siteContent.serverIp,
          heroNameKey: CONTENT_KEYS.heroName,
          heroTaglineKey: CONTENT_KEYS.heroTagline,
          serverIpKey: CONTENT_KEYS.serverIp,
        },
      };
      return [heroBlock];
    }

    const otherBlock: ClientBlock = { id: block.id, type: block.type, order: block.order, data };
    return [otherBlock];
  });

  return <PageBlocks pageId={page.id} initialBlocks={clientBlocks} referenceData={referenceData} />;
}
