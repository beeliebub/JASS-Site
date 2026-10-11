import { apiSuccess, badRequest, internalError } from "@/lib/api-response";
import { isLoopbackHost, noStore } from "@/lib/panel-gate";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { panelIdentityRequestSchema } from "@/lib/validation/panel-identity";

export const dynamic = "force-dynamic";

// The panel's client treats any response shape it doesn't recognize as
// "unavailable" and pauses scheduled actions, so this cap only needs to
// reject obviously-wrong payloads before they're parsed -- not defend
// against an adversarial body, since the route is unreachable except over
// loopback (see lib/panel-gate.ts) and the public Caddy site refuses every
// /api/panel/* path before it reaches this process.
const MAX_BODY_BYTES = 1024;

/**
 * An empty body on the 404 (rather than the usual JSON error envelope) so a
 * request that lands here from anywhere but loopback learns nothing about
 * what this path is or does -- the gate itself must not become the leak.
 */
function emptyNotFound(): Response {
  const response = new Response(null, { status: 404 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/**
 * The Host check runs before the method is even considered, so a
 * non-loopback caller gets the same empty 404 regardless of verb -- never a
 * 405, which would confirm the route exists and accepts POST.
 */
function methodNotAllowed(request: Request): Response {
  if (!isLoopbackHost(request)) return emptyNotFound();
  const response = new Response(null, { status: 405, headers: { Allow: "POST" } });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;

export async function POST(request: Request) {
  if (!isLoopbackHost(request)) return emptyNotFound();

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
      return noStore(badRequest("Request body is too large."));
    }
  }

  let bodyBytes: ArrayBuffer;
  try {
    bodyBytes = await request.arrayBuffer();
  } catch {
    return noStore(badRequest("Unable to read request body."));
  }
  // Content-Length is spoofable (or absent on a chunked request), so the
  // actual byte count read is the real enforcement -- same reasoning as the
  // resource-pack upload route's streamed size check.
  if (bodyBytes.byteLength > MAX_BODY_BYTES) {
    return noStore(badRequest("Request body is too large."));
  }

  let body: unknown;
  try {
    body = JSON.parse(new TextDecoder().decode(bodyBytes));
  } catch {
    return noStore(badRequest("Request body must be valid JSON."));
  }

  const parsed = panelIdentityRequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStore(badRequest('Request body must be exactly { "userId": string } matching ^[A-Za-z0-9_-]{1,64}$.'));
  }

  try {
    // One indexed lookup by primary key -- the panel's client times out at
    // 3s, and the live role (never a cached/JWT-derived one) is what makes a
    // demotion or deletion take effect on the very next scheduled check.
    const user = await prisma.user.findUnique({
      where: { id: parsed.data.userId },
      select: { id: true, role: true },
    });

    // Eligibility is deliberately the one rule GET /api/panel/session also
    // uses -- "missing", "deleted", and "exists but the wrong role" must
    // never be distinguishable from one another in the response.
    if (!user || !isAdminRole(user.role)) {
      return noStore(apiSuccess({ user: null }));
    }

    return noStore(apiSuccess({ user: { id: user.id, role: user.role } }));
  } catch (error) {
    // Never fall back to { user: null } here: null means "definitively not
    // eligible", and a database failure is not that -- it must come back as
    // an error so the panel pauses the scheduled action instead of
    // cancelling it outright.
    return noStore(internalError(error));
  }
}
