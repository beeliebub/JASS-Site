import { prisma } from "@/lib/prisma";
import { apiSuccess, internalError } from "@/lib/api-response";

/**
 * Tags are the one part of Post List content that stays global across every
 * block instance (posts themselves are owned per-block since PLAN.md Phase
 * 25) -- this returns every distinct tag used anywhere on the site, so an
 * admin authoring a post in any Post List block can reuse an existing tag
 * name instead of it only ever being visible within one block's own posts.
 * Read-only and not admin-gated: tag names aren't sensitive, same as the
 * public `GET /api/posts`.
 */
export async function GET() {
  try {
    const rows = await prisma.post.findMany({
      select: { tag: true },
      distinct: ["tag"],
      orderBy: { tag: "asc" },
    });
    return apiSuccess(rows.map((row) => row.tag));
  } catch (error) {
    return internalError(error);
  }
}
