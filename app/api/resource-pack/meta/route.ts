import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api-response";

export async function GET() {
  const packs = await prisma.resourcePack.findMany({
    select: { id: true, filename: true, size: true, sha1: true, uuid: true, uploadedAt: true },
    orderBy: { uploadedAt: "desc" },
  });
  return apiSuccess(packs);
}
