import bcrypt from "bcrypt";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, resetRateLimit } from "@/lib/rate-limit";
import {
  apiSuccess,
  badRequest,
  conflict,
  internalError,
  unauthorized,
  validationError,
} from "@/lib/api-response";
import { changePasswordSchema } from "@/lib/validation/pages";

/**
 * Self-service password change. Deliberately a brand-new route,
 * not a reuse of the owner-only `PUT /api/users/[id]`: this one is reachable
 * by any signed-in user (ADMIN or OWNER) but only ever touches the caller's
 * own row via `session.user.id`, never a body/param-supplied id.
 */
export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return unauthorized();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Request body must be valid JSON.");
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const rateLimitKey = `password-change:${session.user.id}`;
  if (!checkRateLimit(rateLimitKey)) {
    return conflict("Too many attempts. Try again in a few minutes.");
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!existing) return unauthorized();

    const valid = await bcrypt.compare(parsed.data.currentPassword, existing.passwordHash);
    if (!valid) return badRequest("Current password is incorrect.");

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);

    await prisma.user.update({
      where: { id: session.user.id },
      data: { passwordHash },
    });

    resetRateLimit(rateLimitKey);

    return apiSuccess({ ok: true });
  } catch (error) {
    return internalError(error);
  }
}
