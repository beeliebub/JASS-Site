import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { ruleSectionUpdateSchema } from "@/lib/validation/content";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = ruleSectionUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await prisma.ruleSection.findUnique({ where: { id } });
    if (!existing) return notFound("Rule section");

    const section = await prisma.ruleSection.update({ where: { id }, data: parsed.data });
    revalidatePath("/rules");
    return apiSuccess(section);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  try {
    const existing = await prisma.ruleSection.findUnique({ where: { id } });
    if (!existing) return notFound("Rule section");

    // Rule.section has onDelete: Cascade, so this also removes its rules.
    await prisma.ruleSection.delete({ where: { id } });
    revalidatePath("/rules");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
