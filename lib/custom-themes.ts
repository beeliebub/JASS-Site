import { prisma } from "@/lib/prisma";
import { customThemeFieldsToCssVars } from "@/lib/themes";
import type { CustomTheme } from "@/app/generated/prisma/client";

/**
 * Server-only data layer for Phase 12 custom themes -- same rationale as
 * lib/content.ts (Prisma import chain, no `server-only` package installed
 * but never reachable from a Client Component).
 */

export type CustomThemeTokens = Record<string, string>;

/** Converts a CustomTheme row's hex fields into a CSS-custom-property style
 * object, e.g. for spreading straight into a server-rendered `style` prop.
 * Never touches a `<style>` block with interpolated CSS -- inline style
 * properties are the only surface these validated hex values reach. */
export function customThemeToCssVars(theme: CustomTheme): CustomThemeTokens {
  return customThemeFieldsToCssVars(theme);
}

/** Resolves a Page's effective theme override for SiteChrome: at most one of
 * a built-in `theme` id or a custom theme's resolved token set is ever
 * returned, matching the mutual exclusivity enforced in
 * lib/validation/pages.ts. Fails safe (both null) if `customThemeId` points
 * at a since-deleted row that hasn't been cleaned up yet. */
export async function resolvePageTheme(
  page: { theme: string | null; customThemeId: string | null },
): Promise<{ theme: string | null; customThemeTokens: CustomThemeTokens | null }> {
  if (page.customThemeId) {
    const custom = await prisma.customTheme.findUnique({ where: { id: page.customThemeId } });
    if (custom) return { theme: null, customThemeTokens: customThemeToCssVars(custom) };
  }
  return { theme: page.theme, customThemeTokens: null };
}

/** Full theme list for the visitor-facing footer picker and the per-page
 * admin dropdown -- both need every token (picker caches resolved tokens in
 * localStorage; admin dropdown just needs id/name but reuses the same read). */
export async function getCustomThemes() {
  return prisma.customTheme.findMany({ orderBy: { name: "asc" } });
}
