import { revalidatePath } from "next/cache";
import fs from "node:fs";
import { Readable } from "node:stream";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled } from "@/lib/auth-guard";
import { apiSuccess, editingDisabled, internalError, notFound, unauthorized } from "@/lib/api-response";
import { packPath } from "@/lib/uploads";
import { recordAuditLog, resourcePackSnapshot } from "@/lib/audit-log";

/**
 * Not wrapped in the `lib/api-response.ts` envelope -- this is the one
 * binary route in the project, streaming the zip straight to disk/socket.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = await prisma.resourcePack.findUnique({ where: { id } });
  if (!pack) return notFound("Resource pack");

  let filePath: string;
  try {
    filePath = packPath(pack.sha1);
  } catch (error) {
    console.error(`Data-integrity drift: resource pack ${pack.id} has an invalid sha1 "${pack.sha1}".`, error);
    return notFound("Resource pack");
  }

  if (!fs.existsSync(filePath)) {
    console.error(`Data-integrity drift: resource pack ${pack.id} (sha1 ${pack.sha1}) has no file on disk at ${filePath}.`);
    return notFound("Resource pack");
  }

  const etag = `"${pack.sha1}"`;
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304 });
  }

  const body = Readable.toWeb(fs.createReadStream(filePath)) as ReadableStream<Uint8Array>;

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Length": String(pack.size),
      "Content-Disposition": `attachment; filename="${escapeHeaderValue(pack.filename)}"`,
      ETag: etag,
      "Cache-Control": "public, no-cache",
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  const user = await getSessionUser();
  const { id } = await params;

  try {
    const existing = await prisma.resourcePack.findUnique({ where: { id } });
    if (!existing) return notFound("Resource pack");

    // Unlink before deleting the row: if the unlink fails for a reason
    // other than "already gone" (e.g. a permissions/IO error), the row
    // stays around as a signal rather than silently vanishing while the
    // file it pointed at is stranded on disk with nothing left to find it.
    try {
      fs.unlinkSync(packPath(existing.sha1));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }

    await prisma.$transaction(async (tx) => {
      await tx.resourcePack.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "ResourcePack",
        entityId: id,
        action: "delete",
        before: resourcePackSnapshot(existing),
        after: null,
        actorEmail: user?.email,
      });
    });

    revalidatePath("/resource");
    return apiSuccess(null);
  } catch (error) {
    return internalError(error);
  }
}

function escapeHeaderValue(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
