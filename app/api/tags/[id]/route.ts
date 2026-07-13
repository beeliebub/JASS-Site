import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { tagUpdateSchema } from "@/lib/validation/content";
import { recordAuditLog, tagSnapshot } from "@/lib/audit-log";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = tagUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.tag.findUnique({ where: { id } });
    if (!existing) return notFound("Tag");

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const nameTaken = await prisma.tag.findUnique({ where: { name: parsed.data.name } });
      if (nameTaken) return conflict(`A tag named "${parsed.data.name}" already exists.`);
    }

    const tag = await prisma.$transaction(async (tx) => {
      const updated = await tx.tag.update({ where: { id }, data: parsed.data });
      await recordAuditLog(tx, {
        entityType: "Tag",
        entityId: id,
        action: "update",
        before: tagSnapshot(existing),
        after: tagSnapshot(updated),
        actorEmail: user?.email,
      });
      return updated;
    });

    revalidatePath("/news");
    revalidatePath("/admin/tags");
    return apiSuccess(tag);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;
  const user = await getSessionUser();

  try {
    const existing = await prisma.tag.findUnique({ where: { id }, include: { _count: { select: { posts: true } } } });
    if (!existing) return notFound("Tag");

    // Re-derive usage server-side right before deleting -- never trust a
    // client-supplied "this is unused" claim, same pattern as
    // DELETE /api/uploads/images/[id].
    if (existing._count.posts > 0) {
      return conflict("This tag is still used by at least one post.");
    }

    await prisma.$transaction(async (tx) => {
      await tx.tag.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "Tag",
        entityId: id,
        action: "delete",
        before: tagSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath("/news");
    revalidatePath("/admin/tags");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
