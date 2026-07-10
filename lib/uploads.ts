import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

const SHA1_RE = /^[a-f0-9]{40}$/;

export function uploadsDir(): string {
  const dir = process.env.UPLOADS_DIR ?? path.join(process.cwd(), "uploads");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function packsDir(): string {
  const dir = path.join(uploadsDir(), "resource-packs");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * `sha1` always originates from our own hasher/DB, but re-validating here
 * (rather than trusting the caller) means a future call site can never turn
 * an unvalidated string into a filesystem path.
 */
export function packPath(sha1: string): string {
  if (!SHA1_RE.test(sha1)) {
    throw new Error(`Refusing to build a pack path from invalid sha1: "${sha1}"`);
  }
  return path.join(packsDir(), `${sha1}.zip`);
}

export function tempPackPath(): string {
  return path.join(packsDir(), `${crypto.randomUUID()}.tmp`);
}

function unlinkIgnoringMissing(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

const PRISMA_RECORD_NOT_FOUND = "P2025";

/**
 * Keeps the newest `keep` rows, deleting older ones (DB row + file) --
 * except the active pack, which survives regardless of age so a stale
 * upload never orphans the pack currently being served.
 *
 * Unlinks the file before deleting the row (not after) so an unlink
 * failure -- e.g. a permissions/IO error, not just "already gone" -- never
 * leaves an orphaned file with no DB row pointing at it, since nothing else
 * scans the pack directory for unreferenced files. Two concurrent uploads
 * can both call this and race over the same candidate row; the delete is
 * tolerant of "already deleted" (Prisma P2025) so the loser of that race
 * doesn't turn a successful upload into a 500.
 */
export async function prunePacks(keep = 3): Promise<void> {
  const packs = await prisma.resourcePack.findMany({ orderBy: { uploadedAt: "desc" } });
  const toPrune = packs.slice(keep).filter((pack) => !pack.active);

  for (const pack of toPrune) {
    unlinkIgnoringMissing(packPath(pack.sha1));
    try {
      await prisma.resourcePack.delete({ where: { id: pack.id } });
    } catch (error) {
      if ((error as { code?: string }).code !== PRISMA_RECORD_NOT_FOUND) throw error;
    }
  }
}
