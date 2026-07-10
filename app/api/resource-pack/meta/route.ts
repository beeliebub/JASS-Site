import { prisma } from "@/lib/prisma";
import { apiSuccess } from "@/lib/api-response";

export async function GET() {
  const pack = await prisma.resourcePack.findFirst({ where: { active: true } });
  return apiSuccess(
    pack ? { filename: pack.filename, size: pack.size, sha1: pack.sha1, uploadedAt: pack.uploadedAt } : null,
  );
}
