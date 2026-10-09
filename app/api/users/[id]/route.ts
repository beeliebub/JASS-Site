import bcrypt from "bcrypt";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireOwner } from "@/lib/auth-guard";
import {
  apiSuccess,
  badRequest,
  conflict,
  internalError,
  notFound,
  unauthorized,
  validationError,
} from "@/lib/api-response";
import { userUpdateSchema } from "@/lib/validation/pages";
import { recordAuditLog, userSnapshot } from "@/lib/audit-log";

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const;

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOwner())) return unauthorized();

  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = userUpdateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const sessionUser = await getSessionUser();

  try {
    const existing = await prisma.user.findUnique({ where: { id } });
    if (!existing) return notFound("User");

    if (parsed.data.email) {
      const email = parsed.data.email.toLowerCase();
      if (email !== existing.email) {
        const emailTaken = await prisma.user.findUnique({ where: { email } });
        if (emailTaken) return conflict(`A user with email "${email}" already exists.`);
      }
    }

    const passwordHash = parsed.data.password ? await bcrypt.hash(parsed.data.password, 12) : undefined;

    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) return { kind: "missing" } as const;

      const changingRole = parsed.data.role !== undefined && parsed.data.role !== current.role;
      if (sessionUser?.id === id && changingRole) {
        return { kind: "self-role-change" } as const;
      }

      if (changingRole && current.role === "OWNER" && parsed.data.role !== "OWNER") {
        const ownerCount = await tx.user.count({ where: { role: "OWNER" } });
        if (ownerCount <= 1) return { kind: "last-owner" } as const;
      }

      const updated = await tx.user.update({
        where: { id },
        data: {
          ...(parsed.data.email ? { email: parsed.data.email.toLowerCase() } : {}),
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.role !== undefined ? { role: parsed.data.role } : {}),
          ...(passwordHash ? { passwordHash } : {}),
        },
        select: userSelect,
      });
      await recordAuditLog(tx, {
        entityType: "User",
        entityId: id,
        action: "update",
        before: userSnapshot(current),
        after: userSnapshot(updated),
        actorEmail: sessionUser?.email,
      });
      return { kind: "updated", user: updated } as const;
    });
    if (outcome.kind === "missing") return notFound("User");
    if (outcome.kind === "self-role-change") return conflict("You can't change your own role.");
    if (outcome.kind === "last-owner") return conflict("Can't demote the last remaining OWNER account.");
    return apiSuccess(outcome.user);
  } catch (error) {
    return internalError(error);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireOwner())) return unauthorized();

  const { id } = await params;
  const sessionUser = await getSessionUser();

  if (sessionUser?.id === id) {
    return conflict("You can't delete your own account.");
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({ where: { id } });
      if (!current) return { kind: "missing" } as const;

      if (current.role === "OWNER") {
        const ownerCount = await tx.user.count({ where: { role: "OWNER" } });
        if (ownerCount <= 1) return { kind: "last-owner" } as const;
      }

      await tx.user.delete({ where: { id } });
      await recordAuditLog(tx, {
        entityType: "User",
        entityId: id,
        action: "delete",
        before: userSnapshot(current),
        after: null,
        actorEmail: sessionUser?.email,
      });
      return { kind: "deleted" } as const;
    });

    if (outcome.kind === "missing") return notFound("User");
    if (outcome.kind === "last-owner") return conflict("Can't delete the last remaining OWNER account.");
    return apiSuccess({ id });
  } catch (error) {
    return internalError(error);
  }
}
