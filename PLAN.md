# PLAN.md — Bug fix pass + data-referencing block ownership rework

Started as three independent, unrelated bugs reported against the live site
(Phases 22, 23→25, 24). Phase 23's investigation grew into a bigger rework:
Post List, Rule List, and Feature Grid blocks currently all read from a
shared, site-wide table filtered per-instance by an ID allow-list — Phases
25-27 replace that with each block instance owning its own rows outright.
Numbered to continue from the prior PLAN.md's Phase 21, per memory: phases
0-21 are complete. Phases 22/24 don't depend on anything else; 25/26/27 are
independent of each other but share a sequencing note at the end of Phase 27.

Scope note: Phases 22 and 24 don't require a Prisma migration — `Block.data`
and `CustomTheme`'s hex fields are already shaped correctly, so those are
component/validation-layer only. Phases 25-27 (added after Phase 23 turned
out to be the wrong fix, then extended to the other two blocks with the same
shared-pool pattern) each require a migration — see those phases for why.

---

## Phase 22 — Custom theme color-picker popover overflows the viewport

### Symptom
"Custom themes creation UI is broken BADLY for some people and not for
others." Reported inconsistently — works fine for some admins, badly broken
for others.

### Root cause (confirmed by reading the code)

`components/admin/custom-themes-admin.tsx`'s `ColorField` component (the
per-token swatch + hex input + popover picker used 16x in the theme editor
form, one per `TOKEN_GROUPS` entry, lines 27-32) renders its `HexColorPicker`
popover with hard-coded, unclamped positioning:

```tsx
// custom-themes-admin.tsx:180-186
<div
  role="dialog"
  aria-label={`${label} color picker`}
  className="absolute left-0 top-full z-20 mt-2 w-fit rounded-lg border border-border-strong bg-surface-2 p-3 shadow-lg"
>
  <HexColorPicker color={value} onChange={onChange} />
```

This is always `position: absolute`, anchored to its own swatch button, with
no viewport-edge awareness. On a narrow browser window, tablet, or any
desktop window where the theme editor's `sm:grid-cols-2` field grid pushes a
swatch (e.g. "Primary hover", "Accent foreground", "Offline" —
`FIELD_LABELS`, lines 34-51) close to the right edge, the popover renders
partially or fully off-screen and becomes unusable — can't click the color
picker, can't click "Done", may not even be able to see it. Wide desktop
windows never trigger this. That fully explains "broken badly for some
people, not others": it's a function of viewport/window width, not account
data or browser vendor.

This is a regression-by-omission, not a new bug: commit `21b89ca` ("admin
chrome, mobile theme picker overflow, theme editor popovers") added
click-outside/Escape-close handling to **both** this component and
`components/theme/theme-picker.tsx`'s visitor-facing footer popover (the
comment at `custom-themes-admin.tsx:130-134` explicitly says "Same
click-outside/Escape-close pattern as components/theme/theme-picker.tsx's
popover"), but only `theme-picker.tsx` got the viewport-clamping CSS fix:

```tsx
// theme-picker.tsx:99-105
className="fixed inset-x-4 bottom-20 z-50 rounded-lg border border-border-strong bg-surface-2 p-4 shadow-lg sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-72"
```

`ColorField`'s popover was left on the pre-fix, unclamped positioning.

### Why a straight copy of theme-picker.tsx's fix isn't quite enough

`theme-picker.tsx` only has **one** instance, anchored in a fixed footer, so
a single breakpoint-based `fixed`-below-`sm`/`absolute`-above-`sm` swap
covers it. `ColorField` renders up to 16 times in a 2-column grid — the
overflow risk is horizontal (left or right edge, depending which grid column
a given swatch sits in) and can happen even on a "desktop" width browser
window that's simply not maximized (e.g. ~700-900px), which is narrower than
a breakpoint switch alone reliably catches for a right-column swatch.

### Planned fix

1. Give `ColorField`'s popover a lightweight "flip to fit" behavior instead
   of a fixed `left-0`: when `pickerOpen` becomes `true`, measure
   `triggerRef.current.getBoundingClientRect()` and the popover's own
   rendered width (via a ref + a `useLayoutEffect` measured after first
   paint, matching the existing ref-based pattern already in this file) and
   pick `left-0` vs `right-0` (whichever keeps the popover's edge inside
   `window.innerWidth`), same idea for vertical placement if a swatch is near
   the bottom of the scrollable form.
2. Additionally apply the same mobile-viewport clamp `theme-picker.tsx` uses
   below `sm` (`fixed inset-x-4 ...` before the breakpoint, `sm:absolute`
   after) so small-screen behavior matches the sibling component exactly.
3. No change needed to the click-outside/Escape logic (lines 140-158) —
   that part already works correctly per-instance.

### Files
- `components/admin/custom-themes-admin.tsx` (`ColorField`, ~lines 106-215)
- Reference/compare: `components/theme/theme-picker.tsx` (~lines 90-110) for
  the pattern this should end up consistent with.

### Testing
- Resize the browser window (not just devtools device emulation) through a
  range of widths — narrow desktop (~700px), tablet (~768px), and mobile
  (~375px) — and open the picker for swatches in **both** grid columns of
  every `TOKEN_GROUPS` section, including the last row.
- Confirm the popover never renders with any part outside the viewport, the
  "Done" button is always clickable, and click-outside/Escape still close it.
- Re-test the existing visitor-facing `theme-picker.tsx` popover to confirm
  no regression (it's the reference pattern, not being rewritten, but if any
  shared constants/utilities are extracted, verify both still work).

---

## Phase 23 — Post List block: confirm whether distinct instances actually show distinct content

> **Superseded by [Phase 25](#phase-25--post-list-blocks-each-own-their-own-posts-no-shared-pool).**
> The investigation below correctly found no plumbing bug and correctly
> diagnosed that two instances filtering the same shared `Post` table could
> collide — but the fix it shipped (an uncommitted `postIds` hand-picked
> allow-list, mirroring Rule List/Feature Grid) is still every instance
> reading from one shared, site-wide pool, just with a finer filter on top.
> After seeing that diff, the user clarified they want something stronger:
> each Post List block **owns** its own posts outright, not a curated view
> into a shared pool. Phase 25 replaces the `postIds` approach entirely —
> when that phase is implemented, revert the uncommitted `postIds` work in
> `components/news/posts-editor.tsx` / `lib/validation/pages.ts` rather than
> building on top of it.

### Symptom
"Blocks like 'Post List', even though a fix was done recently to address
this, still display the exact same information across pages, instead of
having unique information per block." The referenced recent fix is commit
`5a637c6` ("per-instance block filters (Post List, Rule List, Feature Grid,
Hero) + news tag styling").

### What the code audit found (this is *not* yet a confirmed root cause)

Read through the full per-instance data path and did not find a plumbing bug:

- `components/pages/page-renderer.tsx:46-88` gives every `Block` row its own
  parsed `data` from that row's own `block.data` JSON — no shared/global
  state, no caching keyed only by block *type*.
- `components/blocks/registry.tsx:105-113` passes `data={block.data as
  PostListData}` into `PostsEditor` per block instance — structurally
  identical to how `ruleList`/`featureGrid` pass their own per-instance data
  (lines 87-104), which the report says work correctly.
- `components/news/posts-editor.tsx:257-259` (the visitor / non-edit-mode
  render path) filters directly off that instance's `data.tag`/`data.limit`
  props on every render — it does not cache or memoize across instances.
- `components/pages/page-blocks.tsx:47-63` (`saveBlockData`) and
  `app/api/blocks/[id]/route.ts` both target a single block by its own `id`
  — no `updateMany`/shared-key writes.
- `lib/content.ts:53`'s `getPosts()` is a plain, uncached Prisma query (no
  `unstable_cache`/`revalidate` wrapper) — every request gets fresh data, so
  there's no stale-cache angle either.

In other words: reading the code as it stands today, two Post List block
instances with **different** `data.tag`/`data.limit` values should already
render different content. This doesn't match the report, so before writing
any fix we need to nail down what's actually different in practice.

### Leading hypothesis (needs confirmation, not yet a decided fix)

Post List's filter is coarser than Rule List's/Feature Grid's. Compare the
schemas in `lib/validation/pages.ts:324-335`:

```ts
const ruleListDataSchema = z.object({
  sectionIds: z.array(z.string().min(1).max(80)).max(200).nullable().optional(),
});
const featureGridDataSchema = z.object({
  featureIds: z.array(z.string().min(1).max(80)).max(200).nullable().optional(),
});
const postListDataSchema = z.object({
  tag: z.string().min(1).max(80).nullable().optional(),
  limit: z.number().int().min(1).max(200).nullable().optional(),
});
```

Rule List and Feature Grid let an admin hand-pick an arbitrary, independent
subset of specific sections/features per instance (`sectionIds`/`featureIds`
arrays, edited via `MultiSelectChecklist` — `rules-editor.tsx:246-253`,
`features-editor.tsx:191-198`). Post List only supports one broad category
tag plus a count cap — there is no way to hand-pick individual posts. Two
instances both left on the default ("All tags", `defaultBlockData.postList =
{ tag: null, limit: null }`) or both set to the same tag will **necessarily**
render identical content, whereas Rule List/Feature Grid's per-ID selection
can never collide that way. Since this site's post tags are broad categories
("Update", "World", "Maintenance", "Rules", "Event", "Patch Notes" —
`components/news/posts-data.ts`), this is an easy trap to fall into when
configuring two Post List instances and expecting them to differ.

Also worth ruling out while reproducing: in edit mode, **all three** block
types (Post List, Rule List, Feature Grid) intentionally render their full,
unfiltered list regardless of the per-instance filter (this is by design, so
admins can edit/reorder/delete any item from any instance) — only the
visitor-facing (`!isAdmin || !editMode`) view applies the filter. If
whoever's testing this is staying in edit mode while comparing instances,
every block type would look "identical," not just Post List. That wouldn't
explain why only Post List is singled out in the report, but it's cheap to
rule out.

### Plan — investigate first, per your call

1. **Reproduce concretely** before changing anything: create two Post List
   blocks (on the same page and/or different pages), give them visibly
   different `tag`/`limit` values via the existing admin UI, then view the
   page as a **signed-out visitor** (not in edit mode) and confirm whether
   the rendered lists actually still match. Also check with dev tools
   network tab whether the `PUT /api/blocks/[id]` calls are actually
   persisting distinct `data` per block (query the DB / Prisma Studio to
   confirm both rows have different `data` JSON after saving).
2. If the two instances *do* end up genuinely identical despite different
   saved `tag`/`limit` values, that means there's a real plumbing bug we
   didn't spot by reading — capture the exact repro (which tags, which
   limits, edit-mode state, page(s) involved) and re-audit `PostsEditor`'s
   render path and the `/api/blocks/[id]` route with that concrete case in
   hand.
3. If the two instances differ correctly whenever configured with genuinely
   different `tag`/`limit`, but the complaint is really "I can't make two
   instances show different individual posts within the same tag" — that
   confirms the granularity-gap hypothesis above. Circle back on whether to
   extend Post List's filter (e.g. an ID allow-list mirroring Rule
   List/Feature Grid, or multi-tag support) — deliberately left undecided
   here since it changes scope, and to revisit once reproduction confirms
   which problem is actually happening.

### Files (for the reproduction/audit pass)
- `components/news/posts-editor.tsx`
- `components/blocks/registry.tsx`
- `components/pages/page-renderer.tsx`
- `components/pages/page-blocks.tsx`
- `app/api/blocks/[id]/route.ts`
- `lib/validation/pages.ts` (`postListDataSchema`, `parseBlockData`)

---

## Phase 24 — Public tag filter for news posts (currently admin-only)

### Symptom
"Tag filtering for news posts is only showing up in admin edit mode, when
this is supposed to be available in regular view mode for everyone."

### Root cause (confirmed by reading the code)

The only tag-filter UI anywhere in the codebase is the `<select>` inside
`components/news/posts-editor.tsx`, and it only renders on the admin
edit-mode branch:

```tsx
// posts-editor.tsx:257-271 (visitor / non-edit-mode branch — no filter UI at all)
if (!isAdmin || !editMode) {
  const filtered = data.tag ? posts.filter((p) => p.tag === data.tag) : posts;
  const limited = data.limit ? filtered.slice(0, data.limit) : filtered;
  ...
  return ( /* plain read-only <ol>, no controls */ );
}

// posts-editor.tsx:374-386 (admin edit-mode branch — the only tag filter control)
<select
  value={data.tag ?? ""}
  onChange={(e) => changeTag(e.target.value)}
  ...
>
  <option value="">All tags</option>
  {distinctTags.map((tag) => (
    <option key={tag} value={tag}>{tag}</option>
  ))}
</select>
```

This isn't a routing/layout split — `app/news/page.tsx` renders the same
`PageRenderer` → `PageBlocks` → `postList` block → `PostsEditor` component
tree for both admins and visitors. It's a single component with an
`if (!isAdmin || !editMode) return <read-only-list>` early return that has
no filter affordance at all in that branch.

**Important distinction to design around:** the existing `<select>` calls
`changeTag`, which persists via `onSaveData` → `PUT /api/blocks/[id]` — i.e.
it's an **admin content-curation control** that rewrites what *every* future
visitor sees for that block instance. It must not be reused as-is for
visitors: letting anonymous visitors call that same handler would mean any
site visitor could rewrite the page's block config for everyone, which is a
real authorization bug, not just a UX one. The public filter needs its own
**local, ephemeral, non-persisting** state.

### Planned fix

1. Add a new small tag-filter control to the visitor branch of
   `PostsEditor` (lines 257-271), backed by its own `useState` (e.g.
   `visitorTag`, initialized to `null`/"all") — purely client-side, never
   calls `onSaveData`/hits the API.
2. Compute the distinct-tags list for this control from `filtered` (i.e.
   from whatever set the admin's own `data.tag`/`data.limit` instance config
   already narrowed things down to), so an admin-scoped instance (e.g. a
   homepage widget locked to "Announcement") still only offers tags actually
   present in what that instance is allowed to show — it doesn't let
   visitors escape the admin's curation, it lets them narrow further within
   it.
3. If an instance's admin-set `data.tag` already pins it to exactly one tag,
   there's nothing left to filter — skip rendering the visitor control in
   that case (only show it when more than one distinct tag is present in
   `filtered`).
4. Reuse the existing `<select>` markup/styling for visual consistency, but
   as a separate small component (e.g. `PostVisitorTagFilter`) so the
   admin-curation control and the visitor-browsing control stay clearly
   separate in code, since they do fundamentally different things (persist
   vs. ephemeral).
5. Apply `visitorTag` as an additional client-side filter on top of
   `filtered`/`limited` before rendering the `<ol>`.

### Files
- `components/news/posts-editor.tsx` (visitor branch, ~lines 257-271)

### Testing
- As a signed-out visitor, load a Post List instance with no admin `tag`
  set and multiple distinct tags present — confirm a filter control appears
  and switching it narrows the visible list without a page reload or any
  network write.
- Confirm no `PUT /api/blocks/[id]` request fires when a visitor changes the
  filter (check the network tab) — this is the important regression to
  guard against given the authorization concern above.
- Load an instance where the admin has pinned `data.tag` to one tag —
  confirm no filter control renders (nothing left to filter) and the
  existing behavior (only that tag's posts, respecting `limit`) is
  unchanged.
- Confirm the admin edit-mode `<select>` (the persisting one) still works
  exactly as before — this phase adds a parallel control, it doesn't touch
  the existing one.

---

## Phase 25 — Post List blocks each own their own posts (no shared pool)

### Why this phase exists

Phase 23 diagnosed the "every Post List block looks the same" report as a
missing-granularity problem and fixed it with a `postIds` hand-picked
allow-list (uncommitted, in `components/news/posts-editor.tsx`) — the same
pattern Rule List/Feature Grid use for `sectionIds`/`featureIds`. The user
reviewed that and said it still isn't right: **Post List shouldn't work like
Rule List/Feature Grid at all.** Those two are deliberately "one shared
table, each instance shows a filtered view." Post List should be "each block
instance has its own posts" — full ownership, not a filtered view into a
site-wide pool. This is a real data-model change, not a filter tweak, so it
gets its own phase (and is the one exception to "no migration needed" for
this PLAN.md — see the scope note at the top of the file).

Decisions locked in during scoping (asked via clarifying questions, not
assumed):
- **Backfill target:** every existing `Post` row gets assigned to the Post
  List block on the site's `/news` page (the closest thing today to a
  canonical existing feed).
- **Delete behavior:** deleting a Post List block (or its page) cascade-
  deletes the posts it owns. This is a real, destructive behavior change
  from today (deleting a block currently never touches `Post` rows) — admins
  need to know that emptying/deleting a Post List block is no longer purely
  cosmetic.
- **Tag/limit filters:** keep both. Even though ownership already guarantees
  two blocks can't collide, a single block can still accumulate posts across
  several tags over time, so the existing tag-filter/limit controls stay
  useful *within* one block's own posts.

### Data model change

```prisma
model Post {
  id          String    @id @default(cuid())
  slug        String    @unique
  tag         String
  title       String
  excerpt     String
  body        String?
  publishedAt DateTime
  author      String?
  block       Block     @relation(fields: [blockId], references: [id], onDelete: Cascade)
  blockId     String
}

model Block {
  // ...existing fields unchanged...
  posts     Post[]
}
```

`blockId` is required (`Post` without an owning block shouldn't exist under
the new model) — but it can't be added as NOT NULL in one step against a
populated SQLite table. Do it as a two-step migration with a hand-inserted
backfill in between:

1. `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name post_block_id --create-only`
   with `blockId` added as **nullable** first, so the generated migration is
   inspectable before it runs.
2. Hand-edit that generated SQL to insert an `UPDATE Post SET blockId =
   '<id of the news page's postList block>' WHERE blockId IS NULL;` between
   the "add column" and (in a follow-up migration) "make it NOT NULL" steps.
   Look up the target block's real `id` from the dev DB first (`npx prisma
   studio` or a one-off query) rather than guessing — do not run this against
   any real data without confirming that id.
3. A second migration then rebuilds the table with `blockId` as NOT NULL
   (SQLite requires a full table rebuild for this, which Prisma's migration
   engine handles automatically) — only run this once step 2's backfill is
   confirmed to have left zero NULLs.
4. If, at implementation time, there is no Post List block on `/news` (e.g.
   it was removed or never seeded), stop and ask before backfilling
   anywhere else — don't silently pick a different block.

### API / data-layer changes

- `lib/content.ts`: replace the single site-wide `getPosts()` with something
  keyed by block, e.g. `getPostsByBlockIds(blockIds: string[])` returning
  rows for just those blocks (`prisma.post.findMany({ where: { blockId: {
  in: blockIds } }, orderBy: { publishedAt: "desc" } })`).
- `components/pages/page-renderer.tsx:33-44`: currently fetches `getPosts()`
  once per page (if *any* block is `postList`) and stuffs the full site-wide
  array into one shared `referenceData.posts` that every `postList` block on
  the page reads from (`components/blocks/registry.tsx:108`, `referenceData.posts
  ?? []`) — this is the literal root cause of "all instances share the same
  list," at the data layer, not just the UI filter. Replace with a fetch
  keyed by the `postList` block ids present on the page, and change
  `ReferenceData.posts` (registry.tsx:47-51) to something per-block, e.g.
  `postsByBlockId?: Record<string, ClientPost[]>`, so `registry.tsx`'s
  `postList` entry reads `referenceData.postsByBlockId?.[block.id] ?? []`
  instead of a page-wide array.
- `app/api/posts/route.ts` (`POST`): must require `blockId` in the body,
  validate it references an existing block whose `type === "postList"`
  (reject otherwise), and set it when creating the row. `lib/validation/pages.ts`
  needs a schema update for this (wherever the post-create body is validated).
- `app/api/posts/[id]/route.ts` (`PUT`/`DELETE`): ownership doesn't change on
  edit/delete, no `blockId` reassignment needed — existing per-id behavior is
  fine as is.
- `postListDataSchema` (`lib/validation/pages.ts`): drop `postIds` (moot —
  there's no shared pool left to hand-pick from; a block's own posts *are*
  its list). Keep `tag` and `limit` as-is.

### Component changes

- `components/news/posts-editor.tsx`: revert the uncommitted `postIds` /
  `MultiSelectChecklist` addition from the Phase 23 diff. `initialPosts` is
  now already scoped to one block by construction, so no `postIds`
  allow-list UI is needed. `PostsEditor` needs a new `blockId` prop (threaded
  from `registry.tsx`, which already has `block.id`) so `createPost` can send
  it to `POST /api/posts`.
- `components/blocks/registry.tsx`: `postList` entry passes `blockId={block.id}`
  and reads posts from the new per-block `referenceData.postsByBlockId`
  instead of `referenceData.posts`.

### Open question to confirm before implementing
- Should admins be able to move an existing post from one Post List block to
  another after the fact (reassign `blockId`), or is a post's owning block
  permanent once created (delete + recreate elsewhere if needed)? Leaning
  toward "permanent, no reassignment UI" for a first pass — cheap to add
  later if it turns out to matter — but flagging since it's a real product
  decision, not just an implementation detail.

### Files
- `prisma/schema.prisma` + new migration(s) under `prisma/migrations/`
- `lib/content.ts`
- `components/pages/page-renderer.tsx`
- `components/blocks/registry.tsx`
- `components/news/posts-editor.tsx`
- `app/api/posts/route.ts`
- `lib/validation/pages.ts`

### Testing
- Create two Post List blocks (same page and/or different pages), add
  different posts to each from their own admin editor — confirm each only
  ever lists/offers the posts created in *that* block, with zero overlap and
  no way to pick a post that belongs to the other block.
- Confirm the pre-existing (pre-migration) posts all show up under the
  `/news` page's Post List block after migrating, and nowhere else.
- Delete a Post List block that owns posts — confirm those `Post` rows are
  actually gone (cascade), not orphaned.
- Confirm `/news/[slug]` permalinks still resolve for posts regardless of
  which block owns them (that route looks up by `slug` alone, unaffected by
  this phase).
- Confirm tag filter + limit still work correctly scoped to one block's own
  posts, in both admin edit mode and the Phase 24 visitor-facing filter.

---

## Phase 26 — Rule List blocks each own their own sections (no shared pool)

### Why this phase exists

Same shared-pool problem as Phase 25, same fix, different model: Rule List
blocks currently all read from one site-wide `RuleSection` table (with `Rule`
rows nested under each section), each instance narrowed only by an optional
`sectionIds` hand-pick allow-list (`components/rules/rules-editor.tsx:15,55-56,242-250`).
Two instances left unfiltered (or pointed at overlapping `sectionIds`) show
identical content, for the same root-cause reason as Post List: `page-renderer.tsx`
fetches `getRuleSections()` once per page and hands the *same* array to every
`ruleList` block instance on it. This phase gives each Rule List block real
ownership of its own sections instead.

Decisions locked in during scoping:
- **Backfill target:** every existing `RuleSection` row (and its nested
  `Rule` rows come along automatically via the existing `section` FK) gets
  assigned to the Rule List block on the site's `/rules` page.
- **Delete behavior:** deleting a Rule List block (or its page) cascade-
  deletes the sections — and, transitively, the rules — it owns. Same real,
  destructive behavior change as Phase 25.
- **`sectionIds` filter:** dropped entirely, not kept. Unlike Post List's
  `tag`/`limit` (which narrow *within* one block's own posts), `sectionIds`
  only ever existed to hand-pick across a shared pool — once each block owns
  its sections outright, there's nothing left for it to filter. A Rule List
  block just shows all the sections it owns, in `order`.

### Data model change

```prisma
model RuleSection {
  id          String @id @default(cuid())
  order       Int
  title       String
  description String
  rules       Rule[]
  block       Block  @relation(fields: [blockId], references: [id], onDelete: Cascade)
  blockId     String
}

model Block {
  // ...existing fields unchanged...
  ruleSections RuleSection[]
  // (features/posts relations added by Phases 25/27)
}
```

`Rule` itself needs no schema change — it's already owned by `RuleSection`
via `sectionId` (`onDelete: Cascade`), so ownership flows through
transitively; a rule's owning block is always "whatever block owns its
section." Same two-step migration approach as Phase 25 (`blockId` nullable →
hand-inserted `UPDATE RuleSection SET blockId = '<rules page's ruleList
block id>' WHERE blockId IS NULL` → NOT NULL in a follow-up migration) —
look up the real block id from the dev DB first, don't guess.

### API / data-layer changes
- `lib/content.ts`: replace `getRuleSections()` with a block-scoped
  `getRuleSectionsByBlockIds(blockIds: string[])`.
- `components/pages/page-renderer.tsx:33-44`: fetch keyed by the `ruleList`
  block ids on the page instead of one page-wide call; `ReferenceData.ruleSections`
  (registry.tsx:47-51) becomes `ruleSectionsByBlockId?: Record<string,
  SectionWithRules[]>`; `registry.tsx`'s `ruleList` entry reads
  `referenceData.ruleSectionsByBlockId?.[block.id] ?? []` instead of
  `referenceData.ruleSections ?? []`.
- `app/api/rule-sections/route.ts` (`POST`): require `blockId` in the body,
  validate it references an existing block with `type === "ruleList"`.
- `app/api/rule-sections/[id]/route.ts`, `app/api/rules/*`: no ownership
  changes needed — editing/deleting a section or rule, and creating a rule
  under an existing `sectionId`, doesn't change which block owns it.
- `ruleListDataSchema` (`lib/validation/pages.ts`): drop `sectionIds`.
  `RuleListData` becomes an effectively empty `{}` — `Block.data` for a
  `ruleList` block no longer needs to carry anything.

### Component changes
- `components/rules/rules-editor.tsx`: remove the `sectionIds` /
  `MultiSelectChecklist` filter UI and the `data`/`onSaveData` plumbing it
  used (lines ~15, 55-56, 69-71, 242-250) — a Rule List block now just
  renders all the sections it owns. Needs a new `blockId` prop (from
  `registry.tsx`'s `block.id`) so `addSection` can send it to
  `POST /api/rule-sections`.
- `components/blocks/registry.tsx`: `ruleList` entry passes `blockId={block.id}`
  and reads from `referenceData.ruleSectionsByBlockId`; update the Phase
  18/19-era doc comment (lines 27-43, 201-218) that currently explains the
  shared-pool-with-filter design, since it'll not longer be accurate for this
  block type once Rule List/Feature Grid stop working that way.

### Files
- `prisma/schema.prisma` + new migration(s)
- `lib/content.ts`
- `components/pages/page-renderer.tsx`
- `components/blocks/registry.tsx`
- `components/rules/rules-editor.tsx`
- `app/api/rule-sections/route.ts`
- `lib/validation/pages.ts`

### Testing
- Create two Rule List blocks, add different sections/rules to each from
  their own admin editor — confirm zero overlap, no cross-block picker.
- Confirm pre-existing sections/rules all land under the `/rules` page's
  Rule List block after migrating.
- Delete a Rule List block that owns sections — confirm the sections and
  their nested rules are actually gone (cascade), not orphaned.

---

## Phase 27 — Feature Grid blocks each own their own features (no shared pool)

### Why this phase exists

Same pattern again, third and (per the current registry) last block type
that needs it: Feature Grid blocks all read from one site-wide `Feature`
table, narrowed per instance only by an optional `featureIds` hand-pick
(`components/features/features-editor.tsx:15,37,187-195`). `hero` is the
only other data-referencing block type (`components/blocks/registry.tsx:47-51`
`ReferenceData`), and it doesn't fit this pattern — it reads a single
site-wide content singleton (`getSiteContent()`) with a per-instance
heading/tagline *override* already stored directly on `block.data`, not a
shared collection filtered by an ID list — so it's unaffected and out of
scope here.

Decisions locked in during scoping (identical to Phase 26's, applied to
Feature Grid):
- **Backfill target:** every existing `Feature` row gets assigned to the
  Feature Grid block on the site's `/features` page.
- **Delete behavior:** deleting a Feature Grid block (or its page) cascade-
  deletes the features it owns.
- **`featureIds` filter:** dropped entirely — a Feature Grid block just
  shows all the features it owns, in `order`.

### Data model change

```prisma
model Feature {
  id          String  @id @default(cuid())
  order       Int
  eyebrow     String
  title       String
  description String
  icon        String
  accent      Boolean @default(false)
  block       Block   @relation(fields: [blockId], references: [id], onDelete: Cascade)
  blockId     String
}
```

Same two-step migration approach as Phases 25/26 (`blockId` nullable →
hand-inserted `UPDATE Feature SET blockId = '<features page's featureGrid
block id>' WHERE blockId IS NULL` → NOT NULL in a follow-up migration).

### API / data-layer changes
- `lib/content.ts`: replace `getFeatures()` with a block-scoped
  `getFeaturesByBlockIds(blockIds: string[])`.
- `components/pages/page-renderer.tsx`: fetch keyed by the `featureGrid`
  block ids on the page; `ReferenceData.features` becomes
  `featuresByBlockId?: Record<string, Feature[]>`; `registry.tsx`'s
  `featureGrid` entry reads `referenceData.featuresByBlockId?.[block.id] ??
  []` instead of `referenceData.features ?? []`.
- `app/api/features/route.ts` (`POST`): require `blockId` in the body,
  validate it references an existing block with `type === "featureGrid"`.
- `app/api/features/[id]/route.ts`: no ownership change needed.
- `featureGridDataSchema` (`lib/validation/pages.ts`): drop `featureIds`.
  `FeatureGridData` becomes an effectively empty `{}`.

### Component changes
- `components/features/features-editor.tsx`: remove the `featureIds` /
  `MultiSelectChecklist` filter UI and its `data`/`onSaveData` plumbing
  (lines ~15, 37, 59-61, 187-195). Needs a new `blockId` prop so `addFeature`
  can send it to `POST /api/features`.
- `components/blocks/registry.tsx`: `featureGrid` entry passes
  `blockId={block.id}` and reads from `referenceData.featuresByBlockId`.

### Files
- `prisma/schema.prisma` + new migration(s)
- `lib/content.ts`
- `components/pages/page-renderer.tsx`
- `components/blocks/registry.tsx`
- `components/features/features-editor.tsx`
- `app/api/features/route.ts`
- `lib/validation/pages.ts`

### Testing
- Create two Feature Grid blocks, add different features to each — confirm
  zero overlap, no cross-block picker.
- Confirm pre-existing features all land under the `/features` page's
  Feature Grid block after migrating.
- Delete a Feature Grid block that owns features — confirm those `Feature`
  rows are actually gone (cascade), not orphaned.

### Sequencing note (Phases 25-27)
All three touch `page-renderer.tsx`, `registry.tsx`, and
`lib/validation/pages.ts` in overlapping ways (each adds its own
`*ByBlockId` map to `ReferenceData` and drops its own filter field from the
corresponding schema). They're independent in principle, but doing them in
one combined pass through those three shared files — rather than three
separate passes that each touch the same files — avoids merge churn. Doesn't
have to happen in one sitting, just worth landing as one PR/commit sequence
rather than interleaving with unrelated work.
