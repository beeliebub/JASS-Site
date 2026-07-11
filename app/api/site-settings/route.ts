import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin } from "@/lib/auth-guard";
import { apiSuccess, badRequest, internalError, unauthorized, validationError } from "@/lib/api-response";
import { getSiteSettings } from "@/lib/site-settings";
import { siteSettingsUpdateSchema } from "@/lib/validation/site-settings";
import { recordAuditLog, siteSettingsSnapshot } from "@/lib/audit-log";

const SINGLETON_ID = "singleton";

export async function GET() {
  try {
    return apiSuccess(await getSiteSettings());
  } catch (error) {
    return internalError(error);
  }
}

export async function PUT(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = siteSettingsUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { faviconImageId, embedImageId, embedTitle, embedDescription } = parsed.data;

  try {
    // Re-validate image ids against real UploadedImage rows server-side --
    // never trust a client-supplied id blindly (Phase 17 security checklist).
    if (faviconImageId) {
      const image = await prisma.uploadedImage.findUnique({ where: { id: faviconImageId } });
      if (!image) return badRequest("faviconImageId does not reference an existing uploaded image.");
    }
    if (embedImageId) {
      const image = await prisma.uploadedImage.findUnique({ where: { id: embedImageId } });
      if (!image) return badRequest("embedImageId does not reference an existing uploaded image.");
    }

    const user = await getSessionUser();

    const data = {
      ...(faviconImageId !== undefined ? { faviconImageId } : {}),
      ...(embedImageId !== undefined ? { embedImageId } : {}),
      ...(embedTitle !== undefined ? { embedTitle } : {}),
      ...(embedDescription !== undefined ? { embedDescription } : {}),
      updatedBy: user?.email,
    };

    const existingBefore = await prisma.siteSettings.findUnique({ where: { id: SINGLETON_ID } });

    await prisma.$transaction(async (tx) => {
      const upserted = await tx.siteSettings.upsert({
        where: { id: SINGLETON_ID },
        create: { id: SINGLETON_ID, ...data },
        update: data,
      });
      await recordAuditLog(tx, {
        entityType: "SiteSettings",
        entityId: SINGLETON_ID,
        action: existingBefore ? "update" : "create",
        before: existingBefore ? siteSettingsSnapshot(existingBefore) : null,
        after: siteSettingsSnapshot(upserted),
        actorEmail: user?.email,
      });
    });

    // Favicon/embed metadata affects every page, so hit the whole layout.
    revalidatePath("/", "layout");

    return apiSuccess(await getSiteSettings());
  } catch (error) {
    return internalError(error);
  }
}
