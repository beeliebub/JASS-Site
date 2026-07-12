import { prisma } from "@/lib/prisma";
import { badRequest, notFound } from "@/lib/api-response";
import type { BlockType } from "@/lib/validation/pages";

/**
 * Creating a RuleSection/Feature/Post now requires an
 * owning `blockId`. Shared by the three POST routes so a client can't attach
 * a section/feature/post to a block of the wrong type (e.g. `postId` pointed
 * at a `richText` block) or to a block id that doesn't exist at all. Returns
 * either an error Response to return as-is, or `{ ok: true }` to proceed.
 */
export async function requireOwningBlock(blockId: string, expectedType: BlockType) {
  const block = await prisma.block.findUnique({ where: { id: blockId } });
  if (!block) return { ok: false as const, response: notFound("Block") };
  if (block.type !== expectedType) {
    return { ok: false as const, response: badRequest(`Block ${blockId} is not a "${expectedType}" block.`) };
  }
  return { ok: true as const };
}
