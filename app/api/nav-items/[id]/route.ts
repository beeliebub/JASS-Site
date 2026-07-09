import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { navItemUpdateSchema } from "@/lib/validation/nav-items";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = await navItemUpdateSchema.safeParseAsync(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await prisma.navItem.findUnique({ where: { id }, include: { children: true } });
    if (!existing) return notFound("Nav item");

    if (parsed.data.parentId === id) {
      return badRequest("A nav item can't be its own parent.");
    }
    if (parsed.data.parentId !== undefined && existing.children.length > 0) {
      return badRequest("This item has dropdown children -- it can't also become a child itself (one level of nesting only).");
    }
    if (parsed.data.pageId) {
      const page = await prisma.page.findUnique({ where: { id: parsed.data.pageId } });
      if (!page) return notFound("Page");
    }

    const item = await prisma.navItem.update({ where: { id }, data: parsed.data });
    revalidatePath("/", "layout");
    return apiSuccess(item);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  try {
    const existing = await prisma.navItem.findUnique({ where: { id } });
    if (!existing) return notFound("Nav item");

    // children have onDelete: Cascade, so this also removes any dropdown items.
    await prisma.navItem.delete({ where: { id } });
    revalidatePath("/", "layout");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
