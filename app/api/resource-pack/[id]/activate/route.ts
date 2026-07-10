import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, conflict, internalError, notFound, unauthorized } from "@/lib/api-response";
import { packPath } from "@/lib/uploads";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

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

    const pack = await prisma.$transaction(async (tx) => {
      await tx.resourcePack.updateMany({ where: { active: true }, data: { active: false } });
      return tx.resourcePack.update({ where: { id }, data: { active: true } });
    });

    revalidatePath("/resource");
    return apiSuccess(pack);
  } catch (error) {
    return internalError(error);
  }
}
