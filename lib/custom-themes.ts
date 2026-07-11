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

/** Full theme list -- includes themes an admin hasn't opted into the
 * visitor-facing picker yet. Used by the admin-only surfaces (the
 * /admin/themes editor, and the per-page theme-assignment dropdown in
 * /admin/pages): an admin can assign *any* theme to a page regardless of
 * its picker visibility, since that's content authoring, not the visitor
 * switcher. For the visitor-facing footer picker, use
 * `getVisibleCustomThemes()` instead. */
export async function getCustomThemes() {
  return prisma.customTheme.findMany({ orderBy: { name: "asc" } });
}

/** Themes an admin has explicitly opted into the visitor-facing footer
 * picker (`showInPicker: true`) -- everything else stays assignable to
 * pages but hidden from that list until toggled on in /admin/themes. */
export async function getVisibleCustomThemes() {
  return prisma.customTheme.findMany({ where: { showInPicker: true }, orderBy: { name: "asc" } });
}
