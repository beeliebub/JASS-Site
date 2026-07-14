import { z } from "zod";
import { getServerStatusFor } from "@/lib/mc-status";
import { apiSuccess, badRequest, internalError, validationError } from "@/lib/api-response";

// Public route -- visitors need live status for the Server Status block,
// same "visitors need this too" reasoning as GET /api/status. No auth guard.

const serverTargetSchema = z.object({
  host: z.string().min(1).max(300),
  port: z.number().int().min(1).max(65535),
});

// Capped at 5 -- matches serverStatusDataSchema's `servers` array cap
// (lib/validation/pages.ts) and prevents a caller from asking this route to
// fan out an unbounded number of pings per request.
const requestSchema = z.object({
  servers: z.array(serverTargetSchema).max(5),
});

/**
 * Accepts `{ servers: {host, port}[] }` and returns live Minecraft-Java
 * status for each, in the same order, via the shared keyed cache in
 * lib/mc-status.ts. Used by the Server Status block
 * (components/blocks/server-status-block.tsx) to ping its non-"manual"
 * entries client-side without exposing per-target status routes.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const statuses = await Promise.all(parsed.data.servers.map((target) => getServerStatusFor(target)));
    return apiSuccess(statuses);
  } catch (error) {
    // getServerStatusFor never throws (ping failures resolve to "offline"),
    // this is defense-in-depth only.
    return internalError(error);
  }
}
