import "server-only";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getSiteSettings } from "@/lib/site-settings";

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

export function imagesDir(): string {
  const dir = path.join(uploadsDir(), "images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * `sha1` always originates from our own hasher/DB, but re-validating here
 * (rather than trusting the caller) means a future call site can never turn
 * an unvalidated string into a filesystem path.
 */
export function imagePath(sha1: string, ext: string): string {
  if (!SHA1_RE.test(sha1)) {
    throw new Error(`Refusing to build an image path from invalid sha1: "${sha1}"`);
  }
  return path.join(imagesDir(), `${sha1}.${ext}`);
}

export function tempImagePath(): string {
  return path.join(imagesDir(), `${crypto.randomUUID()}.tmp`);
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

export type ImageLibraryEntry = {
  id: string;
  sha1: string;
  ext: string;
  mime: string;
  size: number;
  uploadedAt: Date;
  uploadedBy: string | null;
  used: boolean;
};

/**
 * An image is only ever referenced as a literal URL string embedded in a
 * `Block.data` JSON blob, or via the two `SiteSettings` foreign keys -- there
 * is no join table to query, so "used" is detected by substring-matching the
 * image's own sha1 against every block's raw data rather than hardcoding
 * which block types/fields might embed one (fragile the moment a new block
 * type also references an image).
 */
function isImageUsed(
  image: { id: string; sha1: string },
  blocksData: { data: string }[],
  settings: { faviconImageId: string | null; embedImageId: string | null },
): boolean {
  return (
    blocksData.some((block) => block.data.includes(image.sha1)) ||
    settings.faviconImageId === image.id ||
    settings.embedImageId === image.id
  );
}

export async function getImageLibrary(): Promise<ImageLibraryEntry[]> {
  const [images, blocksData, settings] = await Promise.all([
    prisma.uploadedImage.findMany({ orderBy: { uploadedAt: "desc" } }),
    prisma.block.findMany({ select: { data: true } }),
    getSiteSettings(),
  ]);

  return images.map((image) => ({
    id: image.id,
    sha1: image.sha1,
    ext: image.ext,
    mime: image.mime,
    size: image.size,
    uploadedAt: image.uploadedAt,
    uploadedBy: image.uploadedBy,
    used: isImageUsed(image, blocksData, settings),
  }));
}

/** Re-derives usage the same way `getImageLibrary` does, for callers (the
 * delete route) that must never trust a client-supplied "this is unused"
 * claim. */
export async function isUploadedImageInUse(image: { id: string; sha1: string }): Promise<boolean> {
  const [blocksData, settings] = await Promise.all([
    prisma.block.findMany({ select: { data: true } }),
    getSiteSettings(),
  ]);
  return isImageUsed(image, blocksData, settings);
}
