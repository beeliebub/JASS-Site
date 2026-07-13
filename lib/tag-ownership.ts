import { prisma } from "@/lib/prisma";
import { badRequest } from "@/lib/api-response";

/**
 * Every `tagIds` entry a post-create/update request sends must resolve to a
 * real `Tag` row -- same defensive posture as `requireOwningBlock` in
 * lib/block-ownership.ts (never trust a client-supplied id at face value).
 * Returns either an error Response to return as-is, or `{ ok: true }` to
 * proceed.
 */
export async function requireValidTagIds(tagIds: string[]) {
  const found = await prisma.tag.findMany({ where: { id: { in: tagIds } }, select: { id: true } });
  const foundIds = new Set(found.map((tag) => tag.id));
  const missing = tagIds.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    return { ok: false as const, response: badRequest(`Unknown tag id(s): ${missing.join(", ")}`) };
  }
  return { ok: true as const };
}
