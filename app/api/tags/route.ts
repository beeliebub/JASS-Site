import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, editingDisabled, internalError, unauthorized, validationError } from "@/lib/api-response";
import { tagCreateSchema } from "@/lib/validation/content";
import { recordAuditLog, tagSnapshot } from "@/lib/audit-log";

/**
 * Replaces the old `GET /api/posts/tags` (which returned bare tag strings
 * scraped off `Post.tag`) now that tags are a real, admin-editable `Tag`
 * row. Same "not sensitive, not admin-gated" reasoning as the route it
 * replaces: tag names/colors aren't sensitive, and any admin authoring a
 * post in any Post List block needs to read this list to pick tags.
 */
export async function GET() {
  try {
    const tags = await prisma.tag.findMany({ orderBy: { name: "asc" } });
    return apiSuccess(tags);
  } catch (error) {
    return internalError(error);
  }
}

/**
 * Creates a new tag. Used both by /admin/tags directly and by the inline
 * "new tag" input in the post editor (PostForm), which needs to
 * create-and-attach a tag without leaving the post form.
 */
export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = tagCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const existing = await prisma.tag.findUnique({ where: { name: parsed.data.name } });
    if (existing) return conflict(`A tag named "${parsed.data.name}" already exists.`);

    const tag = await prisma.$transaction(async (tx) => {
      const created = await tx.tag.create({ data: parsed.data });
      await recordAuditLog(tx, {
        entityType: "Tag",
        entityId: created.id,
        action: "create",
        before: null,
        after: tagSnapshot(created),
        actorEmail: user?.email,
      });
      return created;
    });

    revalidatePath("/news");
    revalidatePath("/admin/tags");
    return apiSuccess(tag, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
