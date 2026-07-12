import type { ComponentType } from "react";
import type { Feature, Rule, RuleSection } from "@/app/generated/prisma/client";
import { Container } from "@/components/container";
import { RulesEditor } from "@/components/rules/rules-editor";
import { FeaturesEditor } from "@/components/features/features-editor";
import { PostsEditor, type ClientPost, type PostListData } from "@/components/news/posts-editor";
import { HeroOverrideControls, type HeroData } from "@/components/home/hero-override-controls";
import { HeroContent, type HeroContentData } from "@/components/home/hero-content";
import { PageHeaderBlock, type PageHeaderData } from "@/components/blocks/page-header-block";
import { CalloutBlock, type CalloutData } from "@/components/blocks/callout-block";
import { StepsBlock, type StepsData } from "@/components/blocks/steps-block";
import { LinkGridBlock, type LinkGridData } from "@/components/blocks/link-grid-block";
import { RichTextBlock, type RichTextData } from "@/components/blocks/rich-text-block";
import { ImageBlock, type ImageData } from "@/components/blocks/image-block";
import { CtaBannerBlock, type CtaBannerData } from "@/components/blocks/cta-banner-block";
import { CardGridBlock, type CardGridData } from "@/components/blocks/card-grid-block";
import { CodeBlock, type CodeData } from "@/components/blocks/code-block";
import { AccordionBlock, type AccordionData } from "@/components/blocks/accordion-block";
import { TableBlock, type TableData } from "@/components/blocks/table-block";
import { TocBlock, type TocData } from "@/components/blocks/toc-block";
import { BLOCK_TYPES, type BlockType } from "@/lib/validation/pages";

/**
 * Type -> component lookup (per PLAN.md: "a lookup object, not a long
 * if/switch, so adding a block type later is a one-line registration").
 *
 * Data-referencing types (hero/ruleList/featureGrid/postList) render the
 * existing Phase 2/4 editor components, backed by data pre-fetched
 * server-side in page-renderer.tsx and threaded through as `referenceData`
 * -- these components (RulesEditor/FeaturesEditor/PostsEditor) accept plain
 * serializable "initial*" props, so no server/client boundary issue.
 * ruleList/featureGrid/postList also get a `blockId` prop (their owning
 * block's own id) since PLAN.md Phases 25-27: each instance's
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

/** PLAN.md Phases 25-27: ruleList/featureGrid/postList blocks each own their
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
  // No `data`/`onSaveData` forwarded here -- `RuleListData` is empty (PLAN.md
  // Phase 26), there's nothing left for a Rule List instance to save.
  ruleList: ({ block, referenceData }) => (
    <Container className="py-8 sm:py-10">
      <RulesEditor blockId={block.id} initialSections={referenceData.ruleSectionsByBlockId?.[block.id] ?? []} />
    </Container>
  ),
  // Same as ruleList above -- `FeatureGridData` is empty (PLAN.md Phase 27).
  featureGrid: ({ block, referenceData }) => (
    <Container className="py-12 sm:py-16">
      <FeaturesEditor blockId={block.id} initialFeatures={referenceData.featuresByBlockId?.[block.id] ?? []} />
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
  pageHeader: ({ block, onSaveData }) => (
    <PageHeaderBlock
      data={block.data as PageHeaderData}
      onSaveData={onSaveData as (next: PageHeaderData) => Promise<void>}
    />
  ),
  callout: ({ block, onSaveData }) => (
    <CalloutBlock data={block.data as CalloutData} onSaveData={onSaveData as (next: CalloutData) => Promise<void>} />
  ),
  steps: ({ block, onSaveData }) => (
    <StepsBlock data={block.data as StepsData} onSaveData={onSaveData as (next: StepsData) => Promise<void>} />
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
  cardGrid: ({ block, onSaveData }) => (
    <CardGridBlock data={block.data as CardGridData} onSaveData={onSaveData as (next: CardGridData) => Promise<void>} />
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

export const blockTypeLabels: Record<BlockType, string> = {
  hero: "Hero",
  ruleList: "Rule list",
  featureGrid: "Feature grid",
  postList: "Post list",
  pageHeader: "Page header",
  callout: "Callout",
  steps: "Steps",
  linkGrid: "Link grid",
  richText: "Rich text",
  image: "Image",
  ctaBanner: "CTA banner",
  cardGrid: "Card grid",
  code: "Code block",
  accordion: "Accordion / FAQ",
  table: "Table",
  toc: "Table of contents",
};

/** Default `data` for a freshly-added block of `type`, sent as the POST body. */
export const defaultBlockData: Record<BlockType, unknown> = {
  hero: { headingOverride: null, taglineOverride: null },
  ruleList: {},
  featureGrid: {},
  postList: { limit: null },
  pageHeader: { heading: "New section" },
  callout: { variant: "info", body: "Add a message here." },
  steps: { items: [] },
  linkGrid: { links: [] },
  richText: { markdown: "" },
  image: { src: "", alt: "" },
  ctaBanner: { heading: "Call to action", buttonLabel: "Learn more", buttonHref: "/" },
  cardGrid: { heading: "", cards: [] },
  // codeDataSchema requires `code` non-empty (`min(1)`, matching every other
  // required-text-field default elsewhere in this object, e.g. ctaBanner's
  // heading) -- "" here would fail blockCreateSchema validation immediately
  // on add, unlike PLAN.md's literal `{ code: "" }` example.
  code: { code: "// Add code here", language: "", caption: "" },
  accordion: { items: [] },
  table: { caption: "", headers: ["Column 1", "Column 2"], rows: [["", ""]] },
  toc: { heading: "", items: [] },
};

/** Block types offered in the "Add block" picker. All `BLOCK_TYPES` are
 * addable, including the data-referencing `hero`/`ruleList`/`featureGrid`/
 * `postList`. As of PLAN.md Phases 25-27, `ruleList`/`featureGrid`/`postList`
 * each own their rows outright (`RuleSection`/`Feature`/`Post.blockId`) --
 * a freshly-added instance starts with zero sections/features/posts and
 * admins add content directly into it, rather than filtering into a
 * pre-existing site-wide pool. `postList` still carries an optional `limit`
 * in `Block.data` (`postListDataSchema` in `lib/validation/pages.ts`) to cap
 * how many of that instance's own posts render; tag-based filtering is a
 * viewing-only feature now (ephemeral, non-persisting, in the visitor branch
 * of `PostsEditor`), not something saved per instance, since it's just a way
 * to browse the block's own posts rather than a content-curation choice.
 * `ruleListDataSchema`/`featureGridDataSchema` carry nothing; `hero` keeps
 * its `headingOverride`/`taglineOverride` (the live server-status ping stays
 * global -- it's describing the one real server, never per-instance).
 * Editing a section/feature/post from its owning block's editor affects only
 * that row, same as always -- what changed is that no *other* block instance
 * can reference or display it. Tag *names* on posts, unlike the posts
 * themselves, stay a shared vocabulary across every Post List block (see
 * `GET /api/posts/tags`) -- an admin authoring a post in any instance can
 * reuse a tag already used elsewhere on the site. */
export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES;
