const FALLBACK_PATH = "/admin";
const BASE_URL = "http://x";
const INVALID_CHARACTERS = /[\\\u0000-\u001f\u007f-\u009f]/;

/** Keep post-login redirects on the site's admin and panel routes. */
export function safeNextPath(raw: unknown): string {
  if (typeof raw !== "string" || raw.length > 2000 || INVALID_CHARACTERS.test(raw)) {
    return FALLBACK_PATH;
  }

  try {
    const parsed = new URL(raw, BASE_URL);
    if (parsed.origin !== BASE_URL) return FALLBACK_PATH;

    const path = parsed.pathname;
    if (
      path !== "/admin" &&
      !path.startsWith("/admin/") &&
      path !== "/panel" &&
      !path.startsWith("/panel/")
    ) {
      return FALLBACK_PATH;
    }

    return `${path}${parsed.search}`;
  } catch {
    return FALLBACK_PATH;
  }
}
