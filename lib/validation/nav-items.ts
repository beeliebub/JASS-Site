import { z } from "zod";
import { prisma } from "@/lib/prisma";

/**
 * NavItem validation -- split out from lib/validation/pages.ts because it
 * needs Prisma (to check parentId nesting depth), and pages.ts is imported
 * by components/blocks/registry.tsx, which is reachable from client
 * components. Only import this file from server-only code (API routes).
 */

const navItemBaseSchema = z.object({
  label: z.string().min(1).max(80),
  href: z.string().min(1).max(300).optional(),
  pageId: z.string().min(1).optional(),
  parentId: z.string().min(1).optional(),
  order: z.number().int(),
});

async function refineNavItemTarget(data: z.infer<typeof navItemBaseSchema>, ctx: z.RefinementCtx) {
  const hasHref = Boolean(data.href);
  const hasPageId = Boolean(data.pageId);
  if (hasHref === hasPageId) {
    ctx.addIssue({
      code: "custom",
      path: ["href"],
      message: "Exactly one of href or pageId must be set.",
    });
  }

  if (data.parentId) {
    const parent = await prisma.navItem.findUnique({ where: { id: data.parentId } });
    if (!parent) {
      ctx.addIssue({ code: "custom", path: ["parentId"], message: "Parent nav item not found." });
    } else if (parent.parentId) {
      ctx.addIssue({
        code: "custom",
        path: ["parentId"],
        message: "Nav items can only nest one level deep (parent must be top-level).",
      });
    }
  }
}

export const navItemCreateSchema = navItemBaseSchema.superRefine(refineNavItemTarget);

export const navItemUpdateSchema = navItemBaseSchema.partial().superRefine(async (data, ctx) => {
  // Only re-check the href/pageId XOR when at least one of them is present
  // in this partial update -- a reorder-only PUT shouldn't be forced to
  // resupply both.
  if (data.href !== undefined || data.pageId !== undefined) {
    await refineNavItemTarget(data as z.infer<typeof navItemBaseSchema>, ctx);
  } else if (data.parentId !== undefined) {
    await refineNavItemTarget({ ...data, href: "x" } as z.infer<typeof navItemBaseSchema>, ctx);
  }
});
