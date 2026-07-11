import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, conflict, internalError, notFound, unauthorized } from "@/lib/api-response";
import { packPath } from "@/lib/uploads";
import { recordAuditLog, resourcePackSnapshot } from "@/lib/audit-log";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const user = await getSessionUser();
  const { id } = await params;

  try {
    const existing = await prisma.resourcePack.findUnique({ where: { id } });
    if (!existing) return notFound("Resource pack");

    let filePath: string;
    try {
      filePath = packPath(existing.sha1);
    } catch (error) {
      console.error(`Resource pack ${existing.id} has an invalid sha1 "${existing.sha1}".`, error);
      return conflict("Resource pack has an invalid sha1 on record and cannot be activated.");
    }

    if (!fs.existsSync(filePath)) {
      console.error(`Data-integrity drift: resource pack ${existing.id} has no file on disk at ${filePath}.`);
      return conflict(`Resource pack ${existing.sha1} is missing its file on disk.`);
    }

    const previouslyActive = await prisma.resourcePack.findFirst({ where: { active: true } });

    const pack = await prisma.$transaction(async (tx) => {
      await tx.resourcePack.updateMany({ where: { active: true }, data: { active: false } });
      const updated = await tx.resourcePack.update({ where: { id }, data: { active: true } });

      if (previouslyActive && previouslyActive.id !== updated.id) {
        await recordAuditLog(tx, {
          entityType: "ResourcePack",
          entityId: previouslyActive.id,
          action: "update",
          before: resourcePackSnapshot(previouslyActive),
          after: { ...resourcePackSnapshot(previouslyActive), active: false },
          actorEmail: user?.email,
        });
      }

      await recordAuditLog(tx, {
        entityType: "ResourcePack",
        entityId: id,
        action: "update",
        before: resourcePackSnapshot(existing),
        after: resourcePackSnapshot(updated),
        actorEmail: user?.email,
      });

      return updated;
    });

    revalidatePath("/resource");
    return apiSuccess(pack);
  } catch (error) {
    return internalError(error);
  }
}
