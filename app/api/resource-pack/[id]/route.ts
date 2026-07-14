import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, conflict, editingDisabled, internalError, notFound, unauthorized } from "@/lib/api-response";
import { packPath } from "@/lib/uploads";
import { recordAuditLog, resourcePackSnapshot } from "@/lib/audit-log";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const user = await getSessionUser();
  const { id } = await params;

  try {
    const existing = await prisma.resourcePack.findUnique({ where: { id } });
    if (!existing) return notFound("Resource pack");
    if (existing.active) return conflict("Cannot delete the active pack.");

    // Unlink before deleting the row: if the unlink fails for a reason
    // other than "already gone" (e.g. a permissions/IO error), the row
    // stays around as a signal rather than silently vanishing while the
    // file it pointed at is stranded on disk with nothing left to find it.
    try {
      fs.unlinkSync(packPath(existing.sha1));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.resourcePack.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "ResourcePack",
        entityId: id,
        action: "delete",
        before: resourcePackSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath("/resource");
    return apiSuccess(null);
  } catch (error) {
    return internalError(error);
  }
}
