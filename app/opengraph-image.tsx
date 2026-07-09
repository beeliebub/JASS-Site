import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/site-config";

// Site-wide branded OG card. Applies to every route that doesn't define its
// own opengraph-image — none currently do, so this is the shared card for
// Home, Rules, Features, and News alike. Regenerated at build time (no
// request-time data), so it's cached like a static asset.

export const alt = `${siteConfig.name} — Minecraft Server`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
