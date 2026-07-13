/** Shared display-size override mechanism for admin-managed images --
 * originally defined in components/blocks/image-block.tsx, hoisted here once
 * a second consumer (the Link Grid block's per-link thumbnails) needed the
 * same `sizeMode`/`scale`/`width`/`height` fields and `buildImageStyle`
 * function. Mirrors `imageSizeSchema` in lib/validation/pages.ts -- keep the
 * bounds below in sync with that schema's `.min()`/`.max()` calls. */

import type { CSSProperties } from "react";

/** The subset of a block's data shape that `buildImageStyle` reads. Kept
 * narrow (rather than accepting a full `ImageData`-shaped type) so other
 * data shapes with unrelated fields -- e.g. `QuickLink` in
 * components/blocks/link-grid-block.tsx -- can use it without an awkward
 * cast. */
export type ImageSize = {
  sizeMode?: "scale" | "custom" | null;
  scale?: number | null;
  width?: number | null;
  height?: number | null;
};

// Mirrors imageSizeSchema's bounds in lib/validation/pages.ts -- clamped here
// too so the UI never sends a value the server would reject.
export const SCALE_MIN = 10;
export const SCALE_MAX = 100;
export const DIMENSION_MIN = 1;
export const DIMENSION_MAX = 2000;

/** Builds an `<img>`'s inline style from validated numeric fields only --
 * never a passthrough string, so this can't become a CSS-injection surface.
 * `sizeMode === "scale"` renders a responsive percentage of the figure's
 * width; `sizeMode === "custom"` renders an exact pixel box, with either
 * dimension alone falling back to "auto" to preserve aspect ratio. */
export function buildImageStyle(data: ImageSize): CSSProperties {
  if (data.sizeMode === "scale" && typeof data.scale === "number" && Number.isFinite(data.scale)) {
    return { width: `${data.scale}%`, height: "auto" };
  }
  if (data.sizeMode === "custom") {
    const hasWidth = typeof data.width === "number" && Number.isFinite(data.width);
    const hasHeight = typeof data.height === "number" && Number.isFinite(data.height);
    const style: CSSProperties = {};
    if (hasWidth) style.width = `${data.width}px`;
    if (hasHeight) style.height = `${data.height}px`;
    if (hasWidth && !hasHeight) style.height = "auto";
    if (hasHeight && !hasWidth) style.width = "auto";
    return style;
  }
  return {};
}
