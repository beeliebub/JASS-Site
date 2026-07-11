import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireOwner } from "@/lib/auth-guard";
import { apiSuccess, badRequest, conflict, internalError, unauthorized, validationError } from "@/lib/api-response";
import { userCreateSchema } from "@/lib/validation/pages";
import { recordAuditLog, userSnapshot } from "@/lib/audit-log";

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const;

// Every handler in app/api/users/** starts with requireOwner() -- ADMIN
// accounts must never reach user-management, no exceptions.
export async function GET() {
  if (!(await requireOwner())) return unauthorized();

  try {
    const users = await prisma.user.findMany({ select: userSelect, orderBy: { createdAt: "asc" } });
    return apiSuccess(users);
  } catch (error) {
    return internalError(error);
  }
}

export async function POST(req: Request) {
  if (!(await requireOwner())) return unauthorized();
  const actor = await getSessionUser();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = userCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  try {
    const email = parsed.data.email.toLowerCase();
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return conflict(`A user with email "${email}" already exists.`);

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: { email, passwordHash, name: parsed.data.name, role: parsed.data.role },
        select: userSelect,
      });
      await recordAuditLog(tx, {
        entityType: "User",
        entityId: created.id,
        action: "create",
        before: null,
        after: userSnapshot(created),
        actorEmail: actor?.email,
      });
      return created;
    });
    return apiSuccess(user, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
