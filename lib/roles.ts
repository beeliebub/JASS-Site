/**
 * Pure role check with no Prisma or next-auth import, so code that only
 * needs this one rule (e.g. app/api/panel/identity/route.ts) never drags in
 * the session/adapter machinery those packages bring with them.
 */

/**
 * True for both site-editing roles. `OWNER` is a superset of `ADMIN` (it can
 * additionally manage user accounts via `requireOwner()`) -- every place that
 * used to check `role === "ADMIN"` must accept `OWNER` too, or an `OWNER`
 * account gets silently locked out of every admin-gated route/UI affordance.
 */
export function isAdminRole(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "OWNER";
}
