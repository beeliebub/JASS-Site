import type { ComponentType } from "react";
import type { Feature, Rule, RuleSection } from "@/app/generated/prisma/client";
import { Container } from "@/components/container";
import { RulesEditor } from "@/components/rules/rules-editor";
import { FeaturesEditor, type FeatureGridData } from "@/components/features/features-editor";
import { PostsEditor, type ClientPost, type PostListData } from "@/components/news/posts-editor";
import { PostDisplayBlock, type PostDisplayData } from "@/components/blocks/post-display-block";
import { HeroOverrideControls, type HeroData } from "@/components/home/hero-override-controls";
import { HeroContent, type HeroContentData } from "@/components/home/hero-content";
import { PageHeaderBlock, type PageHeaderData } from "@/components/blocks/page-header-block";
import { CalloutBlock, type CalloutData } from "@/components/blocks/callout-block";
import { LinkGridBlock, type LinkGridData } from "@/components/blocks/link-grid-block";
import { RichTextBlock, type RichTextData } from "@/components/blocks/rich-text-block";
import { ImageBlock, type ImageData } from "@/components/blocks/image-block";
import { CtaBannerBlock, type CtaBannerData } from "@/components/blocks/cta-banner-block";
import { CodeBlock, type CodeData } from "@/components/blocks/code-block";
import { AccordionBlock, type AccordionData } from "@/components/blocks/accordion-block";
import { TableBlock, type TableData } from "@/components/blocks/table-block";
import { TocBlock, type TocData } from "@/components/blocks/toc-block";
import { BLOCK_TYPES, blockTypeLabels, type BlockType } from "@/lib/validation/pages";

/**
 * Type -> component lookup ("a lookup object, not a long
 * if/switch, so adding a block type later is a one-line registration").
 *
 * Data-referencing types (hero/ruleList/featureGrid/postList/postDisplay)
 * render the existing editor components, backed by data pre-fetched
 * server-side in page-renderer.tsx and threaded through as `referenceData`
 * -- these components (RulesEditor/FeaturesEditor/PostsEditor/
 * PostDisplayBlock) accept plain serializable "initial*"/`posts` props, so no
 * server/client boundary issue.
 * ruleList/featureGrid/postList also get a `blockId` prop (their owning
 * block's own id) since each instance's
 * sections/features/posts are rows it owns outright (`blockId` FK on
 * RuleSection/Feature/Post), not a filtered view into one shared, site-wide
 * table -- `referenceData.ruleSectionsByBlockId`/`featuresByBlockId`/
 * `postsByBlockId` are keyed by block id for exactly that reason. `postList`
 * additionally keeps `data`/`onSaveData` for an admin-configured `limit`
 * *within* its own posts (see `PostListData`) -- tag-based filtering lives
 * entirely in `PostsEditor`'s visitor branch as ephemeral local state now,
 * never persisted through `data`/`onSaveData`. ruleList/featureGrid dropped
 * their equivalent `sectionIds`/`featureIds` filters entirely, since
 * ownership already makes every instance's content distinct with nothing
 * left to hand-pick from.
 * `postDisplay` doesn't own any posts of its own -- it reads the *same*
 * `referenceData.postsByBlockId` map by its own `block.id` key, but
 * page-renderer.tsx populates that entry with other blocks' posts matched by
 * tag (see `getPostsByTagIds` in lib/content.ts) rather than posts this block
 * owns. It keeps `data`/`onSaveData` for its persisted `tagIds` selection
 * (see `PostDisplayData`), admin-edit-mode-only and never leaked to
 * visitors.
 * `hero` follows the same "plain serializable data, not a rendered element"
 * rule: `block.heroContent` is the site-wide `{heroName, heroTagline,
 * serverIp, ...}` fetched once in page-renderer.tsx (a ReactNode pre-rendered
 * there would arrive here as an opaque, un-cloneable RSC reference -- see
 * components/home/hero-content.tsx's `HeroContentData` doc). This entry
 * builds `<HeroContent>` itself from that data plus the live `headingOverride`/
 * `taglineOverride` off `block.data`, so editing the override via
 * `HeroOverrideControls` (rendered alongside it) updates the visible heading
 * immediately.
 */

export type SectionWithRules = RuleSection & { rules: Rule[] };

/** ruleList/featureGrid/postList blocks each own their
 * rows via `blockId` now, so `page-renderer.tsx` fetches per the set of
 * block ids on the page and keys the results back by block id -- each
 * block's registry entry below reads only its own `block.id` entry out of
 * these maps, never a page-wide shared array. */
export type ReferenceData = {
  ruleSectionsByBlockId?: Record<string, SectionWithRules[]>;
  featuresByBlockId?: Record<string, Feature[]>;
  postsByBlockId?: Record<string, ClientPost[]>;
};

export type ClientBlock = {
  id: string;
  type: BlockType;
  order: number;
  data: unknown;
  heroContent?: HeroContentData;
};

export type BlockComponentProps = {
  block: ClientBlock;
  referenceData: ReferenceData;
  onSaveData: (next: unknown) => Promise<void>;
};

export const blockComponents: Record<BlockType, ComponentType<BlockComponentProps>> = {
  hero: ({ block, onSaveData }) => {
    const heroData = block.data as HeroData;
    if (!block.heroContent) return null;
    return (
      <>
        <HeroContent
          {...block.heroContent}
          headingOverride={heroData.headingOverride}
          taglineOverride={heroData.taglineOverride}
        />
        <HeroOverrideControls data={heroData} onSaveData={onSaveData as (next: HeroData) => Promise<void>} />
      </>
    );
  },
  // These 3 (unlike hero, and unlike every data-carrying block below) don't
  // self-wrap in a Container -- RulesEditor/FeaturesEditor/PostsEditor were
  // written to be placed inside a page-level Container alongside sibling
  // JSX, matching each type's original page (app/rules|features|news) so the
  // visual rhythm carries over now that pageHeader is a separate block.
  // No `data`/`onSaveData` forwarded here -- `RuleListData` is empty,
  // there's nothing left for a Rule List instance to save.
  ruleList: ({ block, referenceData }) => (
    <Container className="py-8 sm:py-10">
      <RulesEditor blockId={block.id} initialSections={referenceData.ruleSectionsByBlockId?.[block.id] ?? []} />
    </Container>
  ),
  // Unlike ruleList, FeatureGridData carries the block-level heading/tone
  // absorbed from the former Card Grid block type, so this one does forward
  // `data`/`onSaveData` -- same shape as postList's `limit`.
  featureGrid: ({ block, referenceData, onSaveData }) => (
    <Container className="py-12 sm:py-16">
      <FeaturesEditor
        blockId={block.id}
        initialFeatures={referenceData.featuresByBlockId?.[block.id] ?? []}
        data={block.data as FeatureGridData}
        onSaveData={onSaveData as (next: FeatureGridData) => Promise<void>}
      />
    </Container>
  ),
  postList: ({ block, referenceData, onSaveData }) => (
    <Container className="flex flex-1 flex-col py-8 sm:py-10">
      <PostsEditor
        blockId={block.id}
        initialPosts={referenceData.postsByBlockId?.[block.id] ?? []}
        data={block.data as PostListData}
        onSaveData={onSaveData as (next: PostListData) => Promise<void>}
      />
    </Container>
  ),
  // `postDisplay` reads from the *same* `referenceData.postsByBlockId` map as
  // `postList` above -- page-renderer.tsx populates this block's entry with
  // posts matched by tag (owned by other Post List blocks) rather than posts
  // it owns itself, but the key is still just this block's own `block.id`,
  // so this entry is unaware of which path produced its posts.
  postDisplay: ({ block, referenceData, onSaveData }) => (
    <Container className="flex flex-1 flex-col py-8 sm:py-10">
      <PostDisplayBlock
        data={block.data as PostDisplayData}
        onSaveData={onSaveData as (next: PostDisplayData) => Promise<void>}
        posts={referenceData.postsByBlockId?.[block.id] ?? []}
      />
    </Container>
  ),
  pageHeader: ({ block, onSaveData }) => (
    <PageHeaderBlock
      data={block.data as PageHeaderData}
      onSaveData={onSaveData as (next: PageHeaderData) => Promise<void>}
    />
  ),
  callout: ({ block, onSaveData }) => (
    <CalloutBlock data={block.data as CalloutData} onSaveData={onSaveData as (next: CalloutData) => Promise<void>} />
  ),
  linkGrid: ({ block, onSaveData }) => (
    <LinkGridBlock data={block.data as LinkGridData} onSaveData={onSaveData as (next: LinkGridData) => Promise<void>} />
  ),
  richText: ({ block, onSaveData }) => (
    <RichTextBlock data={block.data as RichTextData} onSaveData={onSaveData as (next: RichTextData) => Promise<void>} />
  ),
  image: ({ block, onSaveData }) => (
    <ImageBlock data={block.data as ImageData} onSaveData={onSaveData as (next: ImageData) => Promise<void>} />
  ),
  ctaBanner: ({ block, onSaveData }) => (
    <CtaBannerBlock
      data={block.data as CtaBannerData}
      onSaveData={onSaveData as (next: CtaBannerData) => Promise<void>}
    />
  ),
  code: ({ block, onSaveData }) => (
    <CodeBlock data={block.data as CodeData} onSaveData={onSaveData as (next: CodeData) => Promise<void>} />
  ),
  accordion: ({ block, onSaveData }) => (
    <AccordionBlock data={block.data as AccordionData} onSaveData={onSaveData as (next: AccordionData) => Promise<void>} />
  ),
  table: ({ block, onSaveData }) => (
    <TableBlock data={block.data as TableData} onSaveData={onSaveData as (next: TableData) => Promise<void>} />
  ),
  toc: ({ block, onSaveData }) => (
    <TocBlock data={block.data as TocData} onSaveData={onSaveData as (next: TocData) => Promise<void>} />
  ),
};

// blockTypeLabels moved to lib/validation/pages.ts (re-exported here so
// existing imports of it from this module keep working) -- lightweight
// consumers like lib/audit-log-summary.ts need the label lookup without
// pulling in every block component this file also imports.
export { blockTypeLabels };

/** Default `data` for a freshly-added block of `type`, sent as the POST body. */
export const defaultBlockData: Record<BlockType, unknown> = {
  hero: { headingOverride: null, taglineOverride: null },
  ruleList: {},
  featureGrid: {},
  postList: { limit: null },
  // Explicit empty selection, not "everything" -- see postDisplayDataSchema's
  // doc comment in lib/validation/pages.ts.
  postDisplay: { tagIds: [] },
  pageHeader: { heading: "New section" },
  callout: { variant: "info", body: "Add a message here." },
  linkGrid: { links: [] },
  richText: { markdown: "" },
  image: { src: "", alt: "" },
  ctaBanner: { heading: "Call to action", buttonLabel: "Learn more", buttonHref: "/" },
  // codeDataSchema requires `code` non-empty (`min(1)`, matching every other
  // required-text-field default elsewhere in this object, e.g. ctaBanner's
  // heading) -- "" here would fail blockCreateSchema validation immediately
  // on add, unlike a literal `{ code: "" }` default would.
  code: { code: "// Add code here", language: "", caption: "" },
  accordion: { items: [] },
  table: { caption: "", headers: ["Column 1", "Column 2"], rows: [["", ""]] },
  toc: { heading: "", items: [] },
};

/** Block types offered in the "Add block" picker. All `BLOCK_TYPES` are
 * addable, including the data-referencing `hero`/`ruleList`/`featureGrid`/
 * `postList`. `ruleList`/`featureGrid`/`postList`
 * each own their rows outright (`RuleSection`/`Feature`/`Post.blockId`) --
 * a freshly-added instance starts with zero sections/features/posts and
 * admins add content directly into it, rather than filtering into a
 * pre-existing site-wide pool. `postList` still carries an optional `limit`
 * in `Block.data` (`postListDataSchema` in `lib/validation/pages.ts`) to cap
 * how many of that instance's own posts render; tag-based filtering is a
 * viewing-only feature now (ephemeral, non-persisting, in the visitor branch
 * of `PostsEditor`), not something saved per instance, since it's just a way
 * to browse the block's own posts rather than a content-curation choice.
 * `ruleListDataSchema` carries nothing; `featureGridDataSchema` carries only
 * the block-level `heading`/`tone` pair absorbed from the former Card Grid
 * block type (see lib/validation/pages.ts); `hero` keeps its
 * `headingOverride`/`taglineOverride` (the live server-status ping stays
 * global -- it's describing the one real server, never per-instance).
 * Editing a section/feature/post from its owning block's editor affects only
 * that row, same as always -- what changed is that no *other* block instance
 * can reference or display it. Tag *names* on posts, unlike the posts
 * themselves, stay a shared vocabulary across every Post List block (see
 * `GET /api/tags`) -- an admin authoring a post in any instance can
 * reuse a tag already used elsewhere on the site. */
export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES;
