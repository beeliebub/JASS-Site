# PLAN.md — Header status slot, global edit lock, Link Grid ghost-line fix

**Status: scoped, not yet implemented.** Nothing here carries over from any
prior version of this file — the previous pass (admin-defined custom block
types: `BlockDefinition`/`BlockFieldDefinition` schema, dynamic Zod
validation, the block-type admin UI, and `CustomBlockRenderer`) is complete
and shipped (commit `a0b985c`); do not look it up, do not renumber around it.
Phase numbers below are local to this file only.

**Hard rule, unchanged from every prior version of this file: this file's own
nomenclature (`Phase N`, `PLAN.md`, decision numbers, etc.) must never be
referenced in source code comments.** A comment has to stand on its own and
still make sense after this file is deleted or replaced by the next one.

## What this is

Three unrelated items from the website to-do thread, bundled only because
they were raised together:

1. **Fix the Link Grid "ghost line" regression** — a page containing a Link
   Grid block grows a spurious extra line/row when an admin enters then
   leaves edit mode. It's purely visual and transient (a plain reload clears
   it; nothing is written to the DB). A previous fix in this area resolved
   one bug but introduced this one "of the same caliber."
2. **Move the online-player counter into the site header** — put the online
   counter in the currently-empty space in the header, between the `JASS`
   logo (left) and the nav links (right). This becomes a **per-page**
   setting, edited from the Pages admin (`app/admin/pages`), the same way the
   Page Header block's content is authored. A page with no header content
   configured leaves that space empty, exactly as it looks today.
3. **OWNER-only global "disable all site editing" switch** — an OWNER (not a
   plain ADMIN) can flip a single site-wide toggle that turns off all content
   editing for everyone, and flip it back on.

The three phases are independent of one another and can land in any order (or
in parallel). Only Phases 2 and 3 touch the database/schema; Phase 1 is a
client-only bug fix.

---

## Phase 1 — Link Grid "ghost line" regression

### The bug
On any page that contains a Link Grid block, an admin toggling edit mode on
and then off leaves behind an extra "ghost line" (a stray border/divider or
empty grid row) that wasn't there before. It is **not** persisted — a reload
removes it and the database is untouched — so this is entirely a
client-render/DOM-lifecycle artifact, not a data bug.

### Likely root cause (confirm by reproduction before fixing)
The previous fix referenced in the report is almost certainly
`components/blocks/block-shell.tsx`'s change from returning a Fragment in one
branch and a `<div>` in the other, to **always** returning the same `<div>`
whose className flips between edit chrome
(`border border-dashed border-border-strong transition-colors …`) and
`"contents"` (zero-footprint) when not in edit mode. That change correctly
stopped React from tearing down and remounting block editors on every
edit-mode toggle (which had been silently resetting Rules/Features editor
state — the full rationale is in that file's doc comment). The "new issue of
the same caliber" is the visible side effect that fix left on Link Grid:
the shared `<div>` carries `transition-colors` and switches its border on/off
in place, and `LinkGridBlock` itself renders a `<section className="border-b
border-border">` in **both** its edit and visitor branches plus an inner
`grid … gap-px … bg-border` whose gaps read as divider lines. The residual
line is one of:
- the `BlockShell` wrapper's border mid-transition (a `transition-colors`
  div going from a real border color to `contents` can leave a painted edge
  until the next full layout/reflow — which is what a reload forces), or
- a Link Grid grid-gap divider that reflows differently once the wrapper
  collapses back to `display: contents`.

Reproduce first (dev server, log in as admin, open a page with a Link Grid,
toggle edit mode on then off, inspect the DOM/computed styles for the stray
line) and pin down which of these it actually is — do not fix blind.

### Fix approach
- Whatever the confirmed cause, the fix must **not** reintroduce the remount
  bug the `BlockShell` doc comment describes: the wrapper element type must
  stay a stable `<div>` across the edit/non-edit toggle (no Fragment↔div
  swap, no changing `key`). Solve the visual artifact within that constraint
  — e.g. drop the lingering `transition-colors` on the non-chrome state, or
  force the collapsed state to a clean `contents`/no-border with no
  transitional paint, or adjust where Link Grid's own `border-b`/`gap-px`
  dividers sit relative to the shell.
- Prefer a fix scoped to the smallest surface. If it turns out to be a
  `BlockShell` issue, fix it there once (it benefits every block type); if
  it's specific to `LinkGridBlock`'s section/grid borders, fix it there.

### Verification (this phase has no DB footprint)
- Toggle edit mode on→off repeatedly on a page with a Link Grid and confirm
  no line accumulates and the DOM matches the post-reload state.
- Re-check the original bug the prior fix addressed is still fixed: add a
  rule/feature/link in edit mode, toggle edit mode, confirm the in-progress
  local state does **not** reset (that was the regression the `BlockShell`
  fix prevented — don't trade one for the other again).
- Repeat with at least one other block type present to confirm the fix
  didn't shift the artifact onto a different block.

### Production-safety check for this phase
No schema, migration, seed, env, or deploy-file changes — client render only.
Nothing on the production-safety checklist in `CLAUDE.md` applies here beyond
confirming the diff really is client-component-only.

---

## Phase 2 — Per-page online-counter slot in the site header

### Goal
The site header (`components/site-header.tsx`) gains an optional content slot
in the empty space between the `JASS` logo and the desktop nav. Its content
is configured **per page** from the Pages admin. When a page has nothing
configured, the header looks exactly as it does today (empty space). The
online-player counter (today's `LiveStatusBadge`, currently living in the
home hero) is the content this slot is built to hold.

### Locked scope decisions (answered 2026-07-14 — do not re-litigate)
1. **Slot content model = a small set of kinds** (`none` | `status` | `text`).
   A page can show the live online counter, or custom text, or nothing. This
   is the flexible option; both a status widget and a free-form text field are
   in scope.
2. **The counter moves out of the home hero.** `LiveStatusBadge` is removed
   from `components/home/hero-content.tsx` and the home page instead shows the
   counter via its header slot (`kind: "status"`), so it isn't rendered twice.

### Data model
`Page` (in `prisma/schema.prisma`) gains one nullable column to hold the
slot config as JSON (mirrors how `Block.data` stores per-instance JSON):

```prisma
model Page {
  // ...existing fields unchanged...
  headerContent String?   // JSON; null = empty header slot (today's behavior)
}
```

The JSON is a small discriminated shape validated by a new Zod schema in
`lib/validation/pages.ts` (next to the existing page schemas), keyed on
`kind`:
- `{ kind: "status", label?: string, host?: string, port?: number,
  useGlobalStatus?: boolean }` — the live online counter. When
  `useGlobalStatus` (or no host/port), reuse the existing `/api/status`
  target; otherwise ping the given host/port.
- `{ kind: "text", text: string }` — free-form header text (the "similar to
  the Page Header block" case).
- `{ kind: "none" }` (or `null`/absent) — render nothing.

Keep `null`/absent === `kind: "none"` meaning "render nothing" so every
existing page is byte-identical to today until an admin configures a slot.

### Rendering path
- `components/site-header.tsx` (`SiteHeader`) takes a new optional prop
  (e.g. `headerSlot?: ReactNode` or a small serializable
  `headerContent` object it renders itself) and places it in the flex row
  between the logo `<Link>` and the `<nav>` — the empty middle space today.
  Must degrade to nothing when unset so the current layout is byte-identical
  for pages without it. Consider the mobile header too (the `sm:hidden`
  branch) — decide whether the slot shows on mobile or desktop-only.
- `components/pages/site-chrome.tsx` (`SiteChrome`) threads the current
  page's `headerContent` down to `SiteHeader`, the same way it already
  receives and applies the per-page `theme`/`customThemeTokens` props. Add a
  `headerContent`-shaped prop to `SiteChrome` and have each caller pass it:
  - CMS-driven pages: `PageRenderer` already passes the `Page`'s theme into
    `SiteChrome`; pass `headerContent` from the same `Page` row.
  - The static account/admin/login/resource routes have no `Page` row, so
    they pass nothing → empty slot (unchanged).
- `kind: "status"` reuses `LiveStatusBadge` (or a small parameterized
  variant taking host/port) so there's no second polling/formatting
  implementation — `/api/status` and the `StatusBadge` presentational
  component stay the source of truth. `kind: "text"` renders the string in
  the same header row. `kind: "none"`/null renders nothing.
- Remove `LiveStatusBadge` from `components/home/hero-content.tsx` and seed
  (or leave for the admin to set) the home page's `headerContent` to
  `kind: "status"` so the counter shows once, in the header, not in the hero.
  Watch the home hero's layout after removing the badge — the hero's flex
  `gap-8`/spacing above the heading assumed the badge was there.

### Admin editing (`app/admin/pages`)
- Add the header-slot editor to the existing Pages admin
  (`components/admin/pages-admin.tsx` + `app/admin/pages/page.tsx`), as a new
  per-page field in the same edit surface that already edits page
  title/slug/theme. "Similar to current Page Header block" = an inline,
  optional content editor; empty is the default and means "no header slot."
- CRUD flows through the existing page-update API route — extend its Zod
  payload (`lib/validation/pages.ts`) to accept `headerContent`, validated by
  the schema above. Audit-log the change like every other page mutation
  (`lib/audit-log.ts`), matching how page title/slug/theme edits are logged.

### Production-safety check for this phase
- **Migration is purely additive** — one new nullable `Page.headerContent`
  column, no backfill. Confirm the generated `migration.sql` contains no
  `INSERT`/`UPDATE` and **no hardcoded ids/rows read off this dev database**
  (the `ac831b6` failure mode). A nullable column with no default needs no
  data migration at all.
- **`prisma/seed.ts` stays idempotent.** If the home page's slot is seeded
  (e.g. to relocate the hero counter into the header on a fresh install),
  it must be an upsert / guarded write inside the existing
  `seedPagesAndNav()` bootstrap — never an unconditional `create`/`update`
  that would clobber real production page content on first run. Leaving
  `headerContent` unseeded (admins configure it themselves) is the safest
  default and avoids touching seed at all.
- **No new env vars** are expected; if the status widget needs a host/port
  beyond the existing `MC_SERVER_HOST`/`MC_SERVER_PORT`, document it in both
  `.env.example` and `docs/DEPLOYMENT.md`.
- Deploy steps (`prisma migrate deploy` + `npm run db:seed`) need no change
  unless seed is touched per above.

---

## Phase 3 — OWNER-only global "disable all site editing" switch

### Goal
A single site-wide switch, editable by an **OWNER only** (a plain ADMIN must
not see or be able to flip it), that when off disables all content editing
across the entire site for everyone — and can be turned back on by the OWNER.
When editing is globally disabled, the edit-mode UI and every mutation are
blocked; the OWNER's ability to re-enable it must itself never be blocked by
the switch (otherwise it's a one-way lockout).

### Data model
Add one boolean to the existing `SiteSettings` singleton
(`prisma/schema.prisma`), defaulting to editing-enabled so existing/new
installs behave exactly as today:

```prisma
model SiteSettings {
  // ...existing fields unchanged...
  editingEnabled Boolean @default(true)
}
```

(Name it for the safe default — `editingEnabled @default(true)` reads
correctly on a fresh row created by `getSiteSettings()`'s upsert, which
supplies no value for it. Avoid a `disabled`-style flag whose safe default is
`false`, so the upsert's create path can't accidentally lock editing.)

- Extend `ResolvedSiteSettings` + `getSiteSettings()` in
  `lib/site-settings.ts` to surface `editingEnabled`.
- Extend `siteSettingsUpdateSchema` in `lib/validation/site-settings.ts` with
  `editingEnabled: z.boolean().optional()`.

### Enforcement (the important part — server-side, not just UI)
The kill-switch must be enforced where writes actually happen, not only by
hiding the toggle. In `lib/auth-guard.ts`:
- Add a helper (e.g. `requireEditingEnabled()` / fold into a new
  `requireEditor()`) that returns false when a **write** is attempted while
  `editingEnabled` is false — regardless of ADMIN/OWNER role. Every mutation
  route that currently gates on `requireAdmin()` for content edits
  (`/api/blocks/**`, `/api/pages/**`, `/api/nav/**`, page/tag/block-definition
  CRUD, content/hero edits, uploads used for editing, etc.) must also respect
  this. Audit the call sites of `requireAdmin()` and apply consistently — a
  missed route is a hole in the lock.
- **Do not** gate the settings-update route that flips `editingEnabled`
  itself on the switch, or the OWNER can't turn editing back on. That route
  gates on `requireOwner()` only. Double-check the toggle write path is
  exempt.
- Account/user-management routes gated on `requireOwner()` are out of scope
  for the lock (this is a *content-editing* switch); confirm the intended
  boundary during review — e.g. does disabling editing also hide the
  block-level edit chrome but leave user management working? Recommended:
  yes, the switch only affects content editing, user management stays
  OWNER-gated as today.

### UI
- **The toggle** lives in the OWNER-only area of the Site Settings admin
  (`components/admin/site-settings-admin.tsx` + `app/admin/settings`),
  rendered only when the session role is OWNER (client reflects
  `requireOwner()`; the server route still re-checks — UI gating is not the
  security boundary). A clear on/off control with a short explanation of what
  it does site-wide.
- **Edit-mode affordance** reflects the lock: when `editingEnabled` is false,
  the `EditModeToggle` in `SiteHeader` should be disabled/hidden (or show a
  "site editing is disabled" state) so admins aren't offered an edit mode
  whose every save will 403. `EditModeProvider` (app/layout.tsx →
  `components/admin/edit-mode-context.tsx`) can receive the current
  `editingEnabled` value alongside `isAdmin` and force `editMode` to stay off
  when editing is globally disabled — belt-and-suspenders with the
  server-side enforcement, not a replacement for it.
- Optionally surface a small banner in edit-capable views when the lock is on
  so an OWNER remembers it's engaged.

### Audit log
Flipping the switch is an admin mutation — log it via `lib/audit-log.ts` like
every other settings change, including which OWNER changed it and to what
value.

### Production-safety check for this phase
- **Migration is additive** — one new `SiteSettings.editingEnabled` column
  **with `@default(true)`** so existing rows (there's a single singleton row)
  and the upsert's create path both come out editing-enabled with no
  backfill. Confirm the generated `migration.sql` has no `INSERT`/`UPDATE`
  and no ids/values hardcoded from this dev database. If Prisma emits a
  backfill for the new non-null column on existing rows, verify it's the
  constant `true` default and keyed on nothing db-specific — never a literal
  id from `prisma/dev.db`.
- **`prisma/seed.ts` stays untouched / idempotent** — the singleton is
  created lazily by `getSiteSettings()`'s upsert with the schema default;
  nothing new needs seeding. Do not add an unconditional write.
- **No new env vars**; no `docs/DEPLOYMENT.md` deploy-step change beyond the
  standard `prisma migrate deploy`.
- **No dev-only artifacts** — if a temp OWNER account or a flipped switch was
  used to verify, reset `editingEnabled` back to `true` and remove any temp
  account before the change is considered done.

---

## Cross-cutting notes

- **Two migrations, two additive columns.** Phases 2 and 3 each add exactly
  one nullable/defaulted column to an existing table. Generate them as
  separate migrations (or one, if landed together) and read the resulting SQL
  by hand per the `CLAUDE.md` production-safety pass — the live site deploys
  by running these migrations against a *different* database than this dev
  machine's, so the only safe migration data is keyed on stable schema
  identifiers, never a row/id read off `prisma/dev.db`.
- **Enforcement over concealment (Phase 3).** The security boundary for the
  edit lock is the server-side guard in `lib/auth-guard.ts` applied at every
  mutation route, exactly like the existing note in `edit-mode-context.tsx`
  that client edit-mode state is "a UX gate only." Hiding the toggle/edit
  chrome is UX; the guard is the actual lock.
- **No new env vars expected** across all three phases; if that assumption
  breaks (e.g. Phase 2's status widget needs new host/port config), update
  `.env.example` and `docs/DEPLOYMENT.md` as part of that phase, not after.
