import { auth } from "@/auth";
import { apiError, apiSuccess, internalError, unauthorized } from "@/lib/api-response";
import { isAdminRole } from "@/lib/auth-guard";
import { isLoopbackHost, noStore } from "@/lib/panel-gate";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isLoopbackHost(request)) {
    return noStore(apiError(404, "not_found", "Not found."));
  }

  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return noStore(unauthorized());

    // auth() can retain a token after its refresh lookup fails; this independent live read keeps the panel gate fail-closed.
    const user = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true },
    });
    if (!user) return noStore(unauthorized());
    if (!isAdminRole(user.role)) {
      return noStore(apiError(403, "forbidden", "This account cannot access the server panel."));
    }

    // Keep role in the identity response so the daemon can distinguish OWNERs who manage panel capability grants.
    return noStore(apiSuccess({ user }));
  } catch (error) {
    return noStore(internalError(error));
  }
}

