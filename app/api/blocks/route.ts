import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, editingDisabled, internalError, notFound, unauthorized, validationError } from "@/lib/api-response";
import { blockCreateSchema } from "@/lib/validation/pages";
import { buildDataSchemaFromDefinition } from "@/lib/validation/block-definitions";
import { pagePath } from "@/lib/content";
import { blockSnapshot, recordAuditLog } from "@/lib/audit-log";

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

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

    // Built-in types are already fully validated by `blockCreateSchema`'s
    // discriminated union above (each arm carries its own
    // `blockDataSchemas` entry as `data`) -- `"custom"` is the one
    // exception, whose union arm only checks `data: z.unknown()` since the
    // real shape depends on the referenced `BlockDefinition`'s fields,
    // which aren't known until fetched here.
    let dataToStore: unknown = parsed.data.data;
    let blockDefinitionId: string | null = null;

    if (parsed.data.type === "custom") {
      const definition = await prisma.blockDefinition.findUnique({
        where: { id: parsed.data.blockDefinitionId },
        include: { fields: true },
      });
      // Reachable if a stale client submits after the definition was
      // deleted -- the DELETE guard on /api/block-definitions/[id] should
      // normally prevent this by rejecting while any block still uses it.
      if (!definition) return notFound("Block type");

      const dataSchema = buildDataSchemaFromDefinition(definition.fields);
      const dataParsed = dataSchema.safeParse(parsed.data.data);
      if (!dataParsed.success) return validationError(dataParsed.error);

      dataToStore = dataParsed.data;
      blockDefinitionId = definition.id;
    }

    const block = await prisma.$transaction(async (tx) => {
      const created = await tx.block.create({
        data: {
          pageId: parsed.data.pageId,
          type: parsed.data.type,
          order: parsed.data.order,
          data: JSON.stringify(dataToStore),
          blockDefinitionId,
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
