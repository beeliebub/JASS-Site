# PLAN.md — Admin tooling pass (post slugs, image library, audit log readability, Link Grid image removal)

**Status: all four phases complete and verified (live-browser-tested, not just**
**typecheck/lint) as of 2026-07-12.** Two bugs found during verification were
fixed before sign-off: a Next.js dynamic-route collision between the new
image-delete route and the existing image-serving route (Phase 3), and
Block-entity audit summaries showing the raw internal type key instead of its
human label (Phase 4). No Prisma migration was needed for any phase, per the
sequencing note below. Nothing here carries over from any prior version of
this file — previous phases are done and gone; do not look them up, do not
renumber around them.

**Hard rule, effective immediately: this file's own nomenclature (`Phase N`,
`PLAN.md`, decision numbers, etc.) must never be referenced in source code
comments.** A comment has to stand on its own and still make sense after this
file is deleted or replaced by the next one. If a comment needs to explain
*why* code is shaped a certain way, write the actual reason in the comment
itself — don't point at "Phase 3" as if that's a stable, permanent citation.
(A past version of this project didn't follow that rule, which is exactly why
a mechanical cleanup pass was needed before starting this one.)

Four independent features, each scoped from a real, specific ask. None of
them require a Prisma migration. They can be built and landed in any order —
see the sequencing note at the end for the one soft dependency between
Phase 3 and Phase 4.

---

## Phase 1 — Link Grid block: one-click image removal (Complete)

### Goal
In the Link Grid block's admin edit mode, an item with an image currently has
no way to remove it except manually clearing the "Image URL" text field by
hand. Add a small circular "×" button pinned to the top-right corner of the
image thumbnail itself so removing an image is a single click.

### Where
`components/blocks/link-grid-block.tsx`, the admin edit-mode branch inside
the `links.map` loop (the `<img>` currently rendered right before the
`EditableText` title/href/description stack).

### Design
- New handler `removeImage(index)`, following the same `persist(...)` pattern
  every other mutation in this file already uses: `persist(links.map((it, i)
  => (i === index ? { ...it, image: undefined } : it)))`. Drop the `image`
  key entirely (matches `QuickLink.image` being optional) rather than setting
  it to an empty string.
- Wrap the existing `<img>` in a `relative` container and absolutely
  position a small round button in its top-right corner (e.g. `absolute -top-1.5
  -right-1.5`). It needs its own visual treatment, not the existing square
  `IconButton`/`DeleteButton` from `components/admin/list-controls.tsx` —
  those are borderless-fill controls meant to sit inline in normal document
  flow; a control overlaid on top of an arbitrary photo needs a solid
  background (so it stays legible against any image content) and
  `rounded-full`, not `rounded-md`. Add this as a small local component in
  this file rather than a new shared export, since nothing else needs this
  exact overlay shape yet.
- Disable it while `saving` is true, same as the other per-item controls.
- Only rendered when `link.image` is set (nothing to remove otherwise).

### Files
- `components/blocks/link-grid-block.tsx`

### Testing
- Upload an image to a link entry in edit mode, confirm the × button
  appears on the thumbnail and the image is otherwise unaffected.
- Click it, confirm the image clears immediately and the empty state (no
  thumbnail rendered) looks correct.
- Reload the page, confirm the removal actually persisted (not just local
  state).
- Confirm the button is keyboard-reachable and has a visible focus state,
  and that it doesn't visually collide with anything else in the row on
  narrow layouts.

---

## Phase 2 — Central Post List slug directory (admin panel) (Complete)

### Goal
Post List blocks each own their posts outright (one block, its own posts,
cascade-deleted with it). There is currently no single place to see every
post's slug across the whole site — an admin has to open each page that has
a Post List block and read its editor. Add a read-only admin page that lists
every post's slug, grouped by the page and specific block instance that owns
it.

### Data layer
New function in `lib/content.ts`, e.g. `getPostListDirectory()`:

```ts
type PostListBlockGroup = {
  pageId: string;
  pageSlug: string;
  pageTitle: string;
  blockId: string;
  blockOrder: number;
  posts: { id: string; slug: string; title: string; tag: string; publishedAt: Date }[];
};
```

Implemented as one query — `prisma.block.findMany({ where: { type:
"postList" }, include: { page: true, posts: { orderBy: { publishedAt: "desc"
} } }, orderBy: [{ page: { slug: "asc" } }, { order: "asc" }] })` — then
mapped into the shape above. Include Post List blocks that currently own zero
posts (an empty block is still useful context, not noise to filter out).

### Page
New server component page, `/admin/post-slugs` — same shape as
`app/admin/pages/page.tsx` (`auth()`, redirect to `/login` if unauthenticated,
fetch, render). Purely a directory view; no client component or mutation
endpoint needed unless a client-side text filter turns out to be worth adding
once real data volume is in front of it — optional, not required for this
phase.

### Rendering
One section per page (page title + slug as the heading, linking to the page
itself). Within a page, if it has more than one Post List block, sub-group by
ordinal position ("Post List block 1 of 2", etc.); if it has exactly one,
skip the sub-heading and just list the posts flat. Each post row shows: slug
(monospace — it's the actual identifier being looked up), title, tag (reuse
`components/news/tag-pill.tsx`), publish date, and a link to `/news/{slug}`
(permalinks resolve by slug alone regardless of owning block — confirmed in
`app/news/[slug]/page.tsx` — so this link is always correct).

### Nav
Add a tile to `managementLinks` in `app/admin/page.tsx` ("Post slugs" →
`/admin/post-slugs`).

### Files
- `lib/content.ts`
- `app/admin/post-slugs/page.tsx` (new)
- `app/admin/page.tsx`

### Testing
- Create Post List blocks on two different pages (and, separately, two
  instances on the same page), add posts with distinct slugs to each —
  confirm the directory groups every post under the correct page and correct
  block instance.
- Confirm a Post List block with zero posts still appears (not silently
  dropped).
- Confirm every listed permalink actually resolves to the right post.

---

## Phase 3 — Hosted image library (admin panel): view all, delete unused (Complete)

### Goal
Every image ever uploaded through the Image block or Link Grid block lands in
`UploadedImage`, content-addressed on disk, with no central view and no way
to tell which ones are actually still displayed anywhere. Add an admin page
listing every uploaded image with a used/unused indicator, and a delete
action for the unused ones so storage doesn't grow unboundedly with orphaned
uploads.

### Usage detection
Image references aren't foreign keys except for `SiteSettings.faviconImageId`
/`embedImageId` — everywhere else (the `image` block's `src`, a Link Grid
link's `image`) an image is just a literal URL string
(`/api/uploads/images/<sha1>.<ext>`) sitting inside a `Block`'s JSON-as-string
`data` column. Rather than hardcoding which block types/fields to check
(fragile the moment a new block type also references an image), detect usage
by checking whether any `Block.data` string contains the image's own `sha1` —
that substring is always present whenever the image is actually referenced,
regardless of which block type or field embeds it, current or future. Combine
that with a direct check of `SiteSettings.faviconImageId`/`embedImageId`.

### Data layer
New function, e.g. `getImageLibrary()` in `lib/uploads.ts`:
1. `prisma.uploadedImage.findMany({ orderBy: { uploadedAt: "desc" } })`
2. `prisma.block.findMany({ select: { data: true } })` (just the raw data
   strings — no need to parse per-type)
3. `getSiteSettings()` (existing, from `lib/site-settings.ts`)
4. Per image: `used = blocksData.some(d => d.data.includes(image.sha1)) ||
   settings.faviconImageId === image.id || settings.embedImageId ===
   image.id`.

### Page
New `/admin/images` page — grid of thumbnails (`<img src={`/api/uploads/images/${sha1}.${ext}`}
/>`), each showing truncated sha1, mime, formatted size, upload date/uploader,
a Used/Unused badge, and a delete control (shown only for unused images).
`formatBytes` is currently duplicated in both `image-block.tsx` and
`link-grid-block.tsx` — this page would be a third copy, worth hoisting to a
shared helper at implementation time rather than copying it again.
Deleting is a real destructive action (unlike just viewing), so this needs a
small client component for the confirm-before-delete interaction — mirror the
`window.confirm` pattern already used in `components/admin/audit-log-admin.tsx`
and `components/admin/pages-admin.tsx`.

### Delete route
New `DELETE /api/uploads/images/[id]/route.ts`, mirroring
`app/api/resource-pack/[id]/route.ts` exactly: `requireAdmin()`, look up the
row, **re-derive usage server-side right before deleting** — never trust a
client-supplied "this is unused" claim, same reasoning this codebase already
applies to not trusting client-supplied ids elsewhere — reject with a
conflict if something now references it, otherwise unlink the file
(`imagePath(sha1, ext)`, tolerating `ENOENT`) and delete the row inside a
`$transaction` alongside `recordAuditLog`.

### Audit log integration
Add `"UploadedImage"` to `AUDIT_ENTITY_TYPES` in `lib/audit-log.ts`, plus an
`uploadedImageSnapshot()` and an undo handler mirroring `ResourcePack`'s
exactly: undoing a create deletes the row and file; undoing a delete checks
`fs.existsSync` on the original path and refuses if the file is really gone
(same honest limitation `ResourcePack` already accepts — deleting a file
isn't actually recoverable by recreating a DB row). No schema/migration
needed — `entityType` is already a plain string column, by design (see the
comment on `AuditLogEntry` in `prisma/schema.prisma`). Also add
`"UploadedImage"` to the deliberately-duplicated client-side `ENTITY_TYPES`
list in `components/admin/audit-log-admin.tsx`.

### Files
- `lib/uploads.ts`
- `app/api/uploads/images/[filename]/route.ts` — **deviation from the plan**:
  the DELETE handler landed here, not in a separate
  `app/api/uploads/images/[id]/route.ts`, because Next.js's router rejects
  two sibling directories with different dynamic-segment names
  (`[filename]` vs `[id]`) at the same path level — it crashes the entire
  app at startup, not just that route. Both the existing public `GET`
  (serves image bytes by filename) and the new admin `DELETE` (by image id)
  now live in the same file, sharing the `filename` segment name; `DELETE`
  destructures it as `const { filename: id } = await params;` with a comment
  explaining why. The URL shape `/api/uploads/images/{id}` for DELETE is
  unchanged from what's described above.
- `app/admin/images/page.tsx` (new)
- `components/admin/images-admin.tsx` (new, client — delete confirmation)
- `lib/audit-log.ts`
- `components/admin/audit-log-admin.tsx`
- `app/admin/page.tsx` (nav tile)
- `lib/format.ts` (new) — the `formatBytes` hoist mentioned above; also
  adopted by `components/blocks/image-block.tsx`,
  `components/blocks/link-grid-block.tsx`, and
  `components/resource/resource-pack-admin.tsx`, which each previously had
  their own copy.

### Testing
- Upload an image but don't reference it anywhere — confirm it shows
  "Unused" and is deletable.
- Reference that same image from an Image block, then from a Link Grid link
  — confirm it flips to "Used" and the delete control disappears/disables in
  both cases.
- Confirm an image set as the site favicon or embed image shows as "Used".
- Delete an unused image — confirm the file is actually gone from disk, the
  row is gone, and an audit log entry was recorded.
- Confirm attempting to undo that deletion correctly reports it can't
  restore the file (matches `ResourcePack`'s existing behavior).
- Try to delete an image that's in use directly against the API (bypassing
  the UI) — confirm the server rejects it rather than trusting the client.

---

## Phase 4 — Audit log: readable one-line summaries, detail view stays optional (Complete)

### Goal
Every row in the audit log today shows only entity type + raw action + actor
+ timestamp; the only way to see what actually happened is expanding
"Details" to read two raw JSON blobs side by side. Add a plain-English
one-line summary directly in the row (e.g. `Renamed page "Rules" to "Server
Rules"`, `Created post "Server wipe this weekend"`, `Deleted resource pack
"texturepack-v3.zip"`), computed from the same `before`/`after` snapshots
already stored — while leaving today's expandable raw-JSON view exactly as
it is for anyone who wants the full picture.

### Design
New client-safe module, e.g. `lib/audit-log-summary.ts`, exporting
`summarizeAuditEntry(entry): string`. Must not import the server-only
`lib/audit-log.ts` — same reason `components/admin/audit-log-admin.tsx`
already duplicates `AUDIT_ENTITY_TYPES` instead of importing it (that module
pulls in `node:fs` and server-only validation schemas that have no business
in a client bundle).

One small per-entity-type summarizer function, each following the same
shape:
- `create`: `Created {entity type} "{best display field}"`, reading the
  display field (title/name/label/slug/email, whichever is most human for
  that entity) from `after`.
- `delete`: same phrasing with "Deleted", reading the display field from
  `before`.
- `update`: diff `before`/`after` key by key. If exactly one or two
  meaningful fields changed, name them specifically (`Changed title from "X"
  to "Y"`). If many fields changed at once, or the diff can't be meaningfully
  summarized, fall back to a generic `Updated {entity type} "{display
  field}"` — that's what the existing Details toggle is for, this line isn't
  trying to replace it.
- Any parse failure or unexpected shape (malformed/legacy entry) falls back
  to today's plain `"{action} {entity type}"` text rather than throwing —
  this is a presentation layer over existing data and must never crash the
  admin page on an old or unusual entry.

### Component change
`components/admin/audit-log-admin.tsx` renders `summarizeAuditEntry(entry)`
as the primary line in each row; the raw entity type + entity id move to
smaller secondary text underneath. The action pill and the entire
expand/collapse "Details" mechanism are untouched.

### Files
- `lib/audit-log-summary.ts` (new)
- `components/admin/audit-log-admin.tsx`
- `lib/validation/pages.ts` / `components/blocks/registry.tsx` —
  **deviation from the plan**: live-browser testing caught `Block` summaries
  showing the raw internal type key (`Updated Block "linkGrid"`) instead of
  its human label (`"Link grid"`, already defined as `blockTypeLabels` in
  `registry.tsx` for the admin block picker). Fixed by moving
  `blockTypeLabels` into `lib/validation/pages.ts` (already a
  dependency-light, client-safe module shared with `registry.tsx`) and
  re-exporting it from `registry.tsx` for existing importers, so
  `lib/audit-log-summary.ts` can use it without pulling in every block
  component that `registry.tsx` otherwise imports.

### Testing
- Exercise create/update/delete for every entity type — including
  `UploadedImage` if Phase 3 has landed by the time this is implemented — and
  confirm each produces a sensible one-line summary.
- Confirm "Details" still expands to the exact same before/after JSON as
  today, unchanged.
- Confirm a deliberately malformed or unusually-shaped entry falls back to
  the generic summary instead of crashing the page.

---

## Sequencing note

All four phases are independent — build and land in any order. The only soft
link: Phase 3 adds `"UploadedImage"` to `AUDIT_ENTITY_TYPES`, and Phase 4's
summarizer should handle whatever entity types actually exist in that list at
the time it's implemented, rather than hardcoding today's seven and missing
an eighth. If Phase 4 lands first, its fallback path already covers an
unrecognized entity type gracefully — it doesn't need to anticipate Phase 3
in advance.
