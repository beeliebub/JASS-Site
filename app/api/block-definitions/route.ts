import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, unauthorized, validationError } from "@/lib/api-response";
import { blockDefinitionCreateSchema } from "@/lib/validation/block-definitions";
import { blockDefinitionSnapshot, recordAuditLog } from "@/lib/audit-log";

/**
 * Not admin-gated -- same "not sensitive" reasoning as `GET /api/tags`:
 * block-type definitions (name/fields/layout) aren't sensitive, and the
 * page builder's "Add block" picker needs to read this list too, not just
 * the admin block-type builder. Only admins ever see the page builder in
 * the first place, so there's no real exposure either way.
 */
export async function GET() {
  try {
    const definitions = await prisma.blockDefinition.findMany({
      include: { fields: { orderBy: { order: "asc" } }, _count: { select: { blocks: true } } },
      orderBy: { name: "asc" },
    });
    return apiSuccess(definitions);
  } catch (error) {
    return internalError(error);
  }
}

/**
 * Creates a new admin-defined block type. Definition authorship is
 * OWNER + ADMIN (same as every other site-editing action), not
 * OWNER-only -- only user-account management is OWNER-only.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = blockDefinitionCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.blockDefinition.findUnique({ where: { key: parsed.data.key } });
    if (existing) return conflict(`A block type with key "${parsed.data.key}" already exists.`);

    const definition = await prisma.$transaction(async (tx) => {
      const created = await tx.blockDefinition.create({
        data: {
          key: parsed.data.key,
          name: parsed.data.name,
          description: parsed.data.description ?? null,
          layout: parsed.data.layout,
          createdBy: user?.email,
          fields: {
            create: parsed.data.fields.map((field) => ({
              key: field.key,
              label: field.label,
              fieldType: field.fieldType,
              order: field.order,
              required: field.required,
              helpText: field.helpText ?? null,
              config: JSON.stringify(field.config),
            })),
          },
        },
        include: { fields: true },
      });
      await recordAuditLog(tx, {
        entityType: "BlockDefinition",
        entityId: created.id,
        action: "create",
        before: null,
        after: blockDefinitionSnapshot(created),
        actorEmail: user?.email,
      });
      return created;
    });

    // No page currently reads this list server-side (the block-type builder
    // and the page-builder's "Add block" picker both fetch it client-side),
    // but revalidate the admin section it will live under anyway, matching
    // every other admin-mutation route's convention of revalidating its own
    // admin page.
    revalidatePath("/admin/block-types");
    return apiSuccess(definition, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
