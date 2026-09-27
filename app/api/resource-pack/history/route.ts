import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, unauthorized } from "@/lib/api-response";

export async function GET() {
  if (!(await requireAdmin())) return unauthorized();

  const packs = await prisma.resourcePack.findMany({
    select: { id: true, filename: true, size: true, sha1: true, uuid: true, active: true, uploadedAt: true, uploadedBy: true },
    orderBy: { uploadedAt: "desc" },
  });
  return apiSuccess(packs);
}
