import { auth } from "@/auth";
import { isAdminRole } from "@/lib/roles";
import { getSiteSettings } from "@/lib/site-settings";

export { isAdminRole };

/**
 * Shared contract between the mutation API routes and auth.
 * Real session check: a request is authorized only if there's a valid
 * session for a user with the ADMIN or OWNER role.
 */
export async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdminRole(session?.user?.role);
}

/**
 * Server-side content-mutation gate. This is intentionally separate from
 * `requireAdmin()` so read-only admin routes and OWNER-only account/settings
 * operations can remain available while site editing is locked.
 */
export async function requireEditingEnabled(): Promise<boolean> {
  const settings = await getSiteSettings();
  return settings.editingEnabled;
}

/**
 * Owner-only gate for user-account management (`/api/users/**`,
 * `/admin/users`) -- an ADMIN must never pass this check.
 */
export async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "OWNER";
}

/**
 * Returns the current session's user (id/email/role) for audit-trail
 * purposes (e.g. `ContentBlock.updatedBy`), or null if unauthenticated.
 */
export async function getSessionUser() {
  const session = await auth();
  return session?.user
    ? { id: session.user.id, email: session.user.email, role: session.user.role }
    : null;
}
