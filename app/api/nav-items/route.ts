import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { navItemCreateSchema } from "@/lib/validation/nav-items";
import { navItemSnapshot, recordAuditLog } from "@/lib/audit-log";

export async function GET() {
  try {
    const items = await prisma.navItem.findMany({
      where: { parentId: null },
      orderBy: { order: "asc" },
      include: { children: { orderBy: { order: "asc" } } },
    });
    return apiSuccess(items);
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

  const parsed = await navItemCreateSchema.safeParseAsync(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    if (parsed.data.pageId) {
      const page = await prisma.page.findUnique({ where: { id: parsed.data.pageId } });
      if (!page) return notFound("Page");
    }

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.navItem.create({ data: parsed.data });
      await recordAuditLog(tx, {
        entityType: "NavItem",
        entityId: created.id,
        action: "create",
        before: null,
        after: navItemSnapshot(created),
        actorEmail: user?.email,
      });
      return created;
    });
    // The header nav renders on every page, so hit the whole tree in one call.
    revalidatePath("/", "layout");
    return apiSuccess(item, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
