/**
 * Entity types supported by the audit log. Kept free of server-only imports so
 * client admin surfaces can use the same filter union without pulling in
 * filesystem or database dependencies.
 */
export const AUDIT_ENTITY_TYPES = [
  "Page",
  "Block",
  "NavItem",
  "CustomTheme",
  "User",
  "ResourcePack",
  "SiteSettings",
  "UploadedImage",
  "Tag",
  "BlockDefinition",
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];
