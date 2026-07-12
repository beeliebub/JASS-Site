import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, unauthorized, validationError } from "@/lib/api-response";
import { postCreateSchema } from "@/lib/validation/content";
import { requireOwningBlock } from "@/lib/block-ownership";

export async function GET() {
  try {
    const posts = await prisma.post.findMany({ orderBy: { publishedAt: "desc" } });
    return apiSuccess(posts);
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

  const parsed = postCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const owningBlock = await requireOwningBlock(parsed.data.blockId, "postList");
  if (!owningBlock.ok) return owningBlock.response;

  try {
    const existing = await prisma.post.findUnique({ where: { slug: parsed.data.slug } });
    if (existing) return conflict(`A post with slug "${parsed.data.slug}" already exists.`);

    const post = await prisma.post.create({ data: parsed.data });
    revalidatePath("/news");
    return apiSuccess(post, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
