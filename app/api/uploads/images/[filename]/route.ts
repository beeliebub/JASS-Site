import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { notFound } from "@/lib/api-response";
import { imagePath } from "@/lib/uploads";

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
