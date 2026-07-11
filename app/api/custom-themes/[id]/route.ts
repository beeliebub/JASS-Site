import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { customThemeUpdateSchema } from "@/lib/validation/custom-themes";
import { customThemeSnapshot, recordAuditLog } from "@/lib/audit-log";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = customThemeUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.customTheme.findUnique({ where: { id } });
    if (!existing) return notFound("Custom theme");

    if (parsed.data.name && parsed.data.name !== existing.name) {
      const nameTaken = await prisma.customTheme.findUnique({ where: { name: parsed.data.name } });
      if (nameTaken) return conflict(`A custom theme named "${parsed.data.name}" already exists.`);
    }

    const theme = await prisma.$transaction(async (tx) => {
      const updated = await tx.customTheme.update({ where: { id }, data: parsed.data });
      await recordAuditLog(tx, {
        entityType: "CustomTheme",
        entityId: id,
        action: "update",
        before: customThemeSnapshot(existing),
        after: customThemeSnapshot(updated),
        actorEmail: user?.email,
      });
      return updated;
    });

    revalidatePath("/", "layout");
    revalidatePath("/admin/themes");
    return apiSuccess(theme);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;
  const user = await getSessionUser();

  try {
    const existing = await prisma.customTheme.findUnique({ where: { id } });
    if (!existing) return notFound("Custom theme");

    // Page.customThemeId has onDelete: SetNull, so any page referencing this
    // theme silently reverts to the visitor's own theme -- no manual cleanup
    // query needed here (deliberate Phase 12 design decision).
    await prisma.$transaction(async (tx) => {
      await tx.customTheme.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "CustomTheme",
        entityId: id,
        action: "delete",
        before: customThemeSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath("/", "layout");
    revalidatePath("/admin/themes");
    revalidatePath("/admin/pages");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
