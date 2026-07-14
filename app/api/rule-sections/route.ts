import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, editingDisabled, internalError, unauthorized, validationError } from "@/lib/api-response";
import { ruleSectionCreateSchema } from "@/lib/validation/content";
import { requireOwningBlock } from "@/lib/block-ownership";

export async function GET() {
  try {
    const sections = await prisma.ruleSection.findMany({
      orderBy: { order: "asc" },
      include: { rules: { orderBy: { order: "asc" } } },
    });
    return apiSuccess(sections);
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = ruleSectionCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const owning = await requireOwningBlock(parsed.data.blockId, "ruleList");
  if (!owning.ok) return owning.response;

  try {
    const section = await prisma.ruleSection.create({ data: parsed.data });
    revalidatePath("/rules");
    return apiSuccess(section, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
