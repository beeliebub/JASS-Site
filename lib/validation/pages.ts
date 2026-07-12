import { z } from "zod";
import { THEME_IDS, TONES } from "@/lib/themes";

/**
 * Validation for the Phase 8 page builder (Page/Block) and user management.
 * Kept separate from lib/validation/content.ts, which covers the Phase 2
 * flat resources (ContentBlock/Rule/RuleSection/Feature/Post) that are
 * unrelated to this domain. NavItem schemas live in
 * lib/validation/nav-items.ts (see note further down) since they need
 * Prisma and this file must stay importable from client components.
 */

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

// Slugs that must never be claimed by a new/renamed custom Page: the 3 fixed
// static routes that would otherwise collide with app/[slug]/page.tsx's
// catch-all, plus the 4 protected pages' own slugs (a *new* page can't steal
// "rules" out from under the real Rules page -- and since the real Rules
// page is `protected: true`, it can never rename itself away from "rules"
// either, so this list is safe to check unconditionally against slug changes
// as long as protected-page slug changes are already rejected earlier -- see
// `assertProtectedSlugUnchanged` below).
export const RESERVED_SLUGS = ["admin", "login", "api", "home", "rules", "features", "news", "resource"] as const;

export const slugSchema = z
  .string()
  .min(1)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case");

/** One of `lib/themes.ts`' `THEME_IDS`, or `null`/absent meaning "follow
 * visitor theme" -- see `Page.theme` in prisma/schema.prisma. */
export const themeSchema = z.enum(THEME_IDS);

function refineNotReserved<T extends { slug?: string }>(data: T, ctx: z.RefinementCtx) {
  if (data.slug && (RESERVED_SLUGS as readonly string[]).includes(data.slug)) {
    ctx.addIssue({ code: "custom", path: ["slug"], message: `"${data.slug}" is a reserved slug.` });
  }
}

/** `theme` (built-in) and `customThemeId` (Phase 12) are mutually exclusive --
 * a page follows at most one theme override. The admin UI's theme dropdown
 * always sends both fields together on a change (the non-chosen one as
 * `null`), so this only ever rejects a malformed/direct API call, not normal
 * UI usage. */
function refineExclusiveTheme<T extends { theme?: string | null; customThemeId?: string | null }>(
  data: T,
  ctx: z.RefinementCtx,
) {
  if (data.theme && data.customThemeId) {
    ctx.addIssue({
      code: "custom",
      path: ["customThemeId"],
      message: "theme and customThemeId cannot both be set -- pick one.",
    });
  }
}

export const pageCreateSchema = z
  .object({
    title: z.string().min(1).max(200),
    slug: slugSchema.optional(),
    metaDescription: z.string().max(300).nullable().optional(),
    published: z.boolean().optional(),
    adminOnly: z.boolean().optional(),
    theme: themeSchema.nullable().optional(),
    customThemeId: z.string().min(1).nullable().optional(),
  })
  .superRefine(refineNotReserved)
  .superRefine(refineExclusiveTheme);

export const pageUpdateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    slug: slugSchema.optional(),
    metaDescription: z.string().max(300).nullable().optional(),
    published: z.boolean().optional(),
    adminOnly: z.boolean().optional(),
    theme: themeSchema.nullable().optional(),
    customThemeId: z.string().min(1).nullable().optional(),
  })
  .superRefine(refineNotReserved)
  .superRefine(refineExclusiveTheme);

/**
 * Server-side (not just UI) enforcement that protected pages (home, rules,
 * features, news) never change slug. Call after fetching the existing Page
 * row and before applying a PUT. Returns an error message, or null if OK.
 */
export function protectedSlugChangeError(
  existing: { protected: boolean; slug: string },
  nextSlug: string | undefined,
): string | null {
  if (existing.protected && nextSlug !== undefined && nextSlug !== existing.slug) {
    return "Protected pages can't change slug.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blocks
// ---------------------------------------------------------------------------

export const BLOCK_TYPES = [
  "hero",
  "ruleList",
  "featureGrid",
  "postList",
  "pageHeader",
  "callout",
  "steps",
  "linkGrid",
  "richText",
  "image",
  "ctaBanner",
  "cardGrid",
  "code",
  "accordion",
  "table",
  "toc",
] as const;

export type BlockType = (typeof BLOCK_TYPES)[number];

/** Shared block-tone enum (Phase 9) -- see `lib/themes.ts`. Widens
 * `calloutDataSchema.variant` in place (JSON key stays `variant`, existing
 * "warning"/"info" rows remain valid) and backs the optional `tone` field on
 * pageHeader/ctaBanner/linkGrid below. */
export const toneSchema = z.enum(TONES);

const pageHeaderDataSchema = z.object({
  eyebrow: z.string().max(80).optional(),
  heading: z.string().min(1).max(200),
  description: z.string().max(1000).optional(),
  tone: toneSchema.optional(),
});

const calloutDataSchema = z.object({
  variant: toneSchema,
  body: z.string().min(1).max(2000),
});

const stepsDataSchema = z.object({
  heading: z.string().min(1).max(80).optional(),
  items: z
    .array(
      z.object({
        number: z.string().min(1).max(10),
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(500),
      }),
    )
    .max(20),
});

/** Phase 19: optional per-item thumbnail, same URL convention/validation as
 * `imageDataSchema.src` (reuses the same upload pipeline, not a new one) --
 * absent/"" = today's exact layout (no thumbnail column). */
const linkGridDataSchema = z.object({
  heading: z.string().min(1).max(80).optional(),
  links: z
    .array(
      z.object({
        href: z.string().min(1).max(300),
        title: z.string().min(1).max(200),
        description: z.string().min(1).max(500),
        image: z
          .string()
          .max(2000)
          .optional()
          .refine((s) => s === undefined || s === "" || isHttpUrl(s) || isRootRelativePath(s), {
            message: "image must be an absolute http(s) URL or a root-relative path.",
          }),
      }),
    )
    .max(20),
  tone: toneSchema.optional(),
});

const richTextDataSchema = z.object({
  markdown: z.string().max(20000),
});

/** `src`/`alt` may both be "" -- ImageBlock renders a "No image URL set"
 * placeholder in that state (see components/blocks/image-block.tsx), and a
 * freshly-added block starts out that way. Once `src` is non-empty it must
 * be either an absolute http(s) URL (externally-hosted image) or a
 * root-relative path (an image uploaded via `POST /api/uploads/images`,
 * Phase 14 -- see that route's `url` response field), and `alt` becomes
 * required for accessibility. Deliberately excludes `javascript:`, `data:`,
 * and protocol-relative (`//host/...`) strings, none of which are safe to
 * hand straight to an `<img src>`. */
const isRootRelativePath = (s: string) => /^\/(?!\/)\S*$/.test(s);
const isHttpUrl = (s: string) => {
  const parsed = z.string().url().safeParse(s);
  return parsed.success && (s.startsWith("http://") || s.startsWith("https://"));
};

/** Phase 19: optional display-size override, unset/null = today's exact
 * behavior (full-width, natural aspect ratio). `scale` only applies under
 * `"scale"` mode, `width`/`height` only under `"custom"` -- both bounded so a
 * typo (or a hostile direct API call) can't blow out the page layout; these
 * are applied by ImageBlock as numeric inline `style` properties, never a
 * passthrough string that could carry arbitrary CSS. */
const imageSizeSchema = z.object({
  sizeMode: z.enum(["scale", "custom"]).nullable().optional(),
  scale: z.number().int().min(10).max(100).nullable().optional(),
  width: z.number().int().min(1).max(2000).nullable().optional(),
  height: z.number().int().min(1).max(2000).nullable().optional(),
});

const imageDataSchema = z
  .object({
    src: z.string().max(2000),
    alt: z.string().max(300),
    caption: z.string().max(500).optional(),
  })
  .extend(imageSizeSchema.shape)
  .refine((data) => data.src === "" || isHttpUrl(data.src) || isRootRelativePath(data.src), {
    message: "src must be an absolute http(s) URL or a root-relative path.",
    path: ["src"],
  })
  .refine((data) => data.src === "" || data.alt.length > 0, {
    message: "alt is required once an image URL is set.",
    path: ["alt"],
  });

const ctaBannerDataSchema = z.object({
  heading: z.string().min(1).max(200),
  body: z.string().max(1000).optional(),
  buttonLabel: z.string().min(1).max(60),
  buttonHref: z.string().min(1).max(300),
  tone: toneSchema.optional(),
});

/** Phase 15: new, independent block type -- NOT a change to `featureGrid`.
 * Stores its own cards per instance (like `steps`/`linkGrid`) so it can be
 * placed multiple times across the site with different content each time. */
const cardGridDataSchema = z.object({
  heading: z.string().max(80).optional(),
  tone: toneSchema.optional(),
  cards: z
    .array(
      z.object({
        icon: z.string().optional(),
        title: z.string().min(1).max(80),
        description: z.string().min(1).max(400),
      }),
    )
    .max(20),
});

/** Phase 15: themed monospace code block, no syntax highlighting (see
 * PLAN.md decision 6). */
const codeDataSchema = z.object({
  code: z.string().min(1).max(20000),
  language: z.string().max(40).optional(),
  caption: z.string().max(200).optional(),
});

/** Phase 15: accordion/FAQ. Open/closed state is pure client UI state, never
 * persisted here. */
const accordionDataSchema = z.object({
  tone: toneSchema.optional(),
  items: z
    .array(
      z.object({
        question: z.string().min(1).max(200),
        answer: z.string().min(1).max(4000),
      }),
    )
    .max(20),
});

/** Phase 15: admin-authored data table. `.refine` keeps every row's length
 * equal to `headers.length` -- TableBlock's column add/remove must keep this
 * invariant true at every step (pad/trim every row in the same update). */
const tableDataSchema = z
  .object({
    caption: z.string().max(200).optional(),
    headers: z.array(z.string().max(80)).max(12),
    rows: z.array(z.array(z.string().max(400))).max(50),
  })
  .refine((data) => data.rows.every((r) => r.length === data.headers.length), {
    message: "Row length must match header count",
    path: ["rows"],
  });

/** Phase 15: admin-curated table of contents (not auto-derived from
 * headings -- see PLAN.md decision 5). `anchor` is restricted to a safe
 * charset and is always rendered by TocBlock as `href={`#${anchor}`}` --
 * never the raw stored string -- so a `javascript:`/external-URL value can
 * never reach an `<a href>`. */
const tocDataSchema = z.object({
  heading: z.string().max(80).optional(),
  items: z
    .array(
      z.object({
        label: z.string().min(1).max(80),
        anchor: z
          .string()
          .min(1)
          .max(80)
          .regex(/^[a-zA-Z0-9-_]+$/, "anchor must be letters, numbers, hyphens, or underscores"),
      }),
    )
    .max(30),
});

/** `hero` (Phase 18) still overrides heading/tagline per-instance directly
 * on `block.data` -- it reads a singleton (`getSiteContent()`), not a shared
 * collection, so it never had the "which rows show" problem Phases 25-27
 * fixed for the other three data-referencing block types below. */
const heroDataSchema = z.object({
  headingOverride: z.string().max(200).nullable().optional(),
  taglineOverride: z.string().max(300).nullable().optional(),
});

/** PLAN.md Phases 25-27: ruleList/featureGrid/postList blocks each own their
 * rows via `RuleSection.blockId`/`Feature.blockId`/`Post.blockId` now, so
 * there's no shared pool left to hand-pick from -- a block just shows
 * everything it owns. `ruleListDataSchema`/`featureGridDataSchema` carry
 * nothing at all (kept as objects, not removed, so `Block.data` still
 * round-trips through the same per-type-schema shape as every other block
 * type). `postListDataSchema` keeps only `limit`, an admin-configured cap on
 * how many of this instance's own posts render on the page -- the old
 * persisted `tag` filter is gone too: tag filtering is a *viewing* feature
 * only now (the ephemeral, non-persisting visitor-facing control in
 * `components/news/posts-editor.tsx`), not an admin content-curation choice
 * saved per instance, so it never belonged in `Block.data` to begin with. */
const ruleListDataSchema = z.object({});

const featureGridDataSchema = z.object({});

const postListDataSchema = z.object({
  limit: z.number().int().min(1).max(200).nullable().optional(),
});

/** Per-type `data` shape, keyed by `Block.type`. Used both to validate on
 * write (POST/PUT) and to guard on read-back before rendering. */
export const blockDataSchemas = {
  hero: heroDataSchema,
  ruleList: ruleListDataSchema,
  featureGrid: featureGridDataSchema,
  postList: postListDataSchema,
  pageHeader: pageHeaderDataSchema,
  callout: calloutDataSchema,
  steps: stepsDataSchema,
  linkGrid: linkGridDataSchema,
  richText: richTextDataSchema,
  image: imageDataSchema,
  ctaBanner: ctaBannerDataSchema,
  cardGrid: cardGridDataSchema,
  code: codeDataSchema,
  accordion: accordionDataSchema,
  table: tableDataSchema,
  toc: tocDataSchema,
} as const satisfies Record<BlockType, z.ZodTypeAny>;

export const blockTypeSchema = z.enum(BLOCK_TYPES);

/** Full discriminated union for `POST /api/blocks` bodies. */
export const blockCreateSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("hero"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.hero }),
  z.object({
    type: z.literal("ruleList"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.ruleList,
  }),
  z.object({
    type: z.literal("featureGrid"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.featureGrid,
  }),
  z.object({
    type: z.literal("postList"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.postList,
  }),
  z.object({
    type: z.literal("pageHeader"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.pageHeader,
  }),
  z.object({
    type: z.literal("callout"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.callout,
  }),
  z.object({ type: z.literal("steps"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.steps }),
  z.object({
    type: z.literal("linkGrid"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.linkGrid,
  }),
  z.object({
    type: z.literal("richText"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.richText,
  }),
  z.object({ type: z.literal("image"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.image }),
  z.object({
    type: z.literal("ctaBanner"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.ctaBanner,
  }),
  z.object({
    type: z.literal("cardGrid"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.cardGrid,
  }),
  z.object({ type: z.literal("code"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.code }),
  z.object({
    type: z.literal("accordion"),
    pageId: z.string().min(1),
    order: z.number().int(),
    data: blockDataSchemas.accordion,
  }),
  z.object({ type: z.literal("table"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.table }),
  z.object({ type: z.literal("toc"), pageId: z.string().min(1), order: z.number().int(), data: blockDataSchemas.toc }),
]);

/** `PUT /api/blocks/[id]` body: reordering and/or a content edit. `data`'s
 * shape depends on the block's existing `type` (not part of the body), so
 * it's validated separately in the route via `blockDataSchemas[type]` once
 * the existing block has been fetched. */
export const blockUpdateSchema = z
  .object({
    order: z.number().int().optional(),
    data: z.unknown().optional(),
  })
  .refine((v) => v.order !== undefined || v.data !== undefined, {
    message: "Provide at least one of order or data.",
  });

/** Parses raw `data` against the schema for `type`. Returns a Zod
 * SafeParseReturnType so callers can distinguish "unknown type" from
 * "known type, bad shape" and respond accordingly. */
export function parseBlockData(type: string, data: unknown) {
  const schema = (blockDataSchemas as Record<string, z.ZodTypeAny>)[type];
  if (!schema) {
    return { success: false as const, error: new z.ZodError([{ code: "custom", path: ["type"], message: `Unknown block type "${type}".` }]) };
  }
  return schema.safeParse(data);
}

// Nav items: see lib/validation/nav-items.ts. Split into its own file
// because those schemas need Prisma (to check parentId depth), and this
// file is imported by components/blocks/registry.tsx -- a module reachable
// from client components (for BLOCK_TYPES/blockDataSchemas). Pulling Prisma
// (and therefore better-sqlite3/node built-ins) into that file breaks the
// client bundle, so the two domains can't share a module here.

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

export const roleSchema = z.enum(["OWNER", "ADMIN"]);

export const userCreateSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(8).max(200),
  name: z.string().min(1).max(200).optional(),
  role: roleSchema,
});

export const userUpdateSchema = z.object({
  email: z.string().email().max(200).optional(),
  password: z.string().min(8).max(200).optional(),
  name: z.string().min(1).max(200).nullable().optional(),
  role: roleSchema.optional(),
});

/** `PUT /api/account/password` body (Phase 13 self-service password change).
 * Kept separate from `userUpdateSchema` -- that route is owner-only and
 * touches an arbitrary user by id, this one always targets the caller's own
 * row via `session.user.id` and requires re-proving the current password. */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});
