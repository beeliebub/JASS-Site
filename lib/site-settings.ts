import { prisma } from "@/lib/prisma";
import { imagePath } from "@/lib/uploads";

/**
 * Server-only data layer for site-wide settings (favicon +
 * link-share/embed defaults). Upsert-on-read singleton row, mirroring
 * `getSiteContent()`'s pattern in lib/content.ts, except `SiteSettings` is a
 * single fixed-id row rather than a key-value map. No `server-only` package
 * is installed, so don't import this from a Client Component.
 */

const SINGLETON_ID = "singleton";

export type ResolvedSiteSettings = {
  faviconImageId: string | null;
  faviconUrl: string | null;
  embedImageId: string | null;
  embedImageUrl: string | null;
  embedTitle: string | null;
  embedDescription: string | null;
  pageTitleSuffix: string | null;
};

function imageUrl(image: { sha1: string; ext: string } | null | undefined): string | null {
  return image ? `/api/uploads/images/${image.sha1}.${image.ext}` : null;
}

/**
 * Always returns a fully-resolved row -- creates the singleton with all-null
 * defaults on first read if it doesn't exist yet, so callers (admin GET,
 * app/layout.tsx's generateMetadata) never have to special-case "no row yet".
 */
export async function getSiteSettings(): Promise<ResolvedSiteSettings> {
  const settings = await prisma.siteSettings.upsert({
    where: { id: SINGLETON_ID },
    create: { id: SINGLETON_ID },
    update: {},
    include: { faviconImage: true, embedImage: true },
  });

  return {
    faviconImageId: settings.faviconImageId,
    faviconUrl: imageUrl(settings.faviconImage),
    embedImageId: settings.embedImageId,
    embedImageUrl: imageUrl(settings.embedImage),
    embedTitle: settings.embedTitle,
    embedDescription: settings.embedDescription,
    pageTitleSuffix: settings.pageTitleSuffix,
  };
}

/**
 * For app/icon.tsx to stream bytes directly from disk (this project's
 * "no self-fetching our own API from server code" convention) -- returns
 * null when no custom favicon is set, so the caller can fall back to the
 * static app/favicon.ico. `imagePath()` re-validates the sha1 shape before
 * building a filesystem path, same defense-in-depth lib/uploads.ts already
 * does at every other call site.
 */
export async function getFaviconAsset(): Promise<{ path: string; mime: string } | null> {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: { faviconImage: true },
  });

  const image = settings?.faviconImage;
  if (!image) return null;

  return { path: imagePath(image.sha1, image.ext), mime: image.mime };
}

/**
 * For app/opengraph-image.tsx to render the custom embed image (if any)
 * into the OG card -- same shape/reasoning as `getFaviconAsset()` above,
 * for the embed image instead of the favicon.
 */
export async function getEmbedImageAsset(): Promise<{ path: string; mime: string } | null> {
  const settings = await prisma.siteSettings.findUnique({
    where: { id: SINGLETON_ID },
    include: { embedImage: true },
  });

  const image = settings?.embedImage;
  if (!image) return null;

  return { path: imagePath(image.sha1, image.ext), mime: image.mime };
}
