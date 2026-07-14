import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, editingDisabled, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import {
  blockDefinitionEffectiveRenderSchema,
  blockDefinitionUpdateSchema,
} from "@/lib/validation/block-definitions";
import { blockDefinitionSnapshot, recordAuditLog } from "@/lib/audit-log";

/** Ungated, same reasoning as `GET /api/block-definitions`. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const definition = await prisma.blockDefinition.findUnique({
      where: { id },
      include: { fields: { orderBy: { order: "asc" } }, _count: { select: { blocks: true } } },
    });
    if (!definition) return notFound("Block type");
    return apiSuccess(definition);
  } catch (error) {
    return internalError(error);
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = blockDefinitionUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.blockDefinition.findUnique({ where: { id }, include: { fields: true } });
    if (!existing) return notFound("Block type");

    const effectiveFields =
      parsed.data.fields ??
      existing.fields.map((field) => ({
        key: field.key,
        label: field.label,
        fieldType: field.fieldType,
        order: field.order,
        required: field.required,
        helpText: field.helpText,
        config: JSON.parse(field.config) as unknown,
      }));
    const effectiveRender = blockDefinitionEffectiveRenderSchema.safeParse({
      renderMode: parsed.data.renderMode ?? existing.renderMode,
      htmlTemplate: parsed.data.htmlTemplate !== undefined ? parsed.data.htmlTemplate : existing.htmlTemplate,
      fields: effectiveFields,
    });
    if (!effectiveRender.success) return validationError(effectiveRender.error);

    const definition = await prisma.$transaction(async (tx) => {
      // Reconciling a field-level diff (which fields were added/removed/
      // reordered vs. just edited) isn't worth the complexity here --
      // replace the whole set atomically instead, same as the rest of this
      // update.
      if (parsed.data.fields !== undefined) {
        await tx.blockFieldDefinition.deleteMany({ where: { blockDefinitionId: id } });
      }

      const updated = await tx.blockDefinition.update({
        where: { id },
        data: {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
          ...(parsed.data.layout !== undefined ? { layout: parsed.data.layout } : {}),
          ...(parsed.data.renderMode !== undefined ? { renderMode: parsed.data.renderMode } : {}),
          ...(parsed.data.htmlTemplate !== undefined ? { htmlTemplate: parsed.data.htmlTemplate } : {}),
          ...(parsed.data.remapThemeColors !== undefined
            ? { remapThemeColors: parsed.data.remapThemeColors }
            : {}),
          ...(parsed.data.fields !== undefined
            ? {
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
              }
            : {}),
        },
        include: { fields: true },
      });

      await recordAuditLog(tx, {
        entityType: "BlockDefinition",
        entityId: id,
        action: "update",
        before: blockDefinitionSnapshot(existing),
        after: blockDefinitionSnapshot(updated),
        actorEmail: user?.email,
      });
      return updated;
    });

    revalidatePath("/admin/block-types");
    return apiSuccess(definition);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const { id } = await params;
  const user = await getSessionUser();

  try {
    const existing = await prisma.blockDefinition.findUnique({ where: { id }, include: { fields: true } });
    if (!existing) return notFound("Block type");

    // Re-derive usage server-side right before deleting -- never trust a
    // client-supplied "this is unused" claim (same pattern as
    // DELETE /api/tags/[id]). Never cascade-delete live page content: a
    // custom Block instance's `blockDefinitionId` FK is ON DELETE SET NULL,
    // not RESTRICT, so without this guard the delete would silently
    // succeed and orphan every block using this definition as a type-less
    // `type: "custom"` row.
    const usageCount = await prisma.block.count({ where: { blockDefinitionId: id } });
    if (usageCount > 0) {
      return conflict(
        `This block type is still used by ${usageCount} block instance${usageCount === 1 ? "" : "s"} on live pages.`,
      );
    }

    await prisma.$transaction(async (tx) => {
      // BlockFieldDefinition rows cascade-delete at the database level
      // (onDelete: Cascade) -- deleting the definition is enough.
      await tx.blockDefinition.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "BlockDefinition",
        entityId: id,
        action: "delete",
        before: blockDefinitionSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath("/admin/block-types");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
