import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { blockCreateSchema } from "@/lib/validation/pages";
import { pagePath } from "@/lib/content";
import { blockSnapshot, recordAuditLog } from "@/lib/audit-log";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = blockCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const page = await prisma.page.findUnique({ where: { id: parsed.data.pageId } });
    if (!page) return notFound("Page");

    const block = await prisma.$transaction(async (tx) => {
      const created = await tx.block.create({
        data: {
          pageId: parsed.data.pageId,
          type: parsed.data.type,
          order: parsed.data.order,
          data: JSON.stringify(parsed.data.data),
          updatedBy: user?.email,
        },
      });
      await recordAuditLog(tx, {
        entityType: "Block",
        entityId: created.id,
        action: "create",
        before: null,
        after: blockSnapshot(created),
        actorEmail: user?.email,
      });
      return created;
    });

    revalidatePath(pagePath(page.slug));
    return apiSuccess(block, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
