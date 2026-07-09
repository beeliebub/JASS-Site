import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { ruleUpdateSchema } from "@/lib/validation/content";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = ruleUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await prisma.rule.findUnique({ where: { id } });
    if (!existing) return notFound("Rule");

    if (parsed.data.sectionId) {
      const section = await prisma.ruleSection.findUnique({ where: { id: parsed.data.sectionId } });
      if (!section) return badRequest(`No rule section with id "${parsed.data.sectionId}".`);
    }

    const rule = await prisma.rule.update({ where: { id }, data: parsed.data });
    revalidatePath("/rules");
    return apiSuccess(rule);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  try {
    const existing = await prisma.rule.findUnique({ where: { id } });
    if (!existing) return notFound("Rule");

    await prisma.rule.delete({ where: { id } });
    revalidatePath("/rules");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
