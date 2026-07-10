import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, conflict, internalError, notFound, unauthorized } from "@/lib/api-response";
import { packPath } from "@/lib/uploads";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

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

    await prisma.resourcePack.delete({ where: { id } });

    revalidatePath("/resource");
    return apiSuccess(null);
  } catch (error) {
    return internalError(error);
  }
}
