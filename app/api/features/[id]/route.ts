import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { featureUpdateSchema } from "@/lib/validation/content";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = featureUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await prisma.feature.findUnique({ where: { id } });
    if (!existing) return notFound("Feature");

    const feature = await prisma.feature.update({ where: { id }, data: parsed.data });
    revalidatePath("/features");
    return apiSuccess(feature);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  try {
    const existing = await prisma.feature.findUnique({ where: { id } });
    if (!existing) return notFound("Feature");

    await prisma.feature.delete({ where: { id } });
    revalidatePath("/features");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
