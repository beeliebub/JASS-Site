import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import {
  apiSuccess,
  badRequest,
  conflict,
  internalError,
  notFound,
  unauthorized,
  validationError,
} from "@/lib/api-response";
import { pageUpdateSchema, protectedSlugChangeError } from "@/lib/validation/pages";
import { pagePath } from "@/lib/content";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = pageUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

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

    const page = await prisma.page.update({
      where: { id },
      data: { ...parsed.data, updatedBy: user?.email },
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

  const { id } = await params;

  try {
    const existing = await prisma.page.findUnique({ where: { id } });
    if (!existing) return notFound("Page");
    if (existing.protected) return conflict("Protected pages can't be deleted.");

    // NavItem.pageId has ON DELETE SET NULL, which would leave a nav item
    // with neither href nor pageId set -- clean those up explicitly instead
    // of relying on the DB default so the header nav never renders a dead
    // entry after a page is removed.
    await prisma.$transaction([
      prisma.navItem.deleteMany({ where: { pageId: id } }),
      prisma.page.delete({ where: { id } }),
    ]);

    revalidatePath(pagePath(existing.slug));
    revalidatePath("/admin/pages");
    revalidatePath("/", "layout");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
