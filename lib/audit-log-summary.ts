/**
 * Client-safe plain-English one-line summaries of audit log entries, read
 * straight from the same `before`/`after` snapshots already stored --
 * doesn't replace the existing expandable raw-JSON "Details" view, just adds
 * a human-readable line above it. Deliberately doesn't import
 * `lib/audit-log.ts` -- that module pulls in `node:fs` and server-only
 * validation schemas that have no business in a client bundle (same reason
 * `components/admin/audit-log-admin.tsx` already duplicates
 * `AUDIT_ENTITY_TYPES` instead of importing it). `blockTypeLabels` is
 * imported from lib/validation/pages.ts specifically (not
 * components/blocks/registry.tsx, which re-exports the same binding) since
 * that file also imports every block component -- far more than this
 * summary line needs.
 */

import { blockTypeLabels, type BlockType } from "@/lib/validation/pages";

export type AuditSummaryEntry = {
  entityType: string;
  action: string;
  before: string | null;
  after: string | null;
};

type Snapshot = Record<string, unknown>;

function fallbackText(entry: AuditSummaryEntry): string {
  return `${entry.action} ${entry.entityType}`;
}

function parseSnapshot(json: string | null): Snapshot | null {
  if (json === null) return null;
  const parsed: unknown = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return parsed as Snapshot;
}

/** Best human-readable identifier for an entity, read from whichever field
 * is most name-like for that entity type. Entities with no natural name
 * (Block, UploadedImage) fall back to their most identifying field instead. */
function displayField(entityType: string, snapshot: Snapshot): string {
  switch (entityType) {
    case "Page":
      return typeof snapshot.title === "string" ? snapshot.title : String(snapshot.slug ?? "");
    case "Block":
      return typeof snapshot.type === "string" ? (blockTypeLabels[snapshot.type as BlockType] ?? snapshot.type) : "";
    case "NavItem":
      return typeof snapshot.label === "string" ? snapshot.label : "";
    case "CustomTheme":
    case "Tag":
      return typeof snapshot.name === "string" ? snapshot.name : "";
    case "User":
      return (typeof snapshot.name === "string" && snapshot.name) || String(snapshot.email ?? "");
    case "ResourcePack":
      return typeof snapshot.filename === "string" ? snapshot.filename : "";
    case "UploadedImage":
      return typeof snapshot.sha1 === "string" ? `${snapshot.sha1.slice(0, 10)}…` : "";
    default:
      return "";
  }
}

function isPrimitive(value: unknown): value is string | number | boolean | null {
  return value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean";
}

function humanizeField(field: string): string {
  return field.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return `"${value}"`;
  if (value === null || value === undefined) return "(none)";
  return String(value);
}

type FieldChange = { field: string; from: unknown; to: unknown };

function diffFields(before: Snapshot, after: Snapshot): FieldChange[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changes: FieldChange[] = [];
  for (const field of fields) {
    if (field === "id") continue;
    const from = before[field];
    const to = after[field];
    if (JSON.stringify(from) !== JSON.stringify(to)) changes.push({ field, from, to });
  }
  return changes;
}

function describeChanges(changes: FieldChange[]): string {
  const parts = changes.map((c) => `${humanizeField(c.field)} from ${formatValue(c.from)} to ${formatValue(c.to)}`);
  return `Changed ${parts.join(" and ")}`;
}

function summarizeCreateOrDelete(entry: AuditSummaryEntry, snapshot: Snapshot): string {
  const verb = entry.action === "create" ? "Created" : "Deleted";
  if (entry.entityType === "SiteSettings") return `${verb} site settings`;
  const label = displayField(entry.entityType, snapshot);
  return label ? `${verb} ${entry.entityType} "${label}"` : `${verb} ${entry.entityType}`;
}

function summarizeUpdate(entry: AuditSummaryEntry, before: Snapshot, after: Snapshot): string {
  if (entry.entityType === "SiteSettings") return "Updated site settings";

  const label = displayField(entry.entityType, after);
  const generic = label ? `Updated ${entry.entityType} "${label}"` : `Updated ${entry.entityType}`;

  const changes = diffFields(before, after);
  if (changes.length === 0 || changes.length > 2) return generic;
  // A changed field whose value isn't a primitive (e.g. a Block's nested
  // `data` object) can't be rendered as "from X to Y" -- that's the "diff
  // can't be meaningfully summarized" case, so fall back to the generic line.
  if (changes.some((c) => !isPrimitive(c.from) || !isPrimitive(c.to))) return generic;
  return describeChanges(changes);
}

/** Never throws -- any parse failure or unexpected shape (malformed/legacy
 * entry) falls back to the plain `"{action} {entity type}"` text rather than
 * crashing the admin page on an old or unusual entry. */
export function summarizeAuditEntry(entry: AuditSummaryEntry): string {
  try {
    if (entry.action === "create") {
      const after = parseSnapshot(entry.after);
      if (!after) return fallbackText(entry);
      return summarizeCreateOrDelete(entry, after);
    }

    if (entry.action === "delete") {
      const before = parseSnapshot(entry.before);
      if (!before) return fallbackText(entry);
      return summarizeCreateOrDelete(entry, before);
    }

    if (entry.action === "update") {
      const before = parseSnapshot(entry.before);
      const after = parseSnapshot(entry.after);
      if (!before || !after) return fallbackText(entry);
      return summarizeUpdate(entry, before, after);
    }

    return fallbackText(entry);
  } catch {
    return fallbackText(entry);
  }
}
