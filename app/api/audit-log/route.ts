import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireOwner } from "@/lib/auth-guard";
import { badRequest, internalError, unauthorized } from "@/lib/api-response";
import { AUDIT_ENTITY_TYPES } from "@/lib/audit-log";

const PAGE_SIZE = 25;

/**
 * Paginated, newest-first. Response shape is `{ data, nextCursor }` (a plain
 * `NextResponse.json`, not `apiSuccess`) -- `apiSuccess`'s envelope only has
 * room for one top-level `data` key, and this route needs a sibling
 * `nextCursor` alongside it per this route's API contract.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const cursor = searchParams.get("cursor");

  if (entityType && !(AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return badRequest(`Unknown entityType "${entityType}".`);
  }

  // User-entity mutations are owner-only everywhere else in this codebase
  // (GET/POST/PUT/DELETE /api/users/** all gate on requireOwner()) -- a
  // plain ADMIN must not be able to browse other users' emails/role history
  // through the audit trail just because it's a different route.
  const isOwner = await requireOwner();
  if (entityType === "User" && !isOwner) return unauthorized();

  try {
    const rows = await prisma.auditLogEntry.findMany({
      where: {
        ...(entityType ? { entityType } : isOwner ? {} : { entityType: { not: "User" } }),
        ...(entityId ? { entityId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > PAGE_SIZE;
    const data = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
    const nextCursor = hasMore ? data[data.length - 1].id : null;

    return NextResponse.json({ data, nextCursor }, { status: 200 });
  } catch (error) {
    return internalError(error);
  }
}
