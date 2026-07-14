import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { blockUpdateSchema, parseBlockData } from "@/lib/validation/pages";
import { buildDataSchemaFromDefinition } from "@/lib/validation/block-definitions";
import { pagePath } from "@/lib/content";
import { blockSnapshot, recordAuditLog } from "@/lib/audit-log";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = blockUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.block.findUnique({ where: { id }, include: { page: true } });
    if (!existing) return notFound("Block");

    let dataJson: string | undefined;
    if (parsed.data.data !== undefined) {
      if (existing.type === "custom") {
        // `existing.blockDefinitionId` is set for every real `type: "custom"`
        // row (enforced at creation in POST /api/blocks) -- a null here
        // would mean the row got corrupted some other way, not a normal
        // user-facing case, so this reports as an internal error rather
        // than a 404/validation error.
        if (!existing.blockDefinitionId) {
          return internalError(new Error(`Custom block ${existing.id} has no blockDefinitionId.`));
        }

        const definition = await prisma.blockDefinition.findUnique({
          where: { id: existing.blockDefinitionId },
          include: { fields: true },
        });
        // Reachable if a stale client submits after the definition was
        // deleted -- the DELETE guard on /api/block-definitions/[id] should
        // normally prevent this by rejecting while any block still uses it.
        if (!definition) return notFound("Block type");

        const dataSchema = buildDataSchemaFromDefinition(definition.fields);
        const dataParsed = dataSchema.safeParse(parsed.data.data);
        if (!dataParsed.success) return validationError(dataParsed.error);
        dataJson = JSON.stringify(dataParsed.data);
      } else {
        const dataParsed = parseBlockData(existing.type, parsed.data.data);
        if (!dataParsed.success) return validationError(dataParsed.error);
        dataJson = JSON.stringify(dataParsed.data);
      }
    }

    const block = await prisma.$transaction(async (tx) => {
      const updated = await tx.block.update({
        where: { id },
        data: {
          ...(parsed.data.order !== undefined ? { order: parsed.data.order } : {}),
          ...(dataJson !== undefined ? { data: dataJson } : {}),
          updatedBy: user?.email,
        },
      });
      await recordAuditLog(tx, {
        entityType: "Block",
        entityId: id,
        action: "update",
        before: blockSnapshot(existing),
        after: blockSnapshot(updated),
        actorEmail: user?.email,
      });
      return updated;
    });

    revalidatePath(pagePath(existing.page.slug));
    return apiSuccess(block);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;
  const user = await getSessionUser();

  try {
    const existing = await prisma.block.findUnique({ where: { id }, include: { page: true } });
    if (!existing) return notFound("Block");

    await prisma.$transaction(async (tx) => {
      await tx.block.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "Block",
        entityId: id,
        action: "delete",
        before: blockSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });
    revalidatePath(pagePath(existing.page.slug));
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
