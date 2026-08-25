import { apiSuccess, badRequest, internalError, rateLimited, unauthorized, validationError } from "@/lib/api-response";
import { requireAdmin } from "@/lib/auth-guard";
import { getClientIp } from "@/lib/request-ip";
import { checkIpRateLimit } from "@/lib/rate-limit";
import { testServerStatusFor } from "@/lib/mc-status";
import { serverTargetSchema } from "@/lib/validation/server-status";

export async function POST(request: Request) {
  if (!(await requireAdmin())) return unauthorized();

  if (!checkIpRateLimit(`server-status-test:${getClientIp(request)}`)) return rateLimited();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = serverTargetSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const result = await testServerStatusFor(parsed.data);
    return apiSuccess({
      status: result.status,
      classification: result.status.online ? "online" : result.failure?.reason.replaceAll("-", "_") ?? "unknown",
      error: result.failure?.message ?? null,
    });
  } catch (error) {
    return internalError(error);
  }
}
