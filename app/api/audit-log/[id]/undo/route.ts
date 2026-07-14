import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getSessionUser, requireAdmin, requireEditingEnabled, requireOwner } from "@/lib/auth-guard";
import { apiSuccess, conflict, editingDisabled, internalError, notFound, unauthorized } from "@/lib/api-response";
import { UndoConflictError, recordAuditLog, undoAuditEntryOrThrow, type AuditAction, type AuditEntityType } from "@/lib/audit-log";

function revalidateForEntity(entityType: string) {
  // Undo is a rare, deliberate admin action (not a hot path), so a broad
  // layout revalidate is worth the simplicity over precisely tracking every
  // entity's specific affected paths (e.g. a Page's old vs. new slug).
  revalidatePath("/", "layout");
  if (entityType === "Page" || entityType === "Block") revalidatePath("/admin/pages");
  if (entityType === "NavItem") revalidatePath("/admin/nav");
  if (entityType === "CustomTheme") {
    revalidatePath("/admin/themes");
    revalidatePath("/admin/pages");
  }
  if (entityType === "ResourcePack") revalidatePath("/resource");
  if (entityType === "User") revalidatePath("/admin/users");
}

function snapshotEditingEnabled(snapshot: string | null): boolean | undefined {
  if (!snapshot) return undefined;
  try {
    const value = (JSON.parse(snapshot) as { editingEnabled?: unknown }).editingEnabled;
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
}

function changesEditingLock(entry: { before: string | null; after: string | null }): boolean {
  const before = snapshotEditingEnabled(entry.before);
  const after = snapshotEditingEnabled(entry.after);

  if (before !== undefined && after !== undefined) return before !== after;
  // Creating/deleting the singleton only changes the lock when the stored
  // side is false; an absent row is recreated with the safe true default.
  return before === false || after === false;
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return unauthorized();

  const { id } = await params;
  const sessionUser = await getSessionUser();
  const ctx = { actorEmail: sessionUser?.email ?? null, actorId: sessionUser?.id ?? null };

  try {
    const entry = await prisma.auditLogEntry.findUnique({ where: { id } });
    if (!entry) return notFound("Audit log entry");

    // Undo writes directly through a transaction client, bypassing the API
    // guards for the affected entity. Preserve the same boundaries here:
    // User management and changes to the lock itself remain reversible by an
    // OWNER while editing is disabled. Other site-settings undo operations
    // are ordinary content mutations and stay locked with everything else.
    const changesOwnerOnlySetting = entry.entityType === "SiteSettings" && changesEditingLock(entry);
    if ((entry.entityType === "User" || changesOwnerOnlySetting) && !(await requireOwner())) {
      return unauthorized();
    }
    if (entry.entityType !== "User" && !changesOwnerOnlySetting && !(await requireEditingEnabled())) {
      return editingDisabled();
    }

    // Undo is itself audited (never a silent, untracked bypass of the trail):
    // the recorded action mirrors what undo actually did to the entity
    // (undoing a create -> "delete", undoing a delete -> "create", undoing
    // an update -> "update" with before/after swapped from the original).
    const undoAction: AuditAction = entry.action === "create" ? "delete" : entry.action === "delete" ? "create" : "update";
    const undoBefore = entry.action === "delete" ? null : entry.after ? JSON.parse(entry.after) : null;
    const undoAfter = entry.action === "create" ? null : entry.before ? JSON.parse(entry.before) : null;

    await prisma.$transaction(async (tx) => {
      await undoAuditEntryOrThrow(tx, entry, ctx);
      await recordAuditLog(tx, {
        entityType: entry.entityType as AuditEntityType,
        entityId: entry.entityId,
        action: undoAction,
        before: undoBefore,
        after: undoAfter,
        actorEmail: ctx.actorEmail,
      });
    });

    revalidateForEntity(entry.entityType);

    return apiSuccess({ entityType: entry.entityType, entityId: entry.entityId, result: "reverted" });
  } catch (error) {
    if (error instanceof UndoConflictError) return conflict(error.message);
    return internalError(error);
  }
}
