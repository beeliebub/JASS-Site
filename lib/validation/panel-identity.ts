import { z } from "zod";

/**
 * The panel daemon generates these ids itself (it is the website's own
 * cuid primary key), so the pattern only needs to reject garbage, not
 * accommodate a second id format.
 */
export const panelIdentityRequestSchema = z
  .object({ userId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/) })
  .strict();
