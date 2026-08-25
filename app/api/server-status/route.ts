import { getServerStatusFor } from "@/lib/mc-status";
import { apiSuccess, badRequest, internalError, rateLimited, validationError } from "@/lib/api-response";
import { getClientIp } from "@/lib/request-ip";
import { checkIpRateLimit } from "@/lib/rate-limit";
import { resolvePublicServerTarget } from "@/lib/server-status-target";
import { serverStatusRequestSchema } from "@/lib/validation/server-status";

// Public route -- visitors need live status for the Server Status block,
// same "visitors need this too" reasoning as GET /api/status. No auth guard.

// Capped at 5 -- matches serverStatusDataSchema's `servers` array cap
// (lib/validation/pages.ts) and prevents a caller from asking this route to
// fan out an unbounded number of pings per request.

/**
 * Accepts `{ servers: {host, port}[] }` and returns live Minecraft-Java
 * status for each, in the same order, via the shared keyed cache in
 * lib/mc-status.ts. Used by the Server Status block
 * (components/blocks/server-status-block.tsx) to ping its non-"manual"
 * entries client-side without exposing per-target status routes.
 */
export async function POST(req: Request) {
  if (!checkIpRateLimit(`server-status:${getClientIp(req)}`)) return rateLimited();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = serverStatusRequestSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const resolvedTargets = await Promise.all(
      parsed.data.servers.map((target) => resolvePublicServerTarget(target.host, target.port)),
    );
    const publicTargets = resolvedTargets.filter(
      (target): target is NonNullable<typeof target> => target !== null,
    );
    if (publicTargets.length !== resolvedTargets.length) {
      return badRequest("The requested server target is not available.");
    }

    const statuses = await Promise.all(
      publicTargets.map((target) => getServerStatusFor(target, { enableSRV: false })),
    );
    return apiSuccess(statuses);
  } catch (error) {
    // getServerStatusFor never throws (ping failures resolve to "offline"),
    // this is defense-in-depth only.
    return internalError(error);
  }
}
