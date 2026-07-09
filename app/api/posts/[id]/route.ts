import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import {
  apiSuccess,
  badRequest,
  conflict,
  internalError,
  notFound,
  unauthorized,
  validationError,
} from "@/lib/api-response";
import { postUpdateSchema } from "@/lib/validation/content";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = postUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) return notFound("Post");

    if (parsed.data.slug && parsed.data.slug !== existing.slug) {
      const slugTaken = await prisma.post.findUnique({ where: { slug: parsed.data.slug } });
      if (slugTaken) return conflict(`A post with slug "${parsed.data.slug}" already exists.`);
    }

    const post = await prisma.post.update({ where: { id }, data: parsed.data });
    revalidatePath("/news");
    return apiSuccess(post);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;

  try {
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) return notFound("Post");

    await prisma.post.delete({ where: { id } });
    revalidatePath("/news");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
