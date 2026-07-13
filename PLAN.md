# PLAN.md — Pages/tags admin pass (protected-page roster, tag colors, Post Display block, audit log & Link Grid upgrades)

**Status: all ten phases complete and verified as of 2026-07-13** —
typecheck/lint clean, migrations reviewed against CLAUDE.md's mandatory
production-safety checklist (no dev-database-specific literals in either new
migration), and interactively exercised end-to-end via a temporary admin
account (created and fully deleted afterward, along with all scratch
pages/posts/tags/blocks used to test with). Nothing here carries over from
any prior version of this file — the previous pass (post slug directory,
image library, audit summaries, Link Grid image removal) is complete and
gone; do not look it up, do not renumber around it. Phase numbers below are
local to this file only.

**Hard rule, unchanged from every prior version of this file: this file's own
nomenclature (`Phase N`, `PLAN.md`, decision numbers, etc.) must never be
referenced in source code comments.** A comment has to stand on its own and
still make sense after this file is deleted or replaced by the next one.

Six phases. Two have a real dependency (Phase 6 needs Phase 5's `Tag` model);
everything else is independent and can land in any order — see the
sequencing note at the end.

Phases 7-10 (bug reports and cleanup, added 2026-07-13) are also complete —
see each phase for what the live-reproduced root causes actually turned out
to be, in a couple of cases different from what static reading alone had
suggested.

---

## Phase 7 — Bug: creating a page named "admin"/"login" shows "Request validation failed" instead of a clear message (Complete)

### Report
Creating a new page titled "admin" or "login" (or any other `RESERVED_SLUGS`
entry) surfaces a generic `Request validation failed` error. Expected: the
same `A page with slug "..." already exists.` popup a duplicate slug already
produces, since from an admin's perspective this is the same situation —
that slug is already taken by the existing protected Admin/Login page.

### Root cause (confirmed by reading the actual request path)
`createPage()` in `components/admin/pages-admin.tsx:126-141` slugifies the
typed title client-side and always sends the result as an explicit `slug` in
the `POST /api/pages` body (`slugify(title) || undefined`) — so typing
"Admin" sends `slug: "admin"`, not an omitted field.

`app/api/pages/route.ts`'s `POST` handler runs `pageCreateSchema.safeParse`
(`route.ts:47-48`) before it ever reaches the `prisma.page.findUnique`
duplicate-slug check (`route.ts:55-56`) that produces the friendlier
`conflict(...)` message. `pageCreateSchema`'s `refineNotReserved`
(`lib/validation/pages.ts:37-41`) rejects `"admin"`/`"login"` first, since
both are in `RESERVED_SLUGS` (`lib/validation/pages.ts:25`) — they're also
two of the four protected pages added in Phase 2, so they're always taken by
definition.

That rejection does carry a specific, correct message (`` `"${data.slug}" is
a reserved slug.` ``) — but it's only in the Zod issue's own `path`/`message`,
which `validationError()` (`lib/api-response.ts:53-60`) puts into the
response's `details` array, not its top-level `message` (always the generic
`"Request validation failed."`). `pages-admin.tsx`'s `parseError` helper
(`pages-admin.tsx:14-16`) only ever reads `body?.error?.message`, so the
specific per-field reason never reaches the UI — the admin sees the generic
string regardless of which field failed or why.

This is a real gap, but not a security issue and not silent data loss —
purely a confusing-error-message bug. Two independent fixable pieces:
1. `createPage()` sends an explicit reserved slug instead of letting the
   server generate one — `uniqueSlugFrom()` (`route.ts:17-26`) already knows
   how to dodge a reserved base slug (appends `-page`), but only runs when
   `parsed.data.slug` is `undefined`. The client-side slugify short-circuits
   that path unconditionally, for every title, not just reserved ones.
2. `parseError`/error surfacing more broadly only ever shows the generic
   top-level `message`, discarding `details` — so *any* field-level
   validation failure across every admin form (not just this one) shows the
   same generic string instead of the specific reason. Worth deciding at
   implementation time whether the fix is scoped to page creation only, or
   whether `parseError` should generally prefer the first `details[]` message
   when present — the latter is a bigger, cross-cutting change touching every
   caller of that helper, not just this one flow.

### Resolution
Decided and implemented: "admin"/"login"/etc. still get rejected (never
silently allowed), but when the rejected slug already belongs to a real
`Page` row, the response now reads exactly like a duplicate-slug conflict
instead of the generic validation error. Scope was kept narrow — only this
flow, not a global rewrite of every `parseError` call site.
- `app/api/pages/route.ts`'s `POST` handler and `app/api/pages/[id]/route.ts`'s
  `PUT` handler: when `pageCreateSchema`/`pageUpdateSchema` rejects on the
  reserved-slug issue, look up the raw (untrusted) `slug` from the request
  body via `prisma.page.findUnique`; if a page already owns it, return the
  same `conflict("A page with slug \"...\" already exists.")` the plain
  duplicate-slug check already produces. Falls through to the normal
  `validationError` for a reserved slug with no matching row (e.g. `"api"`)
  — that case still needs the schema's own message, since there's no
  existing page to point to.
- `components/admin/pages-admin.tsx`'s `parseError` gained an opt-in third
  parameter (`{ preferFieldDetail: true }`), used only by `createPage` and
  the slug-rename handler: when the server's error response carries exactly
  one field-level `details` entry, that specific message is shown instead of
  the generic top-level one. Every other call site in the file is untouched.

Type-checked clean (`tsc --noEmit`, exit 0). No PLAN.md-nomenclature leaked
into code comments; no dev-only artifacts created.

### Testing
- Create a page titled "Admin" — confirms the conflict message now reads
  `A page with slug "admin" already exists.` instead of the generic
  validation error.
- Creating a page titled anything else that collides with an existing custom
  page's slug still shows the same message, unaffected (shared code path).
- Typing a title that merely *contains* a reserved word but isn't a reserved
  slug itself (e.g. "Admin Guide" → slug `admin-guide`) still creates
  normally — no over-broad match (unchanged, was never affected).

---

## Phase 8 — Remove the "Editable pages" section from `/admin` (Complete)

### Goal
`app/admin/page.tsx`'s `editablePages` array (`admin/page.tsx:16-21`) hardcodes
quick links to Home/Rules/Features/News. This is now fully redundant:
`/admin/pages` (`components/admin/pages-admin.tsx`) already lists every
`Page` row — including these same 4 protected pages — each with its own
"Edit" link to `pagePath(page.slug)` (`pages-admin.tsx:241-244`), confirmed
by reading `GET /api/pages`'s `prisma.page.findMany()` (no filter excluding
protected rows). There's no page reachable via "Editable pages" that isn't
equally reachable via "Site management" → Pages.

### Change
- `app/admin/page.tsx` — delete the `editablePages` array and its whole
  rendered section (`admin/page.tsx:60-74`, the `<h2>Editable pages</h2>`
  block and its grid).
- Leave the "Editing happens on the site itself." callout banner
  (`admin/page.tsx:52-58`) as-is — still accurate and useful guidance, not
  specific to the removed quick-link grid.
- "Site management" section (Pages, Navigation, etc.) is unaffected and
  needs no changes — it already contains the `/admin/pages` link this
  section's functionality collapses into.

### Files
- `app/admin/page.tsx`

### Testing
- Visit `/admin` — confirm "Editable pages" is gone, "Site management" still
  renders normally with all its existing tiles.
- Confirm Home/Rules/Features/News are still each reachable and editable via
  `/admin/pages` → Edit, same as before this change.

Implemented: `editablePages` array and its rendered section deleted from
`app/admin/page.tsx` (105 lines → 82). Callout banner and "Site management"
grid (including the OWNER-only Users tile) left untouched. Type-checked
clean (`tsc --noEmit`, exit 0), no unused imports left behind.

---

## Phase 9 — Bug: Rule List edits show no visual feedback until reload; combine Steps into Rule List (Complete)

### Root cause — actually two independent bugs, both confirmed via live reproduction
Reproduced first with a scripted browser session (Playwright) against a
temp admin account: add a Rule List section, rename it, watch it vanish the
instant Edit mode is toggled off, stay gone toggling back on, then reappear
correctly on a full reload — confirming the save really did persist and this
was a pure client-rendering bug, not a lost write.

1. **`components/blocks/block-shell.tsx`** switched its *root element type*
   between `<div>` (chrome shown) and a bare `<>Fragment</>` (chrome hidden)
   depending on Edit mode. React unmounts and remounts an entire subtree
   whenever a component's returned root element type changes between
   renders — so toggling Edit mode was silently destroying and recreating
   every block editor underneath it, including whatever local state it held.
   Fixed by always returning the same `<div>` (using `className="contents"`
   to keep the zero-layout-footprint behavior the old Fragment had when
   chrome isn't shown).
2. Fixing that alone didn't fully resolve it — a second, independent bug in
   **`components/rules/rules-editor.tsx`**: `saveSectionField`/
   `saveRuleField` PUT the edit to the server but never called `setSections`
   afterward, so the parent's own `sections` array stayed stale. `EditableText`
   masked this by showing the new value via its *own* local optimistic
   state — which works fine until the component switches to the visitor
   branch (e.g. an Edit-mode toggle), which reads `section[field]` straight
   off the stale parent array, bypassing `EditableText` entirely. Fixed by
   syncing `sections` (and `features`, same bug in
   `components/features/features-editor.tsx`'s `saveField`) after every
   successful field save, matching the pattern `setIcon`/`toggleAccent`
   already used in the same files.

Both fixes verified together via a second live reproduction pass: edited
text now survives a toggle-off/toggle-on cycle and a reload, for both Rule
List and Feature Grid.

### Steps → Rule List merge — implemented
Steps retired as a distinct `BlockType` (`lib/validation/pages.ts`:
`BLOCK_TYPES`, `blockTypeLabels`, `blockDataSchemas`, the
`blockCreateSchema` discriminated union, and its own `stepsDataSchema` all
removed; `components/blocks/steps-block.tsx` deleted; its registry/
`defaultBlockData`/`ADDABLE_BLOCK_TYPES` entries in
`components/blocks/registry.tsx` removed — the last of those is just
`BLOCK_TYPES` itself, so removing Steps there was the only edit needed to
also drop it from the "Add block" picker). `components/admin/audit-preview-modal.tsx`'s
`PREVIEWABLE_BLOCK_TYPES` list updated to match.

Data migration `prisma/migrations/20260713210107_merge_steps_into_rule_list`:
converts every existing `steps` Block into a `ruleList` Block, backfilling
one `RuleSection` (titled from the block's own `heading`, falling back to
"Getting started") plus one `Rule` per step item, in original order (the
`number` field is dropped — Rule List always derives its displayed
numbering from position). No schema change was needed (`Block.type` is a
plain `TEXT` column, not an enum). The one steps block this project's own
`prisma/seed.ts` has ever created (Home's "Getting started") gets the exact
stable ids (`home-getting-started`, `home-getting-started--0/1/2`) the
updated seed script now upserts by, keyed on `Page.slug = 'home'` — this
was caught and fixed *before* shipping: an earlier draft of this migration
used a random id for every migrated section, which would have silently
duplicated Home's "Getting started" content the next time `npm run db:seed`
ran, since its upsert would never match a randomly-generated id. Verified by
re-running the seed script against the migrated dev database afterward:
exactly one section, no duplicate. Any *other* steps block (hypothetically
added elsewhere) still gets a random id — seed.ts has no stable id reserved
for those. `prisma/seed.ts` updated: `HOME_STEPS` replaced with
`HOME_GETTING_STARTED_SECTION` (a `RuleSection`-shaped constant),
`seedRuleSections` generalized to accept a sections array + blockId instead
of a single hardcoded module-level array, and `getCanonicalBlockIds` extended
to also resolve Home's `ruleList` block id.

No visual-layout variant was added for Rule List to mirror Steps' old
3-column grid — Rule List's existing list layout is what former Steps
content (i.e. Home's "Getting started") now renders as; confirmed
acceptable by inspection, not flagged as a regression.

### Testing
- Live-reproduced the original bug (see above), confirmed both fixes
  resolve it for Rule List, verified end to end with a scripted toggle-off/
  toggle-on/reload sequence.
- Ran the migration against this dev database's real "steps" block (Home's
  "Getting started") — confirmed all 3 items migrated with exact original
  content, correct order, and the section title preserved.
- Re-ran `npm run db:seed` post-migration — confirmed exactly one
  "Getting started" section on Home, no duplication.
- Confirmed "Steps" no longer appears in the "Add block" picker.
- `tsc --noEmit`, `npm run lint`, and `npm run build` all clean.
- All test admin accounts, scratch pages, and accidentally-touched real
  content (see Phase 10 below) were restored/deleted before finishing.

---

## Phase 10 — Bug: Feature Grid has the same no-visual-feedback issue; combine Card Grid into Feature Grid, make eyebrow optional (Complete)

### No-visual-feedback bug
Same two-bug root cause as Phase 9 (`BlockShell`'s Fragment/div remount,
plus `FeaturesEditor`'s `saveField` not syncing its own `features` state) —
both fixed as part of Phase 9's work, since `block-shell.tsx` is shared by
every block type. Re-verified independently for Feature Grid specifically
via its own scripted browser reproduction: edited heading/field text now
survives a toggle-off/toggle-on cycle.

### Card Grid → Feature Grid merge — implemented
Feature Grid's existing DB-row ownership (`Feature.blockId`, with its own
audit/undo coverage) was kept as the surviving persistence model, per the
direction flagged before implementation — Card Grid's `heading`/`tone` pair
was the smaller gap to backport. `cardGridDataSchema` removed;
`featureGridDataSchema` (`lib/validation/pages.ts`) changed from an empty
object to `{ heading: z.string().max(80).nullable().optional(), tone:
toneSchema.nullable().optional() }` — `.nullable()` (not just `.optional()`)
because the data migration below writes explicit JSON `null`s for absent
values, which raw SQL has no way to omit as a missing key. `"cardGrid"`
removed from `BLOCK_TYPES`/`blockTypeLabels`/`blockCreateSchema`;
`components/blocks/card-grid-block.tsx` deleted;
`components/admin/audit-preview-modal.tsx`'s `PREVIEWABLE_BLOCK_TYPES`
updated to match (both entries were already excluded from Rule List's list
above for the same row-owning reason, now true here too).

`components/blocks/registry.tsx`'s `featureGrid` entry now forwards
`data`/`onSaveData` (previously not needed, since `FeatureGridData` was
empty) — same shape `postList` already uses for its own `limit` field.
`components/features/features-editor.tsx`: `FeaturesEditor` gained
`data`/`onSaveData` props, reads `heading`/`tone` directly off `data` (no
extra local state duplicating it, avoiding the exact class of stale-state
bug just fixed above), and renders a heading (`EditableText`, `allowEmpty`)
+ `ToneSelect` header above the grid in both branches, matching Card Grid's
original layout. `components/features/feature-card.tsx` gained a
`featureCardToneClass(tone)` helper and a `tone` prop — `tone === "neutral"`
(every pre-existing Feature Grid instance, since the field didn't exist
before this change) keeps this component's *own* original pre-tone classes
exactly (`border-border bg-surface`), not the shared `TONE_STYLES.neutral`
entry (which was designed to match a different block's, callout's, original
look) — only a non-neutral tone switches to the shared `TONE_STYLES`
classes, so no page silently changes appearance until an admin opts in.
`accent` (per-card icon-chip color) is untouched and independent of `tone`
(whole-grid theming) — no conflict between the two.

Data migration `prisma/migrations/20260713210159_merge_card_grid_into_feature_grid`:
converts every existing `cardGrid` Block into a `featureGrid` Block,
backfilling one `Feature` row per card (`eyebrow: ''`, `icon` falling back
to `'help'`, `accent: false` — Card Grid had none of these per-card) and
carrying the block's own `heading`/`tone` across via `json_object(...)`. No
stable-id concern here (unlike Phase 9's Steps migration) since
`prisma/seed.ts` has never seeded a `cardGrid` block or referenced its rows
by a fixed id — every migrated `Feature` gets a fresh random id, same as an
admin adding one through the UI. (This dev database had zero existing
`cardGrid` blocks, so the migration is a verified no-op here — its SQL was
still written and reviewed for the general case, per CLAUDE.md's migration
bar, and confirmed to run cleanly against an empty match set.)

### Eyebrow optional — implemented
- `lib/validation/content.ts` — `eyebrow: z.string().min(1)` → `z.string()`
  (both create and update schemas, the latter derived from the former).
- `components/features/features-editor.tsx` — the `eyebrow` `EditableText`
  gained `allowEmpty` (both admin-mode instances).
- `components/features/feature-card.tsx` — the eyebrow `<span>` now gated
  on non-empty (`{eyebrow && (...)}`), so a cleared eyebrow leaves no empty
  tag in the visitor-facing markup.

### Testing
- Live-reproduced and fixed the no-visual-feedback bug for Feature Grid
  specifically (see above) — same fix as Phase 9, since it's the same
  shared component.
- Verified heading/tone editing on an isolated scratch page: set a heading
  and switched tone to "accent," confirmed both survive a toggle-off/
  toggle-on cycle, screenshotted the result, then deleted the scratch page
  (cascades its Block + any Feature rows).
- Cleared a feature's eyebrow — confirmed it saves without a "can't be
  empty" toast.
- Confirmed "Card Grid" no longer appears in the "Add block" picker.
- `tsc --noEmit`, `npm run lint`, and `npm run build` all clean.
- **Caught and corrected a test-script bug before finishing**: an earlier
  verification pass used an ambiguous `page.locator("select").first()`,
  which actually hit the Features page's *own, pre-existing* PageHeader
  block's tone selector instead of the new Feature Grid one, and separately
  cleared the real "Tunneller" feature's eyebrow and set a scratch heading
  on the real Feature Grid block — all three were real content, not test
  data. Caught by inspecting the DB directly afterward (`updatedBy` on the
  changed rows showed the temp test account), and fully reverted to original
  values before the temp admin account, its audit-log rows, and every
  scratch script/screenshot were deleted.

---

## Phase 1 — Pages admin: drop `adminOnly`, default new pages to Draft, grey out the dead toggle on protected pages (Complete)

### Goal
Three related cleanups to `/admin/pages`, all confirmed by reading the actual
gating logic rather than assumed:

1. The "Public/Admin+ only" toggle (`Page.adminOnly`) is redundant —
   `app/[slug]/page.tsx`'s `gateBanner` logic already hides a page from the
   public and shows it to admins only whenever `published` is `false`. An
   unpublished (Draft) page and an `adminOnly` page are visually
   indistinguishable to a visitor: both 404 for them and both render with the
   same "only visible to admins" banner for a signed-in admin. `adminOnly`
   buys nothing `published` doesn't already do — remove it.
2. New pages should default to Draft, not Published.
3. The Published/Draft toggle itself does nothing on a **protected** page
   (Home/Rules/Features/News, and — once Phase 2 lands — Resource/Login/
   Account/Admin): those pages each render through their own static route
   file (e.g. `app/rules/page.tsx`), which calls `getPageBySlug` and renders
   unconditionally. It never checks `page.published`. Confirmed by reading
   every protected route file — none of them gate on it. Toggling it today
   silently does nothing, which is worse than not having the control. Grey it
   out (disabled, not hidden — an admin should be able to see the field
   exists and understand why it's inert, not wonder where it went) on
   protected rows specifically.

Note what this phase deliberately does *not* do: it does not make
`published` start actually gating protected pages. That would be a real
behavior change to how the 4 (soon 8) static routes render, and nobody asked
for that — only for the admin panel to stop offering a control that lies
about having an effect.

### `adminOnly` removal
This is a full removal, not a hide-in-UI — matching this project's "don't
leave backwards-compat shims for something confirmed unused" convention.
Touches:
- `prisma/schema.prisma` — drop `Page.adminOnly`; new migration.
- `app/[slug]/page.tsx` — `gateBanner` collapses to just the `!page.published`
  branch; drop the `adminOnly` branch entirely (its copy — "Admin+ only — not
  visible to the public" — goes with it).
- `lib/validation/pages.ts` — drop `adminOnly` from `pageCreateSchema` and
  `pageUpdateSchema`.
- `lib/audit-log.ts` — drop `adminOnly` from `pageSnapshot()` and both
  `undoHandlers.Page` field lists (update-restore and delete-recreate).
- `app/api/pages/route.ts` — drop the `adminOnly: parsed.data.adminOnly ??
  false` line from the create payload.
- `components/admin/pages-admin.tsx` — delete `toggleAdminOnly` and the
  "Admin+ only / Public" `<button>` in the Status cell entirely (not just its
  handler).

### Default-to-Draft
- `prisma/schema.prisma` — `Page.published` default flips from `true` to
  `false` (migration; existing rows are unaffected, a column default only
  applies to future inserts that omit the field).
- `app/api/pages/route.ts` — `published: parsed.data.published ?? true` →
  `?? false`. This is the line that actually governs today's behavior (the
  schema-level default is never exercised by this route since it always
  passes the field explicitly) — both need to change for the app's real
  behavior and the schema's declared default to agree.
- `prisma/seed.ts` — confirm the 4 (soon 8) protected-page upserts pass
  `published: true` explicitly (they should already, since they need to be
  visible by default) — this change must not silently unpublish them.

### Greying out Draft/Published on protected pages
- `components/admin/pages-admin.tsx` — the Published/Draft `<button>` in the
  Status cell gets `disabled={page.protected}` plus a `title` explaining why
  (e.g. "Protected pages always render regardless of this setting") and the
  usual disabled visual treatment (reduced opacity, `cursor-not-allowed`,
  matching every other disabled control in this file).

### Files
- `prisma/schema.prisma`, new migration
- `app/[slug]/page.tsx`
- `lib/validation/pages.ts`
- `lib/audit-log.ts`
- `app/api/pages/route.ts`
- `prisma/seed.ts`
- `components/admin/pages-admin.tsx`

### Testing
- Create a new page — confirm it lands as Draft, not Published.
- Confirm a Draft custom page 404s for a logged-out visitor and shows the
  "Unpublished draft" banner for a signed-in admin — unchanged behavior.
- Confirm the Public/Admin+ toggle is gone from every row, and that no
  existing page silently lost visibility because of the `adminOnly` removal
  (a page that was `adminOnly: true, published: true` is now just
  `published: true` — slightly *more* visible than before, never less; this
  direction of change is safe).
- On a protected page's row, confirm the Draft/Published button is visibly
  disabled and clicking it does nothing.
- On a non-protected page's row, confirm the button still works exactly as
  today.

---

## Phase 2 — Protected-page roster: add Resource/Login/Account/Admin, and make every protected page's browser-tab title actually editable (Complete)

### Goal
Home/Rules/Features/News are the only routes with a `Page` row today —
that's what makes their `title` field editable from `/admin/pages`. But
editing that title only changes the *row*; the actual `<title>` element each
route renders is a hardcoded string in the route file itself
(`export const metadata = { title: "Rules — JASS" }` in `app/rules/page.tsx`,
etc.), completely disconnected from `page.title`. Renaming "Rules" to "Server
Rules" in the admin panel has zero effect on the browser tab. Four more
routes — `app/resource/page.tsx`, `app/login/page.tsx`,
`app/account/page.tsx`, `app/admin/page.tsx` — don't even have a `Page` row,
so they're not editable *or* listed in `/admin/pages` at all, and their tab
titles are inconsistently formatted (`"Admin Login"`, `"Account"`,
`"Resource Pack — JASS"`, `"Admin"` — no shared convention).

Fix both at once: give all 4 of those routes a protected `Page` row (title
only — see "Not full page-builder pages" below), and make every protected
route's `<title>` read from its row's `title` field through one shared
formatter, so editing a title in `/admin/pages` is what actually changes the
tab.

### Not full page-builder pages
Resource/Login/Account/Admin are hand-built layouts (auth forms, a dashboard
grid, a resource-pack download view), not `PageRenderer`+`Block` content —
confirmed by reading all 4 route files. Their new `Page` rows exist **only**
to hold an editable `title` (and, incidentally, to get delete-protection and
a listing in `/admin/pages` "for free" via `protected: true` — see below).
They will have zero `Block` rows, and their route files keep rendering their
own hardcoded JSX exactly as today — only the `<title>` metadata becomes
DB-driven. Known limitation, not fixed here: the Theme dropdown in
`/admin/pages` will still show for these 4 rows and silently do nothing,
since their route files hardcode `theme={null}` into `SiteChrome` rather
than calling `resolvePageTheme`. Same shape of problem Phase 1 fixes for
Published/Draft, left as-is here since nobody asked for theme support on
these 4 routes and adding it is a materially bigger change (would mean
actually building these as themeable pages).

### Deletion protection
No new code needed — `DELETE /api/pages/[id]` already rejects
`existing.protected` server-side (`app/api/pages/[id]/route.ts:83`), and
`pages-admin.tsx` already hides the delete button for `page.protected` rows.
Marking these 4 rows `protected: true` is sufficient on its own.

### Uniform title format
New helper, e.g. `formatPageTitle(title: string)` in `lib/site-config.ts`:
`` `${title} — ${siteConfig.name}` `` — i.e. `"Rules — JASS"`,
`"Resource Pack — JASS"` becomes `"Resource — JASS"` unless the admin
retitles it, `"Admin Login"` becomes `"Login — JASS"`, etc. Applied via each
route's `generateMetadata` (converting the 3 that are currently plain
`export const metadata` objects — `app/resource/page.tsx`,
`app/login/page.tsx`, `app/account/page.tsx` — plus `app/admin/page.tsx`,
which has none today) fetching `getPageBySlug(slug)` and formatting its
`title`. `app/rules/page.tsx`, `app/features/page.tsx`, `app/news/page.tsx`
already fetch their page row in the default export — reuse that fetch for
`generateMetadata` too rather than querying twice, same pattern
`app/page.tsx` (Home) already uses for its own `generateMetadata`.

**Home is deliberately excluded.** Its title is already fully dynamic and
editable — driven by the `hero.name` content block (`heroName —
Minecraft Server`, or `SiteSettings.embedTitle` when set), with its own
carefully-documented fallback precedence (see the long comment on
`app/page.tsx`'s `generateMetadata`). Folding it into the flat "`{title} —
JASS`" scheme would mean *removing* editability (hero name is
already-admin-editable content, page.title is not what visitors' browser tab
shows there today) for no benefit — leave it alone.

### Files
- `prisma/schema.prisma` — no column changes, just new migration seeding 4
  rows (or handle via `prisma/seed.ts` upsert instead of a data migration —
  implementation's call; seed.ts is already the established place for
  protected-row bootstrapping and is safe to re-run).
- `lib/validation/pages.ts` — add `"account"` to `RESERVED_SLUGS` (`"admin"`,
  `"login"`, `"resource"` are already there; `"account"` was missed when that
  route was originally built).
- `lib/site-config.ts` — `formatPageTitle`
- `app/resource/page.tsx`, `app/login/page.tsx`, `app/account/page.tsx`,
  `app/admin/page.tsx` — add/convert `generateMetadata`
- `app/rules/page.tsx`, `app/features/page.tsx`, `app/news/page.tsx` — swap
  static `metadata` for `generateMetadata` reading `page.title`
- `prisma/seed.ts` — 4 new protected-row upserts

### Testing
- Confirm all 8 protected pages (Home excluded, see above) now appear with
  a consistent "`{Title} — JASS`" browser tab title.
- In `/admin/pages`, rename "Rules" to "Server Rules" — confirm the browser
  tab on `/rules` updates to "Server Rules — JASS" (this is the core bug
  being fixed; today it silently doesn't).
- Confirm Resource/Login/Account/Admin now appear as rows in `/admin/pages`,
  each `protected` (no delete button, slug not editable), and that renaming
  their title updates their tab.
- Confirm none of the 4 new routes' actual rendered content changed — only
  the `<title>`.
- Attempt to create a new custom page with slug "account" — confirm it's
  rejected as reserved (previously it wasn't, though it would have been
  functionally unreachable anyway since `app/account/page.tsx` is a more
  specific static route than the `[slug]` catch-all).

---

## Phase 3 — Audit log: which page changed, a live preview of the change, actor filter, real pagination (Complete)

### Goal
Four related readability/navigation gaps in `/admin/audit-log`, confirmed
against the current implementation (`app/api/audit-log/route.ts`,
`components/admin/audit-log-admin.tsx`):

1. A row tells you *what kind* of thing changed (`Block`, `Page`, ...) but
   not *which page it lived on* — for `Block` entries (the majority of real
   edits) an admin has to open "Details" and read `pageId` out of raw JSON.
2. No way to see what the change actually looked like rendered, only the
   raw before/after JSON.
3. No way to filter by who made a change, only by entity type.
4. Pagination is cursor-based "Load more" (25 at a time, appending) — no way
   to jump to a specific page of history, and the button just grows an
   ever-longer in-memory list.

### Which page was edited
`blockSnapshot()` already captures `pageId` (`lib/audit-log.ts:117-125`), and
`pageSnapshot()`/`navItemSnapshot()` capture `id`/`pageId` respectively — so
every entity type that's meaningfully "on a page" already has the page id
sitting in its `before`/`after` JSON; it's just never surfaced. Add a small
server-only helper in `lib/audit-log.ts`, e.g. `extractPageId(entry):
string | null`, switching on `entry.entityType` and reading `pageId` (Block,
NavItem) or `id` (Page) off whichever of `before`/`after` is non-null. Other
entity types (`CustomTheme`, `User`, `ResourcePack`, `SiteSettings`,
`UploadedImage`, and — once Phase 5 lands — `Tag`) return `null`.

In `GET /api/audit-log`, after fetching the page of rows, collect the
distinct non-null page ids via `extractPageId`, batch-fetch
`prisma.page.findMany({ where: { id: { in: [...] } }, select: { id: true,
slug: true, title: true } })`, and attach `pageSlug`/`pageTitle` (or both
`null` if the page id no longer resolves — deleted since) to each row in the
response. `components/admin/audit-log-admin.tsx` renders this as a small
secondary line/badge under the summary — page title as a link to
`pagePath(slug)` when resolvable, "—" otherwise (a NavItem whose `pageId` is
null because it's an href-only link, for instance).

### Live preview
Scoped to what's actually renderable from a stored snapshot alone — not
every entity type has enough in `before`/`after` to reconstruct a real
preview:
- **`Block` entries**, for the block types whose renderer needs nothing but
  its own `data` (no server-fetched reference data) —
  `pageHeader`/`callout`/`steps`/`linkGrid`/`richText`/`image`/`ctaBanner`/
  `cardGrid`/`code`/`accordion`/`table`/`toc`. Excluded: `hero` (needs
  site-wide hero content the snapshot doesn't carry), `ruleList`/
  `featureGrid`/`postList`/`postDisplay` (each renders rows it owns via
  `blockId`, not its own `data` — the snapshot has no row data to show).
  For an excluded type, no Preview button — Details (raw JSON) stays the
  only view, same as today.
- **`Page` entries**: no visual block content lives on a `Page` row itself,
  so "preview" here is simplest as a direct "View page" link to the live
  `pagePath(slug)`, not a rendered diff.
- Everything else: no Preview control, same as today.

New component, e.g. `components/admin/audit-preview-modal.tsx`: given
`{ type, data }` (from `before` and/or `after`, with a toggle between them
when both exist — an update has both, a create only has `after`, a delete
only has `before`), renders `blockComponents[type]` (from
`components/blocks/registry.tsx`) inside a forced-read-only
`EditModeProvider isAdmin={false}` wrapper — this is the key mechanism that
makes this safe and simple: every block component reads `useEditMode()` and
branches on `editMode`/`isAdmin`, and `EditModeProvider` guarantees
`editMode: false` whenever `isAdmin: false` is passed in
(`components/admin/edit-mode-context.tsx:32`), so wrapping in a fresh
provider forces every block into its plain visitor-facing render — no
special-casing needed inside any individual block component. Pass a
no-op `onSaveData` (unreachable anyway once `editMode` is forced false).

### Actor filter
New `actorEmail` query param on `GET /api/audit-log`, parallel to the
existing `entityType` param. Client-side: a text input backed by a
`<datalist>` of distinct actor emails (same UI convention already used for
post tags — `existingTags` in `components/news/posts-editor.tsx`), populated
from a new small endpoint, e.g. `GET /api/audit-log/actors` (`requireAdmin`,
`prisma.auditLogEntry.findMany({ distinct: ["actorEmail"], where: {
actorEmail: { not: null } } })`). No new exposure concern: `actorEmail`
already appears unfiltered in every row of the main list for any admin
viewer (only `User`-entity-type *rows* are owner-gated, not the actor-email
column itself), so a distinct-actors list is gated the same way (`requireAdmin`,
not `requireOwner`).

### Real pagination (100/page)
Replace cursor pagination with page-number pagination. `GET
/api/audit-log`: accept a `page` param (1-indexed, default 1), fixed
`PAGE_SIZE = 100`, use `skip`/`take` instead of `cursor`/`skip: 1`, and run a
`prisma.auditLogEntry.count()` alongside the `findMany` (same `where`) to
return `{ data, page, totalPages }` instead of `{ data, nextCursor }`. This
is a breaking response-shape change, but the only consumer is
`audit-log-admin.tsx` in this same codebase, updated in lockstep.
Client: drop `nextCursor`/`loadMore`/`loadingMore` state, add `page`/
`totalPages`; render "Page {page} of {totalPages}" with Previous/Next
buttons (disabled at the bounds) below the table instead of "Load more" —
simplest option that satisfies "flip through by pages" without building a
full numbered-page-link control for a history that could run into the
thousands of rows.

### Files
- `lib/audit-log.ts` — `extractPageId`
- `app/api/audit-log/route.ts` — page-id batch resolution, `actorEmail`
  filter, page-number pagination
- `app/api/audit-log/actors/route.ts` (new)
- `components/admin/audit-log-admin.tsx` — page column, actor filter input,
  Previous/Next pager, "Preview" button wiring
- `components/admin/audit-preview-modal.tsx` (new)

### Testing
- Edit a Link Grid block on the Rules page — confirm its audit row shows
  "Rules" (linked) as the page, not just "Block".
- Click Preview on that same entry — confirm it renders the actual block
  visually (before vs. after, if both are toggleable), read-only, with no
  edit affordances and no way to accidentally save.
- Confirm a `hero`/`ruleList`/`featureGrid`/`postList` block edit has no
  Preview button (Details still works).
- Filter by a specific actor's email — confirm only their entries show, and
  that clearing the filter restores the full list.
- Confirm the pager shows the correct total page count, Previous/Next
  disable correctly at the first/last page, and jumping between pages
  doesn't lose the current entity-type/actor filters.
- Confirm exactly 100 entries render per page (not 25).

---

## Phase 4 — Link Grid block: image resize and click-and-drag position (Complete)

### Goal
Two independent additions to Link Grid images, both scoped from the ask:
1. **Resize** — same mechanism the Image block already has (`sizeMode`:
   `scale` or `custom` width/height), applied per-link instead of being
   locked to today's fixed `h-16 w-16` thumbnail box.
2. **Position** — a click-and-drag control to choose which part of the
   image shows inside its (now possibly resized) box, since `object-cover`
   can crop out the part of the photo that actually matters. This is new
   interaction code with no precedent elsewhere in this codebase (every
   other numeric control here commits on blur, not drag) — treat it as the
   one part of this phase carrying real implementation risk, and budget
   extra live-browser testing for it specifically.

### Resize
`ImageBlock`'s `sizeMode`/`scale`/`width`/`height` fields and its
`buildImageStyle()` function (`components/blocks/image-block.tsx:57-72`) are
the exact mechanism to reuse, not reinvent. Hoist `buildImageStyle` (and the
`SCALE_MIN`/`SCALE_MAX`/`DIMENSION_MIN`/`DIMENSION_MAX` constants it uses)
out of `image-block.tsx` into a small shared module, e.g. `lib/image-size.ts`
— same "hoist on second use" call this codebase already made for
`formatBytes` (`lib/format.ts`, prior phase). `image-block.tsx` switches to
importing it instead of defining it locally.

Schema: extend each link entry in `linkGridDataSchema` (currently `{ href,
title, description, image }`, `lib/validation/pages.ts:184-203`) with
`imageSizeSchema.shape` — the exact same `.extend(imageSizeSchema.shape)`
`imageDataSchema` already does one line below it. `QuickLink` in
`components/blocks/link-grid-block.tsx` gains the matching TS fields.

UI: when `link.image` is set, show the same Size/Scale/Width/Height controls
`ImageBlock` renders (`components/blocks/image-block.tsx:267-330`) inside
each link's edit row, saving via the existing `persist()`/`updateField`
pattern this file already uses. Both the admin-mode and visitor-mode `<img>`
(today hardcoded `h-16 w-16 rounded object-cover` in both the edit-mode row
and the public grid, `link-grid-block.tsx:120,246`) apply
`buildImageStyle(link)` as inline `style`, same as `ImageBlock` does —
absent `sizeMode` keeps today's exact fixed 64×64 box (no behavior change
for links nobody resizes).

### Position (click and drag)
New field per link, `objectPosition: { x: number; y: number } | null`
(percentages, 0–100; `null` = today's implicit center, i.e. no visible
change for existing links). Validated in `linkGridDataSchema` as an object
with two `z.number().int().min(0).max(100)` fields, nullable/optional.

UI, admin edit mode only, shown alongside the resize controls whenever
`link.image` is set: the thumbnail renders inside a `relative` container
with a small crosshair/marker positioned at `{x}% {y}%`. `onPointerDown`
captures the pointer (`setPointerCapture`) and starts tracking
`onPointerMove`; each move recomputes `x`/`y` from the cursor position
relative to the container's `getBoundingClientRect()`, clamped to [0, 100],
updating local state immediately (so the marker and the live `<img>`'s
`object-position` track the drag in real time) without persisting on every
move. `onPointerUp` releases capture and calls `persist()` once, committing
the final value — same "don't save on every intermediate tick" principle
already used for numeric drafts elsewhere (`commitScaleDraft` et al.,
blur-triggered instead of drag-triggered here). Both admin-mode and
visitor-mode `<img>` render `style={{ ...buildImageStyle(link), objectPosition:
link.objectPosition ? \`${link.objectPosition.x}% ${link.objectPosition.y}%\`
: undefined }}`.

### Files
- `lib/image-size.ts` (new — hoisted from `image-block.tsx`)
- `components/blocks/image-block.tsx` (switch to the hoisted helper)
- `components/blocks/link-grid-block.tsx`
- `lib/validation/pages.ts` (`linkGridDataSchema`)

### Testing
- Set a link image to `scale` mode at 50% — confirm it renders at half the
  figure width in both edit mode and the public grid, and persists across
  reload.
- Set `custom` width/height on a link image — confirm both apply and one
  alone preserves aspect ratio (mirrors `ImageBlock`'s existing behavior).
- Drag the position marker to a corner — confirm the visible crop shifts
  live during the drag (not just after release), the image doesn't jump on
  release, and reloading the page shows the same crop.
- Confirm a link with `sizeMode`/`objectPosition` unset still renders
  exactly like today (fixed 64×64, centered `object-cover`) — no regression
  for every pre-existing link.
- Keyboard/focus check on the drag control (per this project's usual
  accessibility bar) — at minimum it shouldn't trap focus or be entirely
  unreachable without a mouse; decide at implementation time whether arrow-key
  nudging is worth adding here or is out of scope for this pass.

---

## Phase 5 — Multiple tags per post, with admin-controlled tag color (Complete)

### Goal
`Post.tag` is a single free-text string today (`prisma/schema.prisma:165`,
`tag: String`) — a post can only ever have one tag, and every tag renders in
the same fixed accent color (`components/news/tag-pill.tsx`). Two changes:
posts can carry more than one tag, and each tag's color becomes admin-
controlled instead of hardcoded.

This requires turning "tag" from a bare string into a real row (`Tag`), since
color needs somewhere to live that's shared across every post using that tag
name — a color set on "Announcement" has to apply everywhere "Announcement"
appears, not per-post. This is the one schema change in this pass that also
needs a **data migration**, not just an additive column.

### Schema
```prisma
model Tag {
  id    String @id @default(cuid())
  name  String @unique
  color String // "#rrggbb", validated in lib/validation/content.ts
  posts Post[]
}
```
`Post.tag: String` is replaced with `Post.tags: Tag[]` (implicit many-to-
many — SQLite/Prisma generates the join table automatically, same pattern
already used for `Page.customTheme`-adjacent relations elsewhere in this
schema, just many-to-many instead of many-to-one).

### Migration (data-preserving, not just additive)
Run `prisma migrate dev --create-only` to get the scaffold, then hand-edit
the generated SQL to backfill before dropping the old column — the same
"don't lose existing content" bar this project already holds itself to for
schema changes. In order:
1. `CREATE TABLE "Tag" (...)`
2. `CREATE TABLE "_PostToTag" (...)` (Prisma's implicit-relation join table —
   let `prisma migrate dev` generate its exact name/shape, don't hand-name
   it)
3. Backfill one `Tag` row per distinct existing `Post.tag` value:
   `INSERT INTO "Tag" (id, name, color) SELECT lower(hex(randomblob(16))),
   tag, '<default hex>' FROM (SELECT DISTINCT tag FROM "Post")` — pick
   `<default hex>` at implementation time to closely match today's fixed
   accent-tinted pill (see `lib/themes.ts`'s default theme's `accent` token)
   so existing tags don't visually jump the moment this ships.
4. Populate the join table from the now-1:1 name match:
   `INSERT INTO "_PostToTag" (...) SELECT Post.id, Tag.id FROM Post JOIN Tag
   ON Tag.name = Post.tag`
5. `ALTER TABLE "Post" DROP COLUMN "tag"` (SQLite has supported `DROP
   COLUMN` since 3.35, which this project's SQLite is well past).

### Tag color UI
New admin page, e.g. `/admin/tags` — list of every `Tag`, name editable
(`EditableText`, same as every other rename control in this codebase),
color via a plain `<input type="color">` bound to the hex string, and a post
count for context. Deleting is offered only when the post count is 0 (same
used/unused-gated-delete shape the image library page already established) —
not a hard requirement of the ask, but keeps an admin from accumulating
orphaned tags with no way to clean them up, consistent with how this
codebase already treats "can this go away safely" elsewhere.

New/changed API:
- `GET /api/tags` (replaces `GET /api/posts/tags`) — same "not sensitive,
  not admin-gated" reasoning as the route it replaces
  (`app/api/posts/tags/route.ts`'s existing doc comment), now returning
  `{ id, name, color }[]` instead of bare strings.
- `PUT /api/tags/[id]` — rename/recolor, `requireAdmin`.
- `DELETE /api/tags/[id]` — `requireAdmin`, rejects (409) if any post still
  references it, mirroring `DELETE /api/uploads/images/[id]`'s
  re-derive-usage-server-side-never-trust-the-client pattern from the prior
  phase of this project.
- Audit log: add `"Tag"` to `AUDIT_ENTITY_TYPES`, a `tagSnapshot()`, and an
  undo handler in `lib/audit-log.ts`, following the exact shape every other
  entity type in that file already follows — this is a new admin-mutable
  entity, so it gets the same audit coverage as everything else introduced
  in this project, not a one-off exception. (`Post` itself is still not
  audited, matching today — out of scope, not touched here.)

### Post authoring UI
`components/news/posts-editor.tsx`'s `PostForm` currently has a single
`<input list="post-tag-options">` (`posts-editor.tsx:158-174`). Replace with
a multi-select: existing tags rendered as toggleable colored chips (reusing
`TagPill`'s visual language, parameterized by each tag's stored `color`
instead of the current fixed accent), plus an inline "new tag" text input
that creates-and-attaches a tag on the spot (default color, editable later
from `/admin/tags`). At least one tag stays required, matching today's
`required` single-tag field. `FormValues.tag: string` becomes
`FormValues.tagIds: string[]`; `POST /api/posts` / `PUT /api/posts/[id]`
payloads switch from `tag` to `tagIds`.

### Everywhere else `tag` is read
- `TagPill` (`components/news/tag-pill.tsx`) takes a `{ name, color }` object
  instead of a bare string, and renders its background/border/text from
  `color` at reduced opacity (same visual treatment, parameterized) instead
  of the hardcoded `accent` Tailwind classes.
- `NewsPostItem` (`components/news/news-post-item.tsx`) renders one
  `TagPill` per `post.tags` entry instead of one for `post.tag`.
- `PostsEditor`'s visitor-facing tag filter (`posts-editor.tsx:296-297`,
  `Array.from(new Set(scoped.map(p => p.tag)))`) becomes
  `scoped.flatMap(p => p.tags)` deduplicated by id, and the filter predicate
  becomes `post.tags.some(t => t.id === visitorTagId)`.
- `getPostListDirectory()` (`lib/content.ts:96-102`) — its `posts` field
  shape (`{ id, slug, title, tag, publishedAt }`) becomes `tags` (array).
- `ClientPost` (`components/news/posts-editor.tsx:9-18`) — `tag: string` →
  `tags: { id: string; name: string; color: string }[]`.

### Files
- `prisma/schema.prisma`, hand-edited migration
- `lib/validation/content.ts` (or wherever post/tag schemas live — hex color
  validation)
- `lib/audit-log.ts`
- `app/api/tags/route.ts`, `app/api/tags/[id]/route.ts` (new, replacing
  `app/api/posts/tags/route.ts`)
- `app/api/posts/route.ts`, `app/api/posts/[id]/route.ts`
- `app/admin/tags/page.tsx`, `components/admin/tags-admin.tsx` (new)
- `app/admin/page.tsx` (nav tile)
- `components/news/tag-pill.tsx`
- `components/news/news-post-item.tsx`
- `components/news/posts-editor.tsx`
- `lib/content.ts`

### Testing
- Run the migration against a copy of the real dev DB (not a fresh empty
  one) — confirm every existing post keeps its exact tag after migrating,
  with no data loss.
- Create a post with 3 tags — confirm all 3 render, each in its own stored
  color.
- Change a tag's color from `/admin/tags` — confirm every post using that
  tag updates everywhere it's rendered (post list, post detail, wherever
  else `TagPill` appears).
- Confirm the visitor-facing tag filter dropdown on a Post List block still
  works with multi-tag posts (a post with tags A and B shows up under both
  filters).
- Try deleting a tag still in use — confirm the server rejects it; delete an
  unused one — confirm it actually goes away.
- Confirm `GET /api/tags` still works unauthenticated (matches the route it
  replaces).

---

## Phase 6 — New "Post Display" block: cross-block posts filtered by tag, admin-only visibility of the filter itself (Complete)

### Goal
Post List blocks each own their own posts outright (confirmed in
`components/blocks/registry.tsx`'s long doc comment — this was a deliberate
prior-phase decision). There's currently no way to aggregate posts *across*
different Post List block instances anywhere on the site. Add a new block
type, Post Display, whose admin configures it by picking one or more tags;
it then shows every post, from every Post List block anywhere on the site,
that carries any of those tags. Visitors never see which tags drove the
selection — only the resulting post list; the tag configuration is visible
solely in admin edit mode.

**Depends on Phase 5** — this block filters by `Tag` id, which doesn't exist
until Phase 5's schema change lands. Build Phase 5 first.

### Schema / block registration
New `BlockType` entry `"postDisplay"` — added alongside `postList` in
`BLOCK_TYPES`, `blockTypeLabels`, `defaultBlockData` (`{ tagIds: [] }`), and
the `blockCreateSchema` discriminated union, all in
`lib/validation/pages.ts` / `components/blocks/registry.tsx`, following the
exact registration shape every existing block type already uses (see
`components/blocks/registry.tsx`'s own doc comment: "adding a block type
later is a one-line registration" per lookup table).
```ts
const postDisplayDataSchema = z.object({
  tagIds: z.array(z.string()).max(20),
});
```
Zero tags selected is a valid, explicit state — not "show everything" (that
would silently leak every post site-wide the moment the block is added,
before an admin has configured anything) but "show nothing," with an
edit-mode-only empty state ("Select at least one tag to display posts.").

### Data layer
New function, e.g. `getPostsByTagIds(tagIds: string[])` in `lib/content.ts`:
`prisma.post.findMany({ where: { tags: { some: { id: { in: tagIds } } } },
include: { tags: true }, orderBy: { publishedAt: "desc" } })` — OR
semantics across the selected tags (a post matching *any* selected tag is
included), matching the ask's "select a tag or tags ... display all posts
... that have that tag."

`components/pages/page-renderer.tsx` currently computes `postListBlockIds`
and fetches their owned posts via `getPostsByBlockIds`
(`page-renderer.tsx:53,59`). Extend it: also collect `postDisplay` block ids
on the page, union the `tagIds` out of each one's `data`, run one
`getPostsByTagIds` call across that whole union (not one query per block —
avoid an N-query page render), then for each `postDisplay` block instance
locally filter that unioned result down to just the posts matching *that
block's own* `tagIds` subset. Merge the result into the same
`referenceData.postsByBlockId` map `postList` already populates — block ids
are unique across every block type on a page, so there's no key collision
merging `postList`'s owned posts and `postDisplay`'s matched posts into one
map; the block component on the other end just reads its own `block.id`
entry same as `postList` already does, unaware of which path produced it.

### Component
New `components/blocks/post-display-block.tsx`, structurally parallel to
`PostsEditor` but simpler (no create/edit/delete post forms — this block
never owns posts, only selects existing ones):
- **Admin edit mode**: multi-select tag chips (reusing the same
  `GET /api/tags`-backed chip UI introduced in Phase 5 for `PostForm`),
  toggling membership in `data.tagIds`, persisted via the standard
  `onSaveData` pattern every other block already uses. Below it, the
  matched posts render exactly as the visitor view does (so an admin can see
  what they just configured) — but the tag chips themselves are only ever
  visible in this admin branch.
- **Visitor mode**: a flat `NewsPostItem` list of the resolved posts, no tag
  UI, no indication of what drove the selection — mirrors `PostsEditor`'s
  visitor branch structurally but deliberately omits its own tag-filter
  `<select>` (that control lets a *visitor* narrow an already-fixed set of
  owned posts; here the admin has already curated the set via tags, and
  exposing the mechanism would defeat "won't show what tags it's filtered
  to show publicly").

`components/blocks/registry.tsx`'s `blockComponents.postDisplay` entry wraps
it in a `Container` the same way `postList`'s entry does.

### Files
- `lib/validation/pages.ts` (`postDisplayDataSchema`, `BLOCK_TYPES`,
  `blockTypeLabels`, discriminated union entry)
- `components/blocks/registry.tsx` (`defaultBlockData`, `blockComponents`
  entry)
- `components/blocks/post-display-block.tsx` (new)
- `lib/content.ts` (`getPostsByTagIds`)
- `components/pages/page-renderer.tsx`

### Testing
- Add a Post Display block, select one tag used by posts across two
  different Post List block instances on two different pages — confirm
  every matching post from both shows up, deduplicated appropriately (a
  post can't literally appear in two Post List blocks since posts are
  owned, so no duplication concern there — just confirm the union spans
  both source pages correctly).
- Select two tags — confirm OR semantics (a post with either tag appears,
  not only posts with both).
- Leave zero tags selected — confirm the edit-mode empty state, and that the
  block renders nothing at all (not "everything") to a visitor.
- Confirm the visitor-facing render shows no trace of which tags were
  selected — only the post list itself.
- Add this block to a page alongside a real `postList` block on the same
  page — confirm both render their own correct, independent post sets (no
  cross-contamination in `referenceData.postsByBlockId`).
- Delete or rename a tag from `/admin/tags` (Phase 5) that a Post Display
  block is currently using — confirm the block's result set updates
  accordingly on next render (rename: still matches by id, unaffected;
  delete: that tag id silently drops out of the match set rather than
  erroring).

---

## Sequencing note

Phase 6 requires Phase 5 (needs the `Tag` model to exist). Every other phase
is independent — Phases 1–4 can land in any order, before or after 5/6, with
no shared files or data dependencies between them. Phase 2 does touch
`RESERVED_SLUGS` in `lib/validation/pages.ts`, the same file Phase 6 also
touches (for `BLOCK_TYPES`/`blockTypeLabels`) — no functional conflict, just
worth landing one before starting the other to avoid an avoidable merge
conflict in a frequently-edited file.
