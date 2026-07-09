import { z } from "zod";

export const contentBlockValueSchema = z.object({
  value: z.string().min(1, "value is required"),
});

export const ruleSectionCreateSchema = z.object({
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const ruleSectionUpdateSchema = ruleSectionCreateSchema.partial();

export const ruleCreateSchema = z.object({
  sectionId: z.string().min(1),
  order: z.number().int(),
  title: z.string().min(1),
  description: z.string().min(1),
});

export const ruleUpdateSchema = ruleCreateSchema.partial();

export const featureCreateSchema = z.object({
  order: z.number().int(),
  eyebrow: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  icon: z.string().min(1),
  accent: z.boolean().optional(),
});

export const featureUpdateSchema = featureCreateSchema.partial();

export const postCreateSchema = z.object({
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

export const postUpdateSchema = postCreateSchema.partial();
