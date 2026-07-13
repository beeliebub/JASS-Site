import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireOwner } from "@/lib/auth-guard";
import { badRequest, internalError, unauthorized } from "@/lib/api-response";
import { AUDIT_ENTITY_TYPES, extractPageId } from "@/lib/audit-log";

const PAGE_SIZE = 100;

/**
 * Paginated (page-number, not cursor), newest-first. Response shape is
 * `{ data, page, totalPages }` (a plain `NextResponse.json`, not
 * `apiSuccess`) -- `apiSuccess`'s envelope only has room for one top-level
 * `data` key, and this route needs sibling `page`/`totalPages` alongside it
 * per this route's API contract.
 */
export async function GET(req: Request) {
  if (!(await requireAdmin())) return unauthorized();

  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");
  const actorEmail = searchParams.get("actorEmail");
  const pageParam = searchParams.get("page");

  if (entityType && !(AUDIT_ENTITY_TYPES as readonly string[]).includes(entityType)) {
    return badRequest(`Unknown entityType "${entityType}".`);
  }

  const page = pageParam ? Number.parseInt(pageParam, 10) : 1;
  if (!Number.isInteger(page) || page < 1) {
    return badRequest(`Invalid page "${pageParam}".`);
  }

  // User-entity mutations are owner-only everywhere else in this codebase
  // (GET/POST/PUT/DELETE /api/users/** all gate on requireOwner()) -- a
  // plain ADMIN must not be able to browse other users' emails/role history
  // through the audit trail just because it's a different route.
  const isOwner = await requireOwner();
  if (entityType === "User" && !isOwner) return unauthorized();

  try {
    const where = {
      ...(entityType ? { entityType } : isOwner ? {} : { entityType: { not: "User" } }),
      ...(entityId ? { entityId } : {}),
      ...(actorEmail ? { actorEmail } : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.auditLogEntry.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
      prisma.auditLogEntry.count({ where }),
    ]);

    const pageIds = [...new Set(rows.map(extractPageId).filter((id): id is string => id !== null))];
    const pages = pageIds.length
      ? await prisma.page.findMany({ where: { id: { in: pageIds } }, select: { id: true, slug: true, title: true } })
      : [];
    const pageById = new Map(pages.map((p) => [p.id, p]));

    const data = rows.map((row) => {
      const pageId = extractPageId(row);
      const resolvedPage = pageId ? pageById.get(pageId) : undefined;
      return {
        ...row,
        pageSlug: resolvedPage?.slug ?? null,
        pageTitle: resolvedPage?.title ?? null,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

    return NextResponse.json({ data, page, totalPages }, { status: 200 });
  } catch (error) {
    return internalError(error);
  }
}
