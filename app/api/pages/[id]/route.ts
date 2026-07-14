import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import {
  apiSuccess,
  badRequest,
  conflict,
  editingDisabled,
  internalError,
  notFound,
  unauthorized,
  validationError,
} from "@/lib/api-response";
import { pageUpdateSchema, protectedSlugChangeError, serializeHeaderContent } from "@/lib/validation/pages";
import { pagePath } from "@/lib/content";
import { pageSnapshot, recordAuditLog } from "@/lib/audit-log";

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

  const parsed = pageUpdateSchema.safeParse(body);
  if (!parsed.success) {
    // Same reserved-slug-vs-conflict precedence issue as POST /api/pages
    // (see the comment there): renaming a page to "admin"/"rules"/etc. fails
    // `refineNotReserved` before the duplicate-slug check further down ever
    // runs, so surface the same conflict message that check would have
    // produced when a real Page already owns that slug.
    const reservedSlugIssue = parsed.error.issues.find(
      (issue) => issue.path.join(".") === "slug" && issue.message.endsWith('is a reserved slug.'),
    );
    if (reservedSlugIssue) {
      const rawSlug = typeof body === "object" && body !== null ? (body as { slug?: unknown }).slug : undefined;
      if (typeof rawSlug === "string") {
        const existingForReservedSlug = await prisma.page.findUnique({ where: { slug: rawSlug } });
        if (existingForReservedSlug) return conflict(`A page with slug "${rawSlug}" already exists.`);
      }
    }
    return validationError(parsed.error);
  }

  const user = await getSessionUser();

  try {
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing) return notFound("Page");

    const slugError = protectedSlugChangeError(existing, parsed.data.slug);
    if (slugError) return conflict(slugError);

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.page.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) return conflict(`A page with slug "${parsed.data.slug}" already exists.`);
    }

    const page = await prisma.$transaction(async (tx) => {
      const { headerContent, ...pageFields } = parsed.data;
      const serializedHeaderContent = serializeHeaderContent(headerContent);
      const updated = await tx.page.update({
        where: { id },
        data: {
          ...pageFields,
          ...(serializedHeaderContent === undefined ? {} : { headerContent: serializedHeaderContent }),
          updatedBy: user?.email,
        },
      });
      await recordAuditLog(tx, {
        entityType: "Page",
        entityId: id,
        action: "update",
        before: pageSnapshot(existing),
        after: pageSnapshot(updated),
        actorEmail: user?.email,
      });
      return updated;
    });

    revalidatePath(pagePath(existing.slug));
    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      revalidatePath(pagePath(parsed.data.slug));
    }
    revalidatePath("/admin/pages");
    revalidatePath("/", "layout");
    return apiSuccess(page);
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
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing) return notFound("Page");
    if (existing.protected) return conflict("Protected pages can't be deleted.");

    // NavItem.pageId has ON DELETE SET NULL, which would leave a nav item
    // with neither href nor pageId set -- clean those up explicitly instead
    // of relying on the DB default so the header nav never renders a dead
    // entry after a page is removed.
    await prisma.$transaction(async (tx) => {
      await tx.navItem.deleteMany({ where: { pageId: id } });
      await tx.page.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "Page",
        entityId: id,
        action: "delete",
        before: pageSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath(pagePath(existing.slug));
    revalidatePath("/admin/pages");
    revalidatePath("/", "layout");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
