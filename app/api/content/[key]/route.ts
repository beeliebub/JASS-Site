import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, editingDisabled, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { contentBlockValueSchema } from "@/lib/validation/content";

export async function GET(_req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;

  try {
    const block = await prisma.contentBlock.findUnique({ where: { key } });
    if (!block) return notFound("Content block");
    return apiSuccess(block);
  } catch (error) {
    return internalError(error);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ key: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const { key } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = contentBlockValueSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const block = await prisma.contentBlock.upsert({
      where: { key },
      create: { key, value: parsed.data.value, updatedBy: user?.email },
      update: { value: parsed.data.value, updatedBy: user?.email },
    });
    // ContentBlock rows currently only back the home hero — revalidate it so
    // visitors see the change on their next load.
    revalidatePath("/");
    return apiSuccess(block);
  } catch (error) {
    return internalError(error);
  }
}
