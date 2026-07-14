import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, editingDisabled, internalError, unauthorized, validationError } from "@/lib/api-response";
import { postCreateSchema } from "@/lib/validation/content";
import { requireOwningBlock } from "@/lib/block-ownership";
import { requireValidTagIds } from "@/lib/tag-ownership";

export async function GET() {
  try {
    const posts = await prisma.post.findMany({ orderBy: { publishedAt: "desc" }, include: { tags: true } });
    return apiSuccess(posts);
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

  const parsed = postCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const owningBlock = await requireOwningBlock(parsed.data.blockId, "postList");
  if (!owningBlock.ok) return owningBlock.response;

  const validTagIds = await requireValidTagIds(parsed.data.tagIds);
  if (!validTagIds.ok) return validTagIds.response;

  try {
    const existing = await prisma.post.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return conflict(`A post with slug "${parsed.data.slug}" already exists.`);

    const { tagIds, ...rest } = parsed.data;
    const post = await prisma.post.create({
      data: { ...rest, tags: { connect: tagIds.map((id) => ({ id })) } },
      include: { tags: true },
    });
    revalidatePath("/news");
    return apiSuccess(post, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
