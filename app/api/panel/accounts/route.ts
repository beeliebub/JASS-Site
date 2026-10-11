import { auth } from "@/auth";
import { apiError, apiSuccess, internalError, unauthorized } from "@/lib/api-response";
import { listPanelAccounts } from "@/lib/panel-accounts";
import { isLoopbackHost, noStore } from "@/lib/panel-gate";
import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/roles";

export const dynamic = "force-dynamic";

/**
 * The same gate as GET /api/panel/session: loopback Host only, the caller's own live session, and the role read from the database on
 * this request. The panel forwards the browser's cookie here only for an owner or a panel operator, the people who choose accounts for
 * grants, so the list reaches an admin role and nothing else.
 */
export async function GET(request: Request) {
  if (!isLoopbackHost(request)) {
    return noStore(apiError(404, "not_found", "Not found."));
  }

  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return noStore(unauthorized());

    const caller = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!caller) return noStore(unauthorized());
    if (!isAdminRole(caller.role)) {
      return noStore(apiError(403, "forbidden", "This account cannot access the server panel."));
    }

    return noStore(apiSuccess({ accounts: await listPanelAccounts() }));
  } catch (error) {
    return noStore(internalError(error));
  }
}
