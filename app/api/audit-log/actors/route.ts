import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-guard";
import { internalError, unauthorized } from "@/lib/api-response";

/**
 * Distinct actor emails across every audit log entry, for the actor-filter
 * `<datalist>` in `components/admin/audit-log-admin.tsx`. `requireAdmin`
 * (not `requireOwner`) is deliberate, not an oversight: `actorEmail` already
 * appears unfiltered in every row of `GET /api/audit-log` for any admin
 * viewer today -- only `User`-entity-type *rows* are owner-gated there, not
 * the actor-email column itself, so a distinct-actors list carries no new
 * exposure.
 */
export async function GET() {
  if (!(await requireAdmin())) return unauthorized();

  try {
    const rows = await prisma.auditLogEntry.findMany({
      distinct: ["actorEmail"],
      where: { actorEmail: { not: null } },
      select: { actorEmail: true },
    });

    const actorEmails = rows.map((row) => row.actorEmail).filter((email): email is string => email !== null);

    return NextResponse.json({ data: actorEmails }, { status: 200 });
  } catch (error) {
    return internalError(error);
  }
}
