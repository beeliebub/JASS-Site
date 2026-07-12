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

// Owning block is permanent once a section is created (PLAN.md Phase 26) --
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
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  accent: z.boolean().optional(),
});

// Owning block is permanent once a feature is created (PLAN.md Phase 27) --
// see ruleSectionUpdateSchema's comment above for why `blockId` is omitted
// rather than just left optional.
export const featureUpdateSchema = featureCreateSchema.omit({ blockId: true }).partial();

export const postCreateSchema = z.object({
  blockId: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase kebab-case"),
  tag: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  body: z.string().nullable().optional(),
  publishedAt: z.coerce.date(),
  author: z.string().nullable().optional(),
});

// Owning block is permanent once a post is created (PLAN.md Phase 25) -- see
// ruleSectionUpdateSchema's comment above for why `blockId` is omitted
// rather than just left optional.
export const postUpdateSchema = postCreateSchema.omit({ blockId: true }).partial();
