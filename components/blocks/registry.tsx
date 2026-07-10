import type { ComponentType, ReactNode } from "react";
import type { Feature, Rule, RuleSection } from "@/app/generated/prisma/client";
import { Container } from "@/components/container";
import { RulesEditor } from "@/components/rules/rules-editor";
import { FeaturesEditor } from "@/components/features/features-editor";
import { PostsEditor, type ClientPost } from "@/components/news/posts-editor";
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
 * existing Phase 2/4 editor components unchanged, backed by data
 * pre-fetched server-side in page-renderer.tsx and threaded through as
 * `referenceData` -- these components (RulesEditor/FeaturesEditor/
 * PostsEditor) already accept plain serializable "initial*" props, so no
 * server/client boundary issue. `hero` is the one exception: `Hero()` is
 * itself an async Server Component with no props (it fetches its own
 * ContentBlock data), so page-renderer.tsx pre-renders `<Hero />` on the
 * server and hands the opaque result down as `block.heroContent`.
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
  heroContent?: ReactNode;
};

export type BlockComponentProps = {
  block: ClientBlock;
  referenceData: ReferenceData;
  onSaveData: (next: unknown) => Promise<void>;
};

export const blockComponents: Record<BlockType, ComponentType<BlockComponentProps>> = {
  hero: ({ block }) => <>{block.heroContent}</>,
  // These 3 (unlike hero, and unlike every data-carrying block below) don't
  // self-wrap in a Container -- RulesEditor/FeaturesEditor/PostsEditor were
  // written to be placed inside a page-level Container alongside sibling
  // JSX, matching each type's original page (app/rules|features|news) so the
  // visual rhythm carries over now that pageHeader is a separate block.
  ruleList: ({ referenceData }) => (
    <Container className="py-8 sm:py-10">
      <RulesEditor initialSections={referenceData.ruleSections ?? []} />
    </Container>
  ),
  featureGrid: ({ referenceData }) => (
    <Container className="py-12 sm:py-16">
      <FeaturesEditor initialFeatures={referenceData.features ?? []} />
    </Container>
  ),
  postList: ({ referenceData }) => (
    <Container className="flex flex-1 flex-col py-8 sm:py-10">
      <PostsEditor initialPosts={referenceData.posts ?? []} />
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
  hero: {},
  ruleList: {},
  featureGrid: {},
  postList: {},
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
 * `postList` -- each of those always reads the same site-wide singleton
 * table (ContentBlock/Rule/Feature/Post) via `referenceData` regardless of
 * which page/position it's placed at, so placing a second one elsewhere
 * intentionally repeats that same content (e.g. embedding the live
 * server-status widget or the full rules list on another page) rather than
 * showing distinct per-instance data. Admins who want distinct per-instance
 * content should use `cardGrid` instead. */
export const ADDABLE_BLOCK_TYPES = BLOCK_TYPES;
