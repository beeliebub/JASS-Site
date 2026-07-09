import { getServerStatus } from "@/lib/mc-status";
import { apiSuccess, internalError } from "@/lib/api-response";

// Public route -- visitors need live status, not just admins. No auth guard.
export async function GET() {
  try {
    const status = await getServerStatus();
    return apiSuccess(status);
  } catch (error) {
    // getServerStatus() already resolves ping failures to an offline
    // status rather than throwing; this is defense-in-depth only.
    return internalError(error);
  }
}
