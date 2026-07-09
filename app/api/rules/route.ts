import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, unauthorized, validationError } from "@/lib/api-response";
import { ruleCreateSchema } from "@/lib/validation/content";

// Rules take their parent via `sectionId` in the body rather than nesting
// under /api/rule-sections/:id/rules — keeps the resource flat and matches
// how the admin editor addresses/reorders individual rules directly.
export async function GET(req: NextRequest) {
  const sectionId = req.nextUrl.searchParams.get("sectionId");

  try {
    const rules = await prisma.rule.findMany({
      where: sectionId ? { sectionId } : undefined,
      orderBy: { order: "asc" },
    });
    return apiSuccess(rules);
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = ruleCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const section = await prisma.ruleSection.findUnique({ where: { id: parsed.data.sectionId } });
    if (!section) return badRequest(`No rule section with id "${parsed.data.sectionId}".`);

    const rule = await prisma.rule.create({ data: parsed.data });
    revalidatePath("/rules");
    return apiSuccess(rule, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
