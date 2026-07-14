# PLAN.md — Custom Blocks (admin-defined block types)

**Status: scoped, not yet implemented.** Nothing here carries over from any
prior version of this file — the previous pass (pages/tags admin pass,
protected-page titles, audit log, Link Grid resize, multi-tag+color, Post
Display block) is complete and gone; do not look it up, do not renumber
around it. Phase numbers below are local to this file only.

A separate, unrelated set of 5 lettered phases (protected static-route pages
in production, page-title suffix, Post Display enhancements, a multi-server
status block, Hero button customization) was scoped, implemented, and
shipped same-day (2026-07-14) alongside this file — also complete and gone,
same as any prior pass. Nothing below depends on it.

**Hard rule, unchanged from every prior version of this file: this file's own
nomenclature (`Phase N`, `PLAN.md`, decision numbers, etc.) must never be
referenced in source code comments.** A comment has to stand on its own and
still make sense after this file is deleted or replaced by the next one.

## What this is

Today every block type (`richText`, `callout`, `linkGrid`, `table`, …) is a
fixed TypeScript union (`BLOCK_TYPES` in `lib/validation/pages.ts`), each
with its own hardcoded Zod schema and its own hardcoded React component in
`components/blocks/registry.tsx`. Adding a block type is a code change
across ~4 files. This plan adds a **second, parallel path**: site admins
define new block *types* themselves from the admin panel — a name plus an
ordered list of fields (text, image, color, link, repeatable rows, …) — and
those definitions immediately become usable in the page builder's "Add
block" picker, right alongside the built-in types. Built-in block types are
untouched by this work; nothing about them changes or gets migrated.

## Locked scope decisions

Answered up front (2026-07-13) because they change the shape of every phase
below — do not re-litigate without asking again:

- **Layout is staged.** Ship a small library of fixed layout templates first
  (admin picks the closest-fit template for a definition, fields fill its
  slots). A free-form per-field row/width layout canvas is a later,
  explicitly-separate phase, built only after the fixed-template version has
  real usage to learn from.
- **Repeater fields go one level deep.** A field can be marked repeatable
  (admin adds/removes/reorders rows in a page's block instance), where each
  row is a fixed set of *primitive* fields (text/image/link/etc.) defined
  once on the repeater field itself — no repeater-inside-repeater. Same
  "one level of nesting only" shape already used for nav dropdowns
  (`NavItem.parentId`).
- **Definition authorship is OWNER + ADMIN**, not OWNER-only. Matches the
  existing rule that both roles get full site-editing rights (pages, nav,
  content) — `lib/auth-guard.ts`'s `isAdminOrOwner`-style check already
  covers this with no new permission plumbing needed. Only user-account
  management stays OWNER-only.

Five phases. Phase 1 blocks everything else; Phase 5 is optional/speculative
and should be re-scoped (or dropped) once Phase 1-4 are live — see its own
note. Phases 2-4 land in order (2 before 3, 3 before 4) since each depends on
the previous phase's schema/API surface.

---

## Phase 1 — Data model: `BlockDefinition` and field definitions

### Goal
Add the schema for an admin-authored block type, with no runtime behavior
change yet (nothing reads these tables outside a migration + Prisma Studio
sanity check).

### Data model
Two new models in `prisma/schema.prisma`:

```prisma
model BlockDefinition {
  id          String                @id @default(cuid())
  key         String                @unique   // stable, kebab-case, immutable after create
  name        String                          // admin-facing label
  description String?
  layout      String                          // one of a fixed set of template ids (Phase 4)
  fields      BlockFieldDefinition[]
  createdAt   DateTime              @default(now())
  updatedAt   DateTime              @updatedAt
  createdBy   String?
  blocks      Block[]               @relation("CustomBlockInstances")
}

model BlockFieldDefinition {
  id                String          @id @default(cuid())
  blockDefinition   BlockDefinition @relation(fields: [blockDefinitionId], references: [id], onDelete: Cascade)
  blockDefinitionId String
  key               String                    // stable per-definition, used as the data-object key
  label             String
  fieldType         String                    // text | richText | number | boolean | color | image | link | select | repeater
  order             Int
  required          Boolean         @default(false)
  helpText          String?
  config            String                    // JSON: per-fieldType settings (see Phase 2); for
                                                // `repeater`, config.fields holds the row's own
                                                // item field defs inline (JSON, not more DB rows —
                                                // see the one-level-deep decision above), each
                                                // restricted to a non-repeater fieldType
}
```

`Block` (existing model) gets one new nullable FK:

```prisma
model Block {
  // ...existing fields unchanged...
  blockDefinition   BlockDefinition? @relation("CustomBlockInstances", fields: [blockDefinitionId], references: [id])
  blockDefinitionId String?
}
```

`Block.type` gains exactly one new literal, `"custom"`, alongside the
existing `BLOCK_TYPES` values — a custom block's `type` is always the string
`"custom"`, with `blockDefinitionId` pointing at which definition it is. Do
**not** encode the definition into `type` itself (e.g. `custom:<id>`) — a
separate FK column keeps referential integrity (`onDelete` behavior, joins)
instead of a string that Prisma can't enforce.

### Production-safety check for this phase
Purely additive new tables — no existing rows to backfill, so there is no
migration-data-hardcoding risk to check for here (the concrete failure mode
from commit `ac831b6`). Still confirm before considering this phase done:
- The generated migration's SQL contains no `INSERT`/`UPDATE` at all beyond
  table creation — if it does, something about this phase's scope has
  drifted from "purely additive."
- `prisma/seed.ts` is untouched. Custom block definitions start empty on
  every environment; nothing here needs seeding.

---

## Phase 2 — Dynamic validation & API routes

### Goal
A definition's fields can be turned into a real Zod schema at request time,
and both `BlockDefinition` CRUD and custom `Block` create/update are
validated through it — mirroring how `blockDataSchemas[type]` already works
for built-in types in `lib/validation/pages.ts`, but built dynamically
instead of statically.

### `lib/validation/block-definitions.ts` (new file)
- `blockFieldTypeSchema = z.enum(["text", "richText", "number", "boolean", "color", "image", "link", "select", "repeater"])`.
- One Zod schema per field type's `config` shape (e.g. `select`'s config
  needs an `options: {value, label}[]` list; `number`'s needs optional
  `min`/`max`; `link`'s needs an `allowNewTab: boolean` flag; `repeater`'s
  needs `fields: <array of the same per-type config schemas, minus
  "repeater" itself>` — the exclusion is what makes the one-level rule a
  structural Zod guarantee, not just a runtime check someone can forget).
- `blockFieldDefinitionSchema` / `blockDefinitionCreateSchema` /
  `blockDefinitionUpdateSchema` for the admin-facing CRUD payloads (name,
  key, description, layout, ordered fields array). `key` reuses the same
  kebab-case shape as `slugSchema` in `lib/validation/pages.ts` (import and
  reuse the regex, don't redefine it) and must be unique — checked at the API
  layer like page-slug uniqueness already is.
- `buildDataSchemaFromDefinition(fields: BlockFieldDefinition[]): z.ZodTypeAny`
  — the dynamic-schema builder. Given a definition's fields, returns a
  `z.object({...})` keyed by each field's `key`, with the right Zod type per
  `fieldType` (`z.string()` for text/color/link-href, `z.number()` for
  number, `z.boolean()` for boolean, `z.array(z.object({...}))` for
  repeater rows built from its own `config.fields`), each `.optional()`
  unless `required`. This is the function `app/api/blocks/route.ts` and
  `app/api/blocks/[id]/route.ts` call for any block whose `type ===
  "custom"`, in place of the static `blockDataSchemas[type]` lookup used for
  built-ins.

### API routes
- `app/api/block-definitions/route.ts` — `GET` (list all, for the admin
  builder UI and the page-builder's "Add block" picker) and `POST` (create;
  `isAdminOrOwner`-gated per the locked decision above).
- `app/api/block-definitions/[id]/route.ts` — `GET`, `PUT` (edit
  name/description/layout/fields), `DELETE`. `DELETE` must reject
  (`409 conflict`, matching the existing `conflict()` helper pattern in
  `lib/api-response.ts`) while `prisma.block.count({ where:
  { blockDefinitionId: id } }) > 0` — never cascade-delete live page
  content. Error payload should include enough for the UI to point the admin
  at the pages still using it (see Phase 3).
- `app/api/blocks/route.ts` (`POST`) and `app/api/blocks/[id]/route.ts`
  (`PUT`): extend the `type` handling so `"custom"` looks up the referenced
  `BlockDefinition` (404 if it's been deleted — shouldn't be reachable given
  the delete guard above, but the row could be gone by the time a stale
  client submits), builds its schema via `buildDataSchemaFromDefinition`,
  and validates `data` against that instead of a `blockDataSchemas` lookup.
  `blockCreateSchema`'s discriminated union in `lib/validation/pages.ts`
  needs a `"custom"` arm too (`data: z.unknown()`, since the real shape
  isn't known until the definition is fetched) — same two-stage validation
  split the doc comment on `blockUpdateSchema` already describes for
  existing blocks ("data's shape … validated separately in the route").

### Default data on add
`defaultBlockData` in `registry.tsx` is keyed by the static `BlockType`
union, so it has no entry for `"custom"` — a freshly-added custom block's
initial `data` instead comes from each field's own default, assembled
server- or client-side from the definition (`text`/`color`/`link` default to
`""`, `number` to `null`, `boolean` to `false`, `repeater` to `[]`, unless a
field's `config` carries an explicit `defaultValue` — worth deciding at
implementation time whether `defaultValue` is worth adding to every
field-type's config now or left for a later pass once real definitions show
whether admins actually want non-empty starting content).

---

## Phase 3 — Admin UI: the block-type builder

### Goal
An OWNER/ADMIN can create, edit, and delete `BlockDefinition`s entirely
through the admin panel — no code changes required to add a new block type
from here on.

### UI
- New admin section, `components/admin/block-definitions-admin.tsx` +
  `app/admin/block-types/page.tsx`, following the existing admin-section
  pattern (`tags-admin.tsx` + `app/admin/tags/` is the closest analog: a
  list view, a create/edit form, delete with a guard). Add a nav entry
  alongside the existing admin sections.
- **List view**: definition name, field count, live usage count (`Block`
  rows referencing it) fetched via the API. Delete button disabled (with the
  409's page list surfaced in a tooltip/modal) while usage count > 0,
  matching Phase 2's API guard rather than trusting client-side state alone.
- **Field editor**: add a field, pick its type from the fixed type library,
  set `label`/`key`/`required`/`helpText`, and a per-type config sub-form
  (e.g. `select` shows an options-list editor; `number` shows min/max
  inputs; `link` shows an "allow opening in new tab" toggle). Reorder fields
  with the existing `MoveUpButton`/`MoveDownButton` pattern from
  `components/admin/list-controls.tsx` — same component already used by
  `RulesEditor`/`FeaturesEditor`, don't build a new reordering UI.
- **Repeater fields**: marking a field as `repeater` opens a nested
  mini field-list editor for that row's own item fields, using the same
  field-editor component recursively but with `repeater` excluded from the
  type picker — enforcing the one-level rule in the UI to match Phase 2's
  schema-level enforcement (belt and suspenders, not either/or).
- **Layout picker**: a dropdown of the fixed template ids from Phase 4
  (`stacked`, `banner`, `repeaterGrid`, …) with a short description/preview
  of each — this field is required on every definition per the Phase 1
  schema (`layout: String`, not nullable).

---

## Phase 4 — Field-type library, instance rendering, and page-builder wiring

### Goal
Custom blocks are actually usable on real pages: the "Add block" picker
lists live definitions, adding one creates a `Block` with `type: "custom"`,
and both the visitor-facing render and the admin inline-edit form work for
every field type, using the fixed layout templates decided in Phase 3.

### Shared field-input components
One component per `fieldType`, used in two places (definition-builder config
forms *and* per-instance value editing) with different props but the same
visual language as existing block components (e.g. `RichTextBlock`'s
markdown-edit affordance, `ImageBlock`'s reuse of the existing image
library picker rather than a raw URL field — check
`components/admin/images-admin.tsx`'s picker before building a new one).
`richText` values go through the same `react-markdown` +
`rehype-sanitize` pipeline every other markdown-bearing block already
uses — no new sanitization path, no raw HTML from custom-block data ever
reaches the page (this is also a locked requirement from the original CMS
scoping pass, not new here).

### `components/blocks/custom-block-renderer.tsx` (new)
Given a `ClientBlock` (`type: "custom"`, `blockDefinitionId` set) plus its
resolved `BlockDefinition`, renders per `definition.layout`:
- Looks up a template component from a small fixed
  `Record<LayoutTemplateId, ComponentType<...>>` map (mirrors the existing
  `blockComponents` lookup-object pattern in `registry.tsx` — "a lookup
  object, not a long if/switch"). Each template knows how to arrange a
  definition's field keys into its own fixed slots (e.g. `banner` expects
  roughly image/heading/body/button-shaped fields and lays them out
  accordingly; fields that don't fit the template's expected shape still
  render, just in the template's fallback/generic slot — never silently
  dropped).
- Same edit-mode/visitor split every other block already has: reuses
  `BlockShell` for the move/delete chrome, and each field's input component
  only renders its editable form when `isAdmin && editMode`.

### Wiring into the page builder
- `registry.tsx`'s `blockComponents` gets a `"custom"` entry that resolves
  `block.blockDefinitionId` against a `referenceData.blockDefinitionsById`
  map (populated in `page-renderer.tsx`'s existing server-side prefetch,
  same shape as `ruleSectionsByBlockId`/`featuresByBlockId` today) and
  hands off to `CustomBlockRenderer`.
- The "Add block" picker (wherever `ADDABLE_BLOCK_TYPES` is currently
  consumed in `components/pages/page-blocks.tsx`) fetches live
  `BlockDefinition`s alongside the static list and offers both — a custom
  entry's "add" action `POST`s `{ type: "custom", blockDefinitionId,
  data: <assembled defaults from Phase 2> }`.

---

## Phase 5 — Free-form layout canvas (speculative, staged deliberately)

### Goal
Replace the fixed-template constraint from Phase 3/4 with real per-field
layout: each field gets its own row index + width fraction
(full/half/third/quarter) + alignment, and `definition.layout = "custom"`
switches `CustomBlockRenderer` from template-lookup to a CSS-grid engine
driven by that per-field config.

### Why this is separate and explicitly not committed yet
This is the highest-risk, most speculative part of the whole feature — it's
easy to either over-build (a full drag-and-drop canvas) or under-deliver (a
row/width picker that doesn't actually cover what admins turn out to want).
**Do not start this phase until Phase 1-4 are live and have real
definitions built by an actual admin** — revisit whether the fixed templates
already cover real usage well enough that this phase can be dropped
entirely, scoped down (e.g. just a width-fraction control, no row/alignment),
or built as originally imagined. If it proceeds:
- Add `layoutRow`/`layoutWidth`/`layoutAlign` to `BlockFieldDefinition`'s
  `config` (Phase 2's per-fieldType config schemas gain these as a shared
  optional sub-shape, not type-specific).
- Phase 3's field editor gains row/width/align controls, shown only when
  the definition's `layout` is `"custom"`.
- `CustomBlockRenderer` gains a second rendering path (CSS grid keyed by
  each field's row/width) alongside the Phase 4 template lookup — the two
  coexist per-definition based on `layout`, existing template-based
  definitions are unaffected.

---

## Cross-cutting checklist (applies across all phases, not a separate phase)

- **Audit log**: `BlockDefinition` create/edit/delete should produce audit
  log entries like every other admin mutation — check `lib/audit-log.ts`'s
  existing pattern (used by pages/nav/users today) before adding a
  parallel one-off logging call. Custom `Block` instance edits already flow
  through the same `/api/blocks` routes existing blocks use, so they get
  audit coverage for free once Phase 2's route changes land — no separate
  work needed there.
- **`docs/DEPLOYMENT.md`**: confirm no new env vars are introduced (none are
  expected — this is schema + code only) and that the deploy steps
  (`prisma migrate deploy` + `npm run db:seed`) need no changes, since
  `prisma/seed.ts` stays untouched per Phase 1. If either assumption breaks
  during implementation, update the doc as part of that phase, not
  after-the-fact.
- **No dev-only artifacts**: any temporary `BlockDefinition`s or custom
  block instances created to interactively verify a phase must be deleted
  before that phase is considered done, same as the existing rule for
  scratch pages/posts/tags.
