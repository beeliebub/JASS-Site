import { ImageResponse } from "next/og";
import fs from "node:fs/promises";
import { siteConfig } from "@/lib/site-config";
import { getEmbedImageAsset } from "@/lib/site-settings";

// Site-wide branded OG card. Applies to every route that doesn't define its
// own opengraph-image -- none currently do, so this is the shared card for
// Home, Rules, Features, and News alike.
//
// File-based metadata conventions like this one take
// priority over the `openGraph.images`/`twitter.images` fields set via
// app/layout.tsx's generateMetadata() -- confirmed against
// node_modules/next/dist/docs/.../opengraph-image.md ("File-based metadata
// has the higher priority and will override the metadata object and
// generateMetadata function"). That means a custom embed image configured at
// /admin/settings has to be served *through* this route, not merely
// referenced from layout.tsx's metadata object, or it would never actually
// show up in a shared link's preview -- this was verified live (curl'd `/`
// before this change and saw `og:image` pointing at the branded card
// regardless of SiteSettings). So this route now reads SiteSettings itself
// and, when an embed image is set, renders those bytes into this route's
// static 1200x630 canvas via ImageResponse (object-fit: cover) rather than
// generating the branded text card -- output is always a 1200x630 PNG
// either way, so the `size`/`contentType` exports below stay accurate
// regardless of the admin's original upload format (png/jpg/gif/webp).
//
// Reads the DB (and conditionally the filesystem) at request time. Like
// app/icon.tsx, an `await prisma...` call alone does NOT make a code-based
// image Route Handler dynamic -- these routes are cached by default unless
// they use a recognized Request-time API or the `dynamic` config below is
// set (node_modules/next/dist/docs/.../opengraph-image.md: "cached by
// default unless it uses a Request-time API or dynamic config option").
// Observed live before adding this: repeat requests came back in ~30ms
// (implausibly fast for a DB read + file read + Satori render), consistent
// with a cached response rather than a fresh one -- `force-dynamic` is the
// documented way to guarantee this route actually re-evaluates SiteSettings
// on every request instead of serving a stale render after an admin change.
export const dynamic = "force-dynamic";

export const alt = `${siteConfig.name} — Minecraft Server`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * Reads the custom embed image (if set) straight from disk as a base64 data
 * URI for use as an ImageResponse <img> source.
 */
async function loadEmbedImageDataUri(): Promise<string | null> {
  const asset = await getEmbedImageAsset();
  if (!asset) return null;

  try {
    const bytes = await fs.readFile(asset.path);
    return `data:${asset.mime};base64,${bytes.toString("base64")}`;
  } catch (error) {
    console.error("Failed to read embed image for the OG card, falling back to the branded card:", error);
    return null;
  }
}

export default async function Image() {
  const embedImageDataUri = await loadEmbedImageDataUri();

  if (embedImageDataUri) {
    return new ImageResponse(
      (
        <div style={{ display: "flex", width: size.width, height: size.height, backgroundColor: "#0a0d0b" }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- this JSX is rendered by next/og's Satori engine into a PNG, never sent to a browser, so next/image doesn't apply here. Explicit pixel width/height (matching `size` below) mirrors the doc's own local-asset example rather than relying on percentage sizing. */}
          <img
            src={embedImageDataUri}
            alt=""
            width={size.width}
            height={size.height}
            style={{ objectFit: "cover" }}
          />
        </div>
      ),
      { ...size },
    );
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0a0d0b",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <div
            style={{
              display: "flex",
              width: 30,
              height: 30,
              borderRadius: 6,
              backgroundColor: "#34c47c",
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 100,
              fontWeight: 700,
              color: "#34c47c",
              letterSpacing: -2,
            }}
          >
            {siteConfig.name}
          </div>
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 30,
            maxWidth: 880,
            textAlign: "center",
            fontSize: 36,
            color: "#93a191",
          }}
        >
          {siteConfig.tagline}
        </div>
      </div>
    ),
    { ...size },
  );
}
