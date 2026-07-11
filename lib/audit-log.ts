import type {
  Block,
  CustomTheme,
  NavItem,
  Page,
  Prisma,
  ResourcePack,
  SiteSettings,
  User,
} from "@/app/generated/prisma/client";
import fs from "node:fs";
import {
  blockUpdateSchema,
  pageCreateSchema,
  pageUpdateSchema,
  parseBlockData,
  protectedSlugChangeError,
  userUpdateSchema,
} from "@/lib/validation/pages";
import { navItemCreateSchema, navItemUpdateSchema } from "@/lib/validation/nav-items";
import { customThemeCreateSchema, customThemeUpdateSchema } from "@/lib/validation/custom-themes";
import { siteSettingsUpdateSchema } from "@/lib/validation/site-settings";
import { CUSTOM_THEME_TOKEN_FIELDS, type CustomThemeTokenField } from "@/lib/themes";
import { packPath } from "@/lib/uploads";

/**
 * Phase 21: audit trail + single-step undo. `recordAuditLog` is called by
 * every mutation route inside its own `$transaction`; `undoAuditEntry` is
 * called by `POST /api/audit-log/[id]/undo` (also inside a transaction).
 * See PLAN.md Phase 21 "Locked-in decisions" for the full design rationale
 * -- this file is the single place that rationale is actually implemented,
 * so route instrumentation (Phase 21 step 3) never has to re-derive it.
 */

export const AUDIT_ENTITY_TYPES = [
  "Page",
  "Block",
  "NavItem",
  "CustomTheme",
  "User",
  "ResourcePack",
  "SiteSettings",
] as const;
export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
export type AuditAction = "create" | "update" | "delete";

export type TxClient = Prisma.TransactionClient;

export type AuditLogEntryRow = {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  before: string | null;
  after: string | null;
  actorEmail: string | null;
  createdAt: Date;
};

// ---------------------------------------------------------------------------
// Writing entries
// ---------------------------------------------------------------------------

/**
 * Records one audit entry. Always call this inside the same `$transaction`
 * as the mutation it describes (decision 3) -- pass `tx`, never the bare
 * `prisma` client, so a failed mutation can never leave an orphan entry (or
 * vice versa).
 */
export async function recordAuditLog(
  tx: TxClient,
  entry: {
    entityType: AuditEntityType;
    entityId: string;
    action: AuditAction;
    before: unknown;
    after: unknown;
    actorEmail: string | null | undefined;
  },
) {
  await tx.auditLogEntry.create({
    data: {
      entityType: entry.entityType,
      entityId: entry.entityId,
      action: entry.action,
      before: entry.before == null ? null : JSON.stringify(entry.before),
      after: entry.after == null ? null : JSON.stringify(entry.after),
      actorEmail: entry.actorEmail ?? null,
    },
  });
}

// ---------------------------------------------------------------------------
// Snapshot helpers -- the ONLY place each entity's before/after shape is
// decided. Route instrumentation always snapshots through these, never by
// hand, so (a) Block's JSON-string `data` is consistently pre-parsed into
// the snapshot (readable diffs, and undo doesn't need to double-decode), and
// (b) User's `passwordHash` can never leak into a snapshot by a route author
// forgetting to omit it (decision 2 -- hard rule, enforced here once).
// ---------------------------------------------------------------------------

export function pageSnapshot(row: Page) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    metaDescription: row.metaDescription,
    published: row.published,
    protected: row.protected,
    adminOnly: row.adminOnly,
    theme: row.theme,
    customThemeId: row.customThemeId,
  };
}

export function blockSnapshot(row: Block) {
  return {
    id: row.id,
    pageId: row.pageId,
    order: row.order,
    type: row.type,
    data: JSON.parse(row.data) as unknown,
  };
}

export function navItemSnapshot(row: NavItem) {
  return {
    id: row.id,
    label: row.label,
    href: row.href,
    pageId: row.pageId,
    order: row.order,
    parentId: row.parentId,
  };
}

export function customThemeSnapshot(row: CustomTheme) {
  const tokens = Object.fromEntries(CUSTOM_THEME_TOKEN_FIELDS.map((field) => [field, row[field]])) as Record<
    CustomThemeTokenField,
    string
  >;
  return { id: row.id, name: row.name, showInPicker: row.showInPicker, ...tokens };
}

/** NEVER includes `passwordHash` -- decision 2 is a hard rule, not a
 * nice-to-have. This is the only function in the codebase allowed to read a
 * `User` row for audit purposes; every route in the Prerequisite-reading
 * list must snapshot through this, never spread a raw row. */
export function userSnapshot(row: Pick<User, "id" | "email" | "name" | "role">) {
  return { id: row.id, email: row.email, name: row.name, role: row.role };
}

export function resourcePackSnapshot(row: ResourcePack) {
  return { id: row.id, filename: row.filename, size: row.size, sha1: row.sha1, active: row.active, uploadedBy: row.uploadedBy };
}

export function siteSettingsSnapshot(row: SiteSettings) {
  return {
    id: row.id,
    faviconImageId: row.faviconImageId,
    embedImageId: row.embedImageId,
    embedTitle: row.embedTitle,
    embedDescription: row.embedDescription,
  };
}

// ---------------------------------------------------------------------------
// Undo mechanics (decision 4)
// ---------------------------------------------------------------------------

export type UndoOutcome = { ok: true } | { ok: false; message: string };

export type UndoContext = {
  /** Current session's user -- the admin clicking "Undo", not the original
   * actor. `updatedBy`/similar audit fields on the reverted row are set to
   * this, and User-entity undo re-checks self-role-change/last-owner rules
   * against this id (same invariants the live routes already enforce). */
  actorEmail: string | null;
  actorId: string | null;
}

type UndoHandler = (tx: TxClient, entry: AuditLogEntryRow, ctx: UndoContext) => Promise<UndoOutcome>;

const PRISMA_RECORD_NOT_FOUND = "P2025";

function isRecordNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: string }).code === PRISMA_RECORD_NOT_FOUND;
}

/** Deletes are naturally idempotent for "undo a create": if the row is
 * already gone (deleted some other way since), that's not a failure. */
async function deleteIfExists(fn: () => Promise<unknown>): Promise<UndoOutcome> {
  try {
    await fn();
  } catch (error) {
    if (!isRecordNotFound(error)) return conflictFrom(error);
  }
  return { ok: true };
}

function conflictFrom(error: unknown): { ok: false; message: string } {
  console.error("audit-log undo write failed:", error);
  return {
    ok: false,
    message:
      "Couldn't restore this entity -- its data may now conflict with something else (a slug, name, email, or sha1 already in use, or a referenced record that no longer exists).",
  };
}

async function safeWrite(fn: () => Promise<unknown>): Promise<UndoOutcome> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    return conflictFrom(error);
  }
}

/** Removes null/undefined keys so a snapshot can be re-validated through a
 * Zod schema whose optional fields are `.optional()` only (not
 * `.nullable()`) -- e.g. NavItem's href/pageId/parentId. The *write* payload
 * still uses the verbatim snapshot (see each handler below) so an
 * undo can still explicitly clear a field back to null; this stripped copy
 * is only ever used for the validation pass. */
function stripNullish<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(obj) as (keyof T)[]) {
    const value = obj[key];
    if (value !== null && value !== undefined) out[key] = value;
  }
  return out;
}

function parseSnapshot<T>(raw: string | null): T | null {
  if (raw === null) return null;
  return JSON.parse(raw) as T;
}

const undoHandlers: Record<AuditEntityType, UndoHandler> = {
  // -------------------------------------------------------------------
  Page: async (tx, entry, ctx) => {
    if (entry.action === "create") {
      return deleteIfExists(() => tx.page.delete({ where: { id: entry.entityId } }));
    }

    const snapshot = parseSnapshot<ReturnType<typeof pageSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };

    if (entry.action === "update") {
      const existing = await tx.page.findUnique({ where: { id: entry.entityId } });
      if (!existing) return { ok: false, message: "This page no longer exists." };

      const slugError = protectedSlugChangeError(existing, snapshot.slug);
      if (slugError) return { ok: false, message: slugError };

      const fields = { slug: snapshot.slug, title: snapshot.title, metaDescription: snapshot.metaDescription, published: snapshot.published, adminOnly: snapshot.adminOnly, theme: snapshot.theme, customThemeId: snapshot.customThemeId };
      const parsed = pageUpdateSchema.safeParse(stripNullish(fields));
      if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current page schema." };

      return safeWrite(() => tx.page.update({ where: { id: entry.entityId }, data: { ...fields, updatedBy: ctx.actorEmail } }));
    }

    // delete -> recreate
    const fields = { slug: snapshot.slug, title: snapshot.title, metaDescription: snapshot.metaDescription, published: snapshot.published, adminOnly: snapshot.adminOnly, theme: snapshot.theme, customThemeId: snapshot.customThemeId };
    const parsed = pageCreateSchema.safeParse(stripNullish(fields));
    if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current page schema." };

    return safeWrite(() =>
      tx.page.create({ data: { id: entry.entityId, ...fields, protected: snapshot.protected, updatedBy: ctx.actorEmail } }),
    );
  },

  // -------------------------------------------------------------------
  Block: async (tx, entry, ctx) => {
    if (entry.action === "create") {
      return deleteIfExists(() => tx.block.delete({ where: { id: entry.entityId } }));
    }

    const snapshot = parseSnapshot<ReturnType<typeof blockSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };

    const dataParsed = parseBlockData(snapshot.type, snapshot.data);
    if (!dataParsed.success) return { ok: false, message: "Stored snapshot no longer matches this block type's schema." };
    const orderParsed = blockUpdateSchema.shape.order.safeParse(snapshot.order);
    if (!orderParsed.success) return { ok: false, message: "Stored snapshot has an invalid order value." };

    if (entry.action === "update") {
      const existing = await tx.block.findUnique({ where: { id: entry.entityId } });
      if (!existing) return { ok: false, message: "This block no longer exists." };
      return safeWrite(() =>
        tx.block.update({
          where: { id: entry.entityId },
          data: { order: snapshot.order, data: JSON.stringify(dataParsed.data), updatedBy: ctx.actorEmail },
        }),
      );
    }

    // delete -> recreate (the page it belonged to must still exist)
    const page = await tx.page.findUnique({ where: { id: snapshot.pageId } });
    if (!page) return { ok: false, message: "The page this block belonged to no longer exists." };

    return safeWrite(() =>
      tx.block.create({
        data: {
          id: entry.entityId,
          pageId: snapshot.pageId,
          type: snapshot.type,
          order: snapshot.order,
          data: JSON.stringify(dataParsed.data),
          updatedBy: ctx.actorEmail,
        },
      }),
    );
  },

  // -------------------------------------------------------------------
  NavItem: async (tx, entry) => {
    if (entry.action === "create") {
      return deleteIfExists(() => tx.navItem.delete({ where: { id: entry.entityId } }));
    }

    const snapshot = parseSnapshot<ReturnType<typeof navItemSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };
    const fields = { label: snapshot.label, href: snapshot.href, pageId: snapshot.pageId, parentId: snapshot.parentId, order: snapshot.order };

    if (entry.action === "update") {
      const existing = await tx.navItem.findUnique({ where: { id: entry.entityId } });
      if (!existing) return { ok: false, message: "This nav item no longer exists." };
      const parsed = await navItemUpdateSchema.safeParseAsync(stripNullish(fields));
      if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current nav item schema." };
      return safeWrite(() => tx.navItem.update({ where: { id: entry.entityId }, data: fields }));
    }

    // delete -> recreate
    const parsed = await navItemCreateSchema.safeParseAsync(stripNullish(fields));
    if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current nav item schema." };
    return safeWrite(() => tx.navItem.create({ data: { id: entry.entityId, ...fields } }));
  },

  // -------------------------------------------------------------------
  CustomTheme: async (tx, entry, ctx) => {
    if (entry.action === "create") {
      return deleteIfExists(() => tx.customTheme.delete({ where: { id: entry.entityId } }));
    }

    const snapshot = parseSnapshot<ReturnType<typeof customThemeSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };
    const fields = { ...snapshot, id: undefined };

    if (entry.action === "update") {
      const existing = await tx.customTheme.findUnique({ where: { id: entry.entityId } });
      if (!existing) return { ok: false, message: "This theme no longer exists." };
      const parsed = customThemeUpdateSchema.safeParse(fields);
      if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current theme schema." };
      return safeWrite(() => tx.customTheme.update({ where: { id: entry.entityId }, data: fields }));
    }

    // delete -> recreate
    const parsed = customThemeCreateSchema.safeParse(fields);
    if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current theme schema." };
    return safeWrite(() => tx.customTheme.create({ data: { ...fields, id: entry.entityId, createdBy: ctx.actorEmail } }));
  },

  // -------------------------------------------------------------------
  User: async (tx, entry, ctx) => {
    if (entry.action === "create") {
      if (ctx.actorId === entry.entityId) return { ok: false, message: "You can't delete your own account." };
      return deleteIfExists(() => tx.user.delete({ where: { id: entry.entityId } }));
    }

    if (entry.action === "delete") {
      // decision 2 (never store passwordHash) means a deleted User's login
      // credential is gone forever -- there is no safe value to recreate
      // the row with, so this is a hard, permanent rejection, not a
      // staleness-style "allowed with a warning" case.
      return { ok: false, message: "User accounts can't be restored via undo -- passwords are never captured in the audit trail. Create a new account instead." };
    }

    const snapshot = parseSnapshot<ReturnType<typeof userSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };

    const existing = await tx.user.findUnique({ where: { id: entry.entityId } });
    if (!existing) return { ok: false, message: "This user no longer exists." };

    const changingRole = snapshot.role !== existing.role;
    if (ctx.actorId === entry.entityId && changingRole) return { ok: false, message: "You can't change your own role." };
    if (changingRole && existing.role === "OWNER") {
      const ownerCount = await tx.user.count({ where: { role: "OWNER" } });
      if (ownerCount <= 1) return { ok: false, message: "Can't demote the last remaining OWNER account." };
    }

    const fields = { email: snapshot.email, name: snapshot.name, role: snapshot.role };
    const parsed = userUpdateSchema.safeParse(stripNullish({ ...fields, password: undefined }));
    if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current user schema." };

    return safeWrite(() => tx.user.update({ where: { id: entry.entityId }, data: fields }));
  },

  // -------------------------------------------------------------------
  ResourcePack: async (tx, entry) => {
    if (entry.action === "create") {
      const existing = await tx.resourcePack.findUnique({ where: { id: entry.entityId } });
      if (!existing) return { ok: true }; // already gone
      if (existing.active) return { ok: false, message: "Cannot undo -- this is the active resource pack. Activate a different pack first." };
      try {
        fs.unlinkSync(packPath(existing.sha1));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") return conflictFrom(error);
      }
      return safeWrite(() => tx.resourcePack.delete({ where: { id: entry.entityId } }));
    }

    if (entry.action === "delete") {
      const snapshot = parseSnapshot<ReturnType<typeof resourcePackSnapshot>>(entry.before);
      if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };
      let fileExists: boolean;
      try {
        fileExists = fs.existsSync(packPath(snapshot.sha1));
      } catch {
        return { ok: false, message: "Stored sha1 is no longer a valid reference." };
      }
      if (!fileExists) return { ok: false, message: "The pack's file no longer exists on disk -- it can't be restored via undo." };
      return safeWrite(() => tx.resourcePack.create({ data: { ...snapshot, id: entry.entityId } }));
    }

    // update: currently only the `active` flag changes post-creation (see
    // POST .../activate). Restoring it here is a single-row operation --
    // it does NOT re-enforce "exactly one active pack" across other rows,
    // matching this phase's documented staleness-is-allowed stance (decision
    // 4) rather than trying to re-derive a multi-row invariant during undo.
    const snapshot = parseSnapshot<ReturnType<typeof resourcePackSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };
    const existing = await tx.resourcePack.findUnique({ where: { id: entry.entityId } });
    if (!existing) return { ok: false, message: "This resource pack no longer exists." };
    return safeWrite(() => tx.resourcePack.update({ where: { id: entry.entityId }, data: { active: snapshot.active } }));
  },

  // -------------------------------------------------------------------
  SiteSettings: async (tx, entry, ctx) => {
    if (entry.action === "create") {
      // Deleting the singleton is safe: getSiteSettings() recreates it with
      // all-null defaults on next read, so this is equivalent to "reset to
      // defaults", not an error state.
      return deleteIfExists(() => tx.siteSettings.delete({ where: { id: entry.entityId } }));
    }

    const snapshot = parseSnapshot<ReturnType<typeof siteSettingsSnapshot>>(entry.before);
    if (!snapshot) return { ok: false, message: "No prior state recorded for this entry." };
    const fields = {
      faviconImageId: snapshot.faviconImageId,
      embedImageId: snapshot.embedImageId,
      embedTitle: snapshot.embedTitle,
      embedDescription: snapshot.embedDescription,
    };
    const parsed = siteSettingsUpdateSchema.safeParse(stripNullish(fields));
    if (!parsed.success) return { ok: false, message: "Stored snapshot no longer matches the current settings schema." };

    // Re-validate image ids against real rows, same as the live PUT route --
    // an id that was valid when snapshotted may have since been deleted.
    if (fields.faviconImageId) {
      const image = await tx.uploadedImage.findUnique({ where: { id: fields.faviconImageId } });
      if (!image) return { ok: false, message: "The favicon image referenced by this snapshot no longer exists." };
    }
    if (fields.embedImageId) {
      const image = await tx.uploadedImage.findUnique({ where: { id: fields.embedImageId } });
      if (!image) return { ok: false, message: "The embed image referenced by this snapshot no longer exists." };
    }

    return safeWrite(() =>
      tx.siteSettings.upsert({
        where: { id: entry.entityId },
        create: { id: entry.entityId, ...fields, updatedBy: ctx.actorEmail },
        update: { ...fields, updatedBy: ctx.actorEmail },
      }),
    );
  },
};

/** Dispatches to the per-entity-type handler (decision 4). Undoing an
 * already-undone entry, or an entry whose entity has changed since, is
 * intentionally allowed -- callers surface staleness as a non-blocking UI
 * warning, not by refusing here. */
export async function undoAuditEntry(tx: TxClient, entry: AuditLogEntryRow, ctx: UndoContext): Promise<UndoOutcome> {
  const handler = undoHandlers[entry.entityType as AuditEntityType];
  if (!handler) return { ok: false, message: `Unknown entity type "${entry.entityType}".` };
  if (entry.action !== "create" && entry.action !== "update" && entry.action !== "delete") {
    return { ok: false, message: `Unknown action "${entry.action}".` };
  }
  return handler(tx, entry, ctx);
}

/** Thrown by `undoAuditEntryOrThrow` on a failed undo -- callers inside a
 * `$transaction` should let this propagate (never swallow it into a normal
 * return), so Prisma rolls the whole transaction back deterministically
 * instead of committing after a caught internal write failure. */
export class UndoConflictError extends Error {}

/**
 * Transaction-safe entrypoint for `POST /api/audit-log/[id]/undo`: same as
 * `undoAuditEntry`, but throws `UndoConflictError` instead of returning
 * `{ ok: false }` -- call this (not `undoAuditEntry` directly) from inside a
 * `prisma.$transaction(async (tx) => ...)` callback.
 */
export async function undoAuditEntryOrThrow(tx: TxClient, entry: AuditLogEntryRow, ctx: UndoContext): Promise<void> {
  const outcome = await undoAuditEntry(tx, entry, ctx);
  if (!outcome.ok) throw new UndoConflictError(outcome.message);
}
