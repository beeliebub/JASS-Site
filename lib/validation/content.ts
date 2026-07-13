import { z } from "zod";

export const contentBlockValueSchema = z.object({
  value: z.string().min(1, "value is required"),
});

export const ruleSectionCreateSchema = z.object({
  blockId: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().min(1),
});

// Owning block is permanent once a section is created --
// `omit` keeps `blockId` out of the update body entirely so a PUT can never
// reassign ownership, not just "usually won't."
export const ruleSectionUpdateSchema = ruleSectionCreateSchema.omit({ blockId: true }).partial();

export const ruleCreateSchema = z.object({
  sectionId: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const ruleUpdateSchema = ruleCreateSchema.partial();

export const featureCreateSchema = z.object({
  blockId: z.string().min(1),
  order: z.number().int(),
  // Optional -- unlike title/description, a feature can be shown with no
  // eyebrow label at all (see FeatureCard's non-empty gate).
  eyebrow: z.string(),
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  accent: z.boolean().optional(),
});

// Owning block is permanent once a feature is created --
// see ruleSectionUpdateSchema's comment above for why `blockId` is omitted
// rather than just left optional.
export const featureUpdateSchema = featureCreateSchema.omit({ blockId: true }).partial();

export const postCreateSchema = z.object({
  blockId: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  // At least one tag required, matching the pre-Tag-model UX where `tag` was
  // a single required free-text field. Each entry must resolve to a real Tag
  // row -- checked server-side in the route, not here (Zod has no DB access).
  tagIds: z.array(z.string().min(1)).min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  body: z.string().nullable().optional(),
  publishedAt: z.coerce.date(),
  author: z.string().nullable().optional(),
});

// Owning block is permanent once a post is created -- see
// ruleSectionUpdateSchema's comment above for why `blockId` is omitted
// rather than just left optional.
export const postUpdateSchema = postCreateSchema.omit({ blockId: true }).partial();

// Strict lowercase-normalized `#rrggbb` -- same shape/rationale as
// lib/validation/custom-themes.ts's hexColorSchema (accepts either case on
// input, stores canonical lowercase).
const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i, "must be a #rrggbb hex color")
  .transform((v) => v.toLowerCase());

export const tagCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: hexColorSchema,
});

export const tagUpdateSchema = tagCreateSchema.partial();

// Same literal used to backfill pre-existing tags in the post_tags_many_to_many
// migration (approximates the obsidian theme's --accent token, see
// lib/themes.ts / app/globals.css) -- reused here so a brand-new tag created
// inline from the post editor starts out looking the same as a migrated one,
// editable later from /admin/tags.
export const DEFAULT_TAG_COLOR = "#e8a94a";
