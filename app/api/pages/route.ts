import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, unauthorized, validationError } from "@/lib/api-response";
import { pageCreateSchema, RESERVED_SLUGS } from "@/lib/validation/pages";
import { pagePath } from "@/lib/content";

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

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = pageCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const slug = parsed.data.slug ?? (await uniqueSlugFrom(parsed.data.title));

    const existing = await prisma.page.findUnique({ where: { slug } });
    if (existing) return conflict(`A page with slug "${slug}" already exists.`);

    const page = await prisma.page.create({
      data: {
        title: parsed.data.title,
        slug,
        metaDescription: parsed.data.metaDescription ?? null,
        published: parsed.data.published ?? true,
        adminOnly: parsed.data.adminOnly ?? false,
        theme: parsed.data.theme ?? null,
        protected: false,
        updatedBy: user?.email,
      },
    });
    revalidatePath(pagePath(slug));
    revalidatePath("/admin/pages");
    return apiSuccess(page, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
