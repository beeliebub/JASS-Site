import { z } from "zod";
import { CUSTOM_THEME_TOKEN_FIELDS } from "@/lib/themes";

/**
 * Admin-authored custom themes. Structural validation only (hex
 * format, name length) -- name uniqueness is a DB-level check done in the API
 * route (app/api/custom-themes/route.ts), mirroring how Page.slug uniqueness
 * is checked in app/api/pages/[id]/route.ts rather than inside Zod. No Prisma
 * import here, matching lib/validation/pages.ts's client-importability note
 * (not currently required client-side, but kept consistent/cheap to import).
 */

// Strict lowercase-normalized `#rrggbb` -- accepts either case on input (same
// as lib/color.ts's parseHex) but stores canonical lowercase, matching every
// other hex value already persisted in this project (resource pack sha1s,
// etc.) and avoiding case-only diffs between visually-identical themes.
const hexColorSchema = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, "must be a #rrggbb hex color")
  .transform((v) => v.toLowerCase());

const tokenFieldsSchema = Object.fromEntries(
  CUSTOM_THEME_TOKEN_FIELDS.map((field) => [field, hexColorSchema]),
) as Record<(typeof CUSTOM_THEME_TOKEN_FIELDS)[number], typeof hexColorSchema>;

export const customThemeCreateSchema = z.object({
  name: z.string().min(1).max(80),
  showInPicker: z.boolean().optional(),
  ...tokenFieldsSchema,
});

export const customThemeUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  showInPicker: z.boolean().optional(),
  ...Object.fromEntries(CUSTOM_THEME_TOKEN_FIELDS.map((field) => [field, hexColorSchema.optional()])),
});
