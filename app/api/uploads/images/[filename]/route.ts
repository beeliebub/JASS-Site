import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, conflict, internalError, notFound, unauthorized } from "@/lib/api-response";
import { imagePath, isUploadedImageInUse } from "@/lib/uploads";
import { recordAuditLog, uploadedImageSnapshot } from "@/lib/audit-log";

const FILENAME_RE = /^([a-f0-9]{40})\.(png|jpe?g|gif|webp)$/;

/**
 * Not wrapped in the `lib/api-response.ts` envelope -- this is a binary
 * route, streaming the image straight to the socket. Public: images need to
 * render on public pages, so there's no `requireAdmin()` gate here.
 */
export async function GET(req: Request, { params }: { params: Promise<{ filename: string }> }) {
  const { filename } = await params;

  const match = FILENAME_RE.exec(filename);
  if (!match) return notFound("Image");
  const [, sha1, ext] = match;

  const image = await prisma.uploadedImage.findUnique({ where: { sha1 } });
  // URL/DB mismatch -- someone guessing at a different extension for a real
  // sha1 should still 404, not silently serve the DB's actual mime/ext.
  if (!image || image.ext !== ext) return notFound("Image");

  let filePath: string;
  try {
    filePath = imagePath(sha1, image.ext);
  } catch (error) {
    console.error(`Data-integrity drift: uploaded image ${image.id} has an invalid sha1 "${image.sha1}".`, error);
    return notFound("Image");
  }

  if (!fs.existsSync(filePath)) {
    console.error(
      `Data-integrity drift: uploaded image ${image.id} (sha1 ${image.sha1}) has no file on disk at ${filePath}.`,
    );
    return notFound("Image");
  }

  const etag = `"${image.sha1}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304 });
  }

  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": image.mime,
      "Content-Length": String(image.size),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: etag,
    },
  });
}

/**
 * Deletes by `UploadedImage.id`, not by filename -- it lives in this same
 * `[filename]` directory (rather than a sibling `[id]` folder) because
 * Next.js's router requires every dynamic segment at one directory level to
 * share a single param name; the segment value is the id for this handler.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ filename: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const user = await getSessionUser();
  const { filename: id } = await params;

  try {
    const existing = await prisma.uploadedImage.findUnique({ where: { id } });
    if (!existing) return notFound("Image");

    // Re-derive usage server-side right before deleting -- never trust a
    // client-supplied "this is unused" claim.
    if (await isUploadedImageInUse(existing)) {
      return conflict("This image is still referenced by a block or site setting.");
    }

    // Unlink before deleting the row: if the unlink fails for a reason
    // other than "already gone" (e.g. a permissions/IO error), the row
    // stays around as a signal rather than silently vanishing while the
    // file it pointed at is stranded on disk with nothing left to find it.
    try {
      fs.unlinkSync(imagePath(existing.sha1, existing.ext));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.uploadedImage.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "UploadedImage",
        entityId: id,
        action: "delete",
        before: uploadedImageSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    return apiSuccess(null);
  } catch (error) {
    return internalError(error);
  }
}
