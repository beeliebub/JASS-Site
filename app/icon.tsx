import fs from "node:fs/promises";
import path from "node:path";
import { getFaviconAsset } from "@/lib/site-settings";

/**
 * Dynamic favicon route. Deliberately does NOT
 * export static `size`/`contentType` metadata -- the served format varies
 * per-upload (png/jpg/gif/webp), so the `Content-Type` header is set at
 * request time from the resolved mime type instead (see the "Returns"
 * section of node_modules/next/dist/docs/.../app-icons.md: a `Response` is a
 * valid return type).
 *
 * `icon`/`apple-icon` routes are "special Route Handlers that are cached by
 * default unless they use a Request-time API or dynamic config option" (same
 * doc, "Good to know"). A plain `await prisma...` call does NOT count as a
 * Request-time API in that sense (unlike Server Component pages, Route
 * Handlers don't auto-opt into dynamic rendering just because they await
 * async data) -- `app/opengraph-image.tsx` (same change, same
 * Route Handler category) was directly caught doing this live: it kept
 * serving a stale render after SiteSettings changed until `dynamic =
 * "force-dynamic"` was added there. Set here too as the same fix applied
 * proactively, so "reads the DB at request time" is actually true rather
 * than true-until-the-response-gets-cached.
 *
 * Security: only ever reads bytes from a path derived from
 * `getFaviconAsset()` (which re-validates the sha1 shape server-side via
 * `imagePath()` before returning it) or the static `app/favicon.ico` --
 * never from anything else.
 */
export const dynamic = "force-dynamic";

export default async function Icon() {
  const favicon = await getFaviconAsset();

  if (favicon) {
    const bytes = await fs.readFile(favicon.path);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": favicon.mime },
    });
  }

  // Permanent fallback -- app/favicon.ico is never deleted.
  const fallbackPath = path.join(process.cwd(), "app", "favicon.ico");
  const bytes = await fs.readFile(fallbackPath);
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/x-icon" },
  });
}
