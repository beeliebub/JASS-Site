import { revalidatePath } from "next/cache";
import { once } from "node:events";
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiError, apiSuccess, badRequest, conflict, editingDisabled, internalError, unauthorized } from "@/lib/api-response";
import { packPath, tempPackPath } from "@/lib/uploads";
import { recordAuditLog, resourcePackSnapshot } from "@/lib/audit-log";

const MAX_PACK_BYTES = 268435456; // 256 MiB
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

class PayloadTooLargeError extends Error {}
class InvalidZipError extends Error {}
class ShareSourceGoneError extends Error {}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const originRejection = rejectCrossOrigin(req);
  if (originRejection) return originRejection;

  const contentLengthHeader = req.headers.get("content-length");
  if (!contentLengthHeader) {
    return apiError(413, "payload_too_large", "Content-Length header is required.");
  }
  const contentLength = Number(contentLengthHeader);
  if (!Number.isFinite(contentLength) || contentLength > MAX_PACK_BYTES) {
    return apiError(413, "payload_too_large", `Resource pack must not exceed ${MAX_PACK_BYTES} bytes.`);
  }

  if (!req.body) return badRequest("Request body is required.");

  const filename = sanitizeFilename(req.headers.get("x-filename"));
  const shareFromId = req.headers.get("x-share-uuid-from")?.trim() || null;
  if (shareFromId) {
    let sourceExists: { id: string } | null;
    try {
      sourceExists = await prisma.resourcePack.findUnique({ where: { id: shareFromId }, select: { id: true } });
    } catch (error) {
      return internalError(error);
    }
    if (!sourceExists) return badRequest("The selected file to share a UUID from no longer exists.");
  }

  const tempPath = tempPackPath();
  const writeStream = fs.createWriteStream(tempPath);
  // A Writable's 'error' event with zero listeners is an uncaught exception
  // that crashes the whole process (e.g. ENOSPC from a full uploads volume).
  // This listener's only job is to exist -- `streamToFile` observes the
  // actual error via `writeStream.errored` and throws it into the catch
  // block below for proper cleanup/response handling.
  writeStream.on("error", () => {});
  let renamed = false;
  let finalPath: string | null = null;
  let uploadedSha1: string | null = null;
  let committed = false;

  try {
    const hash = crypto.createHash("sha1");
    const bytesWritten = await streamToFile(req.body, writeStream, hash);

    const sha1 = hash.digest("hex");
    uploadedSha1 = sha1;
    const existing = await prisma.resourcePack.findUnique({ where: { sha1 } });
    if (existing) {
      return conflict(`A resource pack named "${existing.filename}" with this SHA-1 already exists.`);
    }

    const targetPath = packPath(sha1);
    finalPath = targetPath;

    const sessionUser = await getSessionUser();

    const pack = await prisma.$transaction(async (tx) => {
      let uuid: string;
      if (shareFromId) {
        const sourcePack = await tx.resourcePack.findUnique({ where: { id: shareFromId } });
        if (!sourcePack) throw new ShareSourceGoneError();
        uuid = sourcePack.uuid;
      } else {
        uuid = crypto.randomUUID();
      }
      const created = await tx.resourcePack.create({
        data: { filename, size: bytesWritten, sha1, uuid, uploadedBy: sessionUser?.email },
      });
      await fs.promises.rename(tempPath, targetPath);
      renamed = true;
      await recordAuditLog(tx, {
        entityType: "ResourcePack",
        entityId: created.id,
        action: "create",
        before: null,
        after: resourcePackSnapshot(created),
        actorEmail: sessionUser?.email,
      });
      return created;
    });
    committed = true;

    revalidatePath("/resource");
    return apiSuccess(pack, { status: 201 });
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return apiError(413, "payload_too_large", `Resource pack must not exceed ${MAX_PACK_BYTES} bytes.`);
    }
    if (error instanceof InvalidZipError) {
      return apiError(400, "invalid_zip", "File is not a valid zip archive.");
    }
    if (error instanceof ShareSourceGoneError) {
      return conflict("The selected file to share a UUID from was deleted during upload. Re-upload without sharing, or pick a different file.");
    }
    if ((error as { code?: unknown }).code === "P2002") {
      const existing = uploadedSha1
        ? await prisma.resourcePack.findUnique({ where: { sha1: uploadedSha1 } }).catch(() => null)
        : null;
      return conflict(existing ? `A resource pack named "${existing.filename}" with this SHA-1 already exists.` : "A resource pack with these bytes already exists.");
    }
    return internalError(error);
  } finally {
    if (!writeStream.destroyed) writeStream.destroy();
    if (!renamed) {
      await fs.promises.unlink(tempPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("Failed to clean up temp resource-pack upload:", error);
        }
      });
    } else if (finalPath && !committed) {
      // Renamed to its content-addressed path but the DB write never
      // landed (e.g. transaction failure) -- unlink so it doesn't become a
      // permanent orphan on disk with no metadata row pointing at it.
      await fs.promises.unlink(finalPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("Failed to clean up orphaned resource-pack file after a failed DB write:", error);
        }
      });
    }
  }
}

/**
 * Streams the request body to disk while hashing and counting bytes in
 * lockstep -- `Content-Length` is spoofable, so the running count is the
 * real enforcement; the header check above is just a cheap upfront reject.
 * Backpressure (`drain`) keeps this at flat memory for large uploads
 * instead of buffering the whole file.
 */
async function streamToFile(
  body: ReadableStream<Uint8Array>,
  writeStream: fs.WriteStream,
  hash: crypto.Hash,
): Promise<number> {
  const nodeStream = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
  let bytesWritten = 0;
  let magicBuffer = Buffer.alloc(0);
  let magicChecked = false;

  for await (const chunk of nodeStream) {
    if (writeStream.errored) throw writeStream.errored;

    const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytesWritten += buf.length;
    if (bytesWritten > MAX_PACK_BYTES) throw new PayloadTooLargeError();

    if (!magicChecked) {
      if (magicBuffer.length < 4) magicBuffer = Buffer.concat([magicBuffer, buf]);
      if (magicBuffer.length >= 4) {
        if (!magicBuffer.subarray(0, 4).equals(ZIP_MAGIC)) throw new InvalidZipError();
        magicChecked = true;
      }
    }

    hash.update(buf);
    if (!writeStream.write(buf)) {
      await once(writeStream, "drain");
    }
  }

  if (writeStream.errored) throw writeStream.errored;

  // A stream shorter than 4 bytes never got a chance to fail the check above.
  if (!magicChecked) throw new InvalidZipError();

  writeStream.end();
  await once(writeStream, "finish");

  return bytesWritten;
}

/**
 * Raw-body POSTs bypass Auth.js's own form CSRF protection, so this route
 * self-defends: reject unless the browser-supplied Origin matches this
 * site's own origin. Missing Origin is treated the same as a mismatch --
 * a same-origin `fetch()` always sends it.
 */
function rejectCrossOrigin(req: Request): Response | null {
  const origin = req.headers.get("origin");
  if (!origin) return apiError(403, "forbidden", "Missing Origin header.");
  if (origin !== expectedOrigin(req)) return apiError(403, "forbidden", "Cross-origin uploads are not allowed.");
  return null;
}

function expectedOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // Malformed env value -- fall through to header-derived origin below.
    }
  }
  const host = req.headers.get("host");
  if (host) {
    const protocol = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
    return `${protocol}://${host}`;
  }
  return new URL(req.url).origin;
}

/**
 * Display-only. `path.basename` strips any directory components, control
 * characters are stripped outright, and the result is never used to build
 * a filesystem path -- only `packPath(sha1)` is used for that.
 */
function sanitizeFilename(raw: string | null): string {
  const fallback = "resource-pack.zip";
  if (!raw) return fallback;

  const stripped = path.basename(raw).replace(/[\x00-\x1f\x7f]/g, "").trim();
  const capped = stripped.slice(0, 200);
  if (!capped || !/\.zip$/i.test(capped)) return fallback;
  return capped;
}
