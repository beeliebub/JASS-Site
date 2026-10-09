import { auth } from "@/auth";
import { apiError, apiSuccess, internalError, unauthorized } from "@/lib/api-response";
import { isAdminRole } from "@/lib/auth-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const allowedHosts = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

function isLoopbackHost(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host || /[\s,@/\\?#]/.test(host)) return false;

  try {
    const parsed = new URL(`http://${host}`);
    return (
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      allowedHosts.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

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

