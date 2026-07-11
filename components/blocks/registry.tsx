import type { ComponentType } from "react";
import type { Feature, Rule, RuleSection } from "@/app/generated/prisma/client";
import { Container } from "@/components/container";
import { RulesEditor, type RuleListData } from "@/components/rules/rules-editor";
import { FeaturesEditor, type FeatureGridData } from "@/components/features/features-editor";
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
 * serializable "initial*" props, so no server/client boundary issue. Since
 * Phase 18 they additionally accept `data`/`onSaveData` for their own
 * per-instance filter (`RuleListData`/`FeatureGridData`/`PostListData`).
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

export type ReferenceData = {
  ruleSections?: SectionWithRules[];
  features?: Feature[];
  posts?: ClientPost[];
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
  ruleList: ({ block, referenceData, onSaveData }) => (
    <Container className="py-8 sm:py-10">
      <RulesEditor
        initialSections={referenceData.ruleSections ?? []}
        data={block.data as RuleListData}
        onSaveData={onSaveData as (next: RuleListData) => Promise<void>}
      />
    </Container>
  ),
  featureGrid: ({ block, referenceData, onSaveData }) => (
    <Container className="py-12 sm:py-16">
      <FeaturesEditor
        initialFeatures={referenceData.features ?? []}
        data={block.data as FeatureGridData}
        onSaveData={onSaveData as (next: FeatureGridData) => Promise<void>}
      />
    </Container>
  ),
  postList: ({ block, referenceData, onSaveData }) => (
    <Container className="flex flex-1 flex-col py-8 sm:py-10">
      <PostsEditor
        initialPosts={referenceData.posts ?? []}
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
  ruleList: { sectionIds: null },
  featureGrid: { featureIds: null },
  postList: { tag: null, limit: null },
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
 * `postList` -- each of those still reads off the same site-wide table
 * (ContentBlock/RuleSection+Rule/Feature/Post) via `referenceData`
 * (`page-renderer.tsx` fetches each once per page, not per instance), but as
 * of Phase 18 each *instance* carries its own optional display-level
 * filter/override in `Block.data` (see `heroDataSchema`/`ruleListDataSchema`/
 * `featureGridDataSchema`/`postListDataSchema` in `lib/validation/pages.ts`):
 * a Rule List can show a subset of sections, a Feature Grid a subset of
 * features, a Post List a single tag (optionally capped to N), and a Hero a
 * heading/tagline override (the live server-status ping stays global -- it's
 * describing the one real server, never per-instance). Unset/null on any of
 * these means "show everything," i.e. the original site-wide behavior.
 * Editing content (add/edit/delete a rule, feature, or post) still always
 * affects the one real underlying row regardless of which instance you're
 * editing from -- only the non-edit-mode filtered *view* differs per
 * instance. */
export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES;
