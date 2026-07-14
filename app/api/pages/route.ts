import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, editingDisabled, internalError, unauthorized, validationError } from "@/lib/api-response";
import { pageCreateSchema, RESERVED_SLUGS, serializeHeaderContent } from "@/lib/validation/pages";
import { pagePath } from "@/lib/content";
import { pageSnapshot, recordAuditLog } from "@/lib/audit-log";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function uniqueSlugFrom(title: string) {
  const base = slugify(title) || "page";
  let candidate = (RESERVED_SLUGS as readonly string[]).includes(base) ? `${base}-page` : base;
  let suffix = 2;
  while (true) {
    const existing = await prisma.page.findUnique({ where: { slug: candidate } });
    if (!existing) return candidate;
    candidate = `${base}-${suffix++}`;
  }
}

export async function GET() {
  try {
    const pages = await prisma.page.findMany({ orderBy: { title: "asc" } });
    return apiSuccess(pages);
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = pageCreateSchema.safeParse(body);
  if (!parsed.success) {
    // A reserved slug ("admin", "rules", etc.) fails `refineNotReserved`
    // before the duplicate-slug check below ever runs. Most reserved slugs
    // already belong to a real (often protected) Page row, so the accurate
    // message for an admin naming a new page "Admin" is the same conflict
    // message a plain duplicate-slug collision produces, not the generic
    // reserved-slug validation error -- see CLAUDE.md bug writeup. Only
    // "api" (and any other reserved slug with no matching Page row) falls
    // through to the normal validation error below.
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
    const slug = parsed.data.slug ?? (await uniqueSlugFrom(parsed.data.title));

    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) return conflict(`A page with slug "${slug}" already exists.`);

    const page = await prisma.$transaction(async (tx) => {
      const created = await tx.page.create({
        data: {
          title: parsed.data.title,
          slug,
          metaDescription: parsed.data.metaDescription ?? null,
          published: parsed.data.published ?? false,
          theme: parsed.data.theme ?? null,
          headerContent: serializeHeaderContent(parsed.data.headerContent) ?? null,
          protected: false,
          updatedBy: user?.email,
        },
      });
      await recordAuditLog(tx, {
        entityType: "Page",
        entityId: created.id,
        action: "create",
        before: null,
        after: pageSnapshot(created),
        actorEmail: user?.email,
      });
      return created;
    });
    revalidatePath(pagePath(slug));
    revalidatePath("/admin/pages");
    return apiSuccess(page, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
