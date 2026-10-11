/**
 * Shared gate for routes under /api/panel/** that are only ever meant to be
 * called over loopback -- by the separate JASS Panel daemon on the same
 * machine, never by a browser or by the public Caddy site, which refuses
 * every /api/panel/* path before it reaches Next.js. Next.js fills in
 * default x-forwarded-* headers even for a genuinely local connection, so
 * their absence proves nothing; the Host header's hostname is the only
 * signal checked here.
 */

const LOOPBACK_HOSTNAMES = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

export function isLoopbackHost(request: Request): boolean {
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
      LOOPBACK_HOSTNAMES.has(parsed.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export function noStore(response: Response): Response {
  response.headers.set("Cache-Control", "no-store");
  return response;
}
