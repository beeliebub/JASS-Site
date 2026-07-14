import { z } from "zod";

/**
 * Site-wide settings (favicon + link-share/embed defaults).
 * Structural validation only -- `faviconImageId`/`embedImageId` are
 * re-validated against real `UploadedImage` rows in the API route (never
 * trust a client-supplied id blindly), mirroring how Page.slug uniqueness is
 * checked in the route rather than inside Zod (lib/validation/custom-themes.ts).
 *
 * 70/200 char caps match standard OG/Twitter card title/description limits.
 */
export const siteSettingsUpdateSchema = z.object({
  faviconImageId: z.string().min(1).nullable().optional(),
  embedImageId: z.string().min(1).nullable().optional(),
  embedTitle: z.string().max(70).nullable().optional(),
  embedDescription: z.string().max(200).nullable().optional(),
  pageTitleSuffix: z.string().max(40).nullable().optional(),
});

export type SiteSettingsUpdateInput = z.infer<typeof siteSettingsUpdateSchema>;
