import { once } from "node:events";
import fs from "node:fs";
import crypto from "node:crypto";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiError, apiSuccess, badRequest, editingDisabled, internalError, unauthorized } from "@/lib/api-response";
import { imagePath, tempImagePath } from "@/lib/uploads";

const MAX_IMAGE_BYTES = 10485760; // 10 MiB

type ImageFormat = {
  ext: "png" | "jpg" | "gif" | "webp";
  mime: string;
};

class PayloadTooLargeError extends Error {}
class InvalidImageError extends Error {}

/**
 * Longest magic-byte check (WebP) needs 12 bytes buffered (RIFF header +
 * "WEBP" at offset 8) before a decision can be made, so buffering accumulates
 * up to that many bytes before checking any format.
 */
const MAGIC_BUFFER_TARGET = 12;

function detectImageFormat(buf: Buffer): ImageFormat | null {
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) {
    return { ext: "png", mime: "image/png" };
  }
  if (buf.length >= 3 && buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return { ext: "jpg", mime: "image/jpeg" };
  }
  if (buf.length >= 4 && buf.subarray(0, 4).equals(Buffer.from([0x47, 0x49, 0x46, 0x38]))) {
    return { ext: "gif", mime: "image/gif" };
  }
  if (
    buf.length >= 12 &&
    buf.subarray(0, 4).equals(Buffer.from([0x52, 0x49, 0x46, 0x46])) &&
    buf.subarray(8, 12).equals(Buffer.from([0x57, 0x45, 0x42, 0x50]))
  ) {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
}

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
  if (!Number.isFinite(contentLength) || contentLength > MAX_IMAGE_BYTES) {
    return apiError(413, "payload_too_large", `Image must not exceed ${MAX_IMAGE_BYTES} bytes.`);
  }

  if (!req.body) return badRequest("Request body is required.");

  const tempPath = tempImagePath();
  const writeStream = fs.createWriteStream(tempPath);
  // A Writable's 'error' event with zero listeners is an uncaught exception
  // that crashes the whole process (e.g. ENOSPC from a full uploads volume).
  // This listener's only job is to exist -- `streamToFile` observes the
  // actual error via `writeStream.errored` and throws it into the catch
  // block below for proper cleanup/response handling.
  writeStream.on("error", () => {});
  let renamed = false;
  let finalPath: string | null = null;
  let committed = false;

  try {
    const hash = crypto.createHash("sha1");
    const { bytesWritten, format } = await streamToFile(req.body, writeStream, hash);

    const sha1 = hash.digest("hex");
    finalPath = imagePath(sha1, format.ext);
    await fs.promises.rename(tempPath, finalPath);
    renamed = true;

    const sessionUser = await getSessionUser();

    const image = await prisma.uploadedImage.upsert({
      where: { sha1 },
      create: { sha1, ext: format.ext, mime: format.mime, size: bytesWritten, uploadedBy: sessionUser?.email },
      update: {},
    });
    committed = true;

    return apiSuccess(
      { id: image.id, url: `/api/uploads/images/${sha1}.${format.ext}`, sha1, mime: image.mime, size: image.size },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PayloadTooLargeError) {
      return apiError(413, "payload_too_large", `Image must not exceed ${MAX_IMAGE_BYTES} bytes.`);
    }
    if (error instanceof InvalidImageError) {
      return apiError(400, "invalid_image", "File is not a supported image format (PNG, JPEG, GIF, or WebP).");
    }
    return internalError(error);
  } finally {
    if (!writeStream.destroyed) writeStream.destroy();
    if (!renamed) {
      await fs.promises.unlink(tempPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("Failed to clean up temp image upload:", error);
        }
      });
    } else if (finalPath && !committed) {
      // Renamed to its content-addressed path but the DB write never
      // landed -- unlink so it doesn't become a permanent orphan on disk
      // that nothing else scans for.
      await fs.promises.unlink(finalPath).catch((error) => {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error("Failed to clean up orphaned image file after a failed DB write:", error);
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
): Promise<{ bytesWritten: number; format: ImageFormat }> {
  const nodeStream = Readable.fromWeb(body as import("node:stream/web").ReadableStream<Uint8Array>);
  let bytesWritten = 0;
  let magicBuffer = Buffer.alloc(0);
  let magicChecked = false;
  let detectedFormat: ImageFormat | null = null;

  for await (const chunk of nodeStream) {
    if (writeStream.errored) throw writeStream.errored;

    const buf: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    bytesWritten += buf.length;
    if (bytesWritten > MAX_IMAGE_BYTES) throw new PayloadTooLargeError();

    if (!magicChecked) {
      if (magicBuffer.length < MAGIC_BUFFER_TARGET) magicBuffer = Buffer.concat([magicBuffer, buf]);
      if (magicBuffer.length >= MAGIC_BUFFER_TARGET) {
        detectedFormat = detectImageFormat(magicBuffer);
        if (!detectedFormat) throw new InvalidImageError();
        magicChecked = true;
      }
    }

    hash.update(buf);
    if (!writeStream.write(buf)) {
      await once(writeStream, "drain");
    }
  }

  if (writeStream.errored) throw writeStream.errored;

  // A stream shorter than the magic-buffer target never got a chance to
  // fail the check above -- try to detect against what we did get (e.g. a
  // short-but-valid non-WebP file whose full magic fits under 12 bytes)
  // before giving up.
  if (!magicChecked) {
    detectedFormat = detectImageFormat(magicBuffer);
    if (!detectedFormat) throw new InvalidImageError();
  }

  writeStream.end();
  await once(writeStream, "finish");

  if (!detectedFormat) throw new InvalidImageError();
  return { bytesWritten, format: detectedFormat };
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
