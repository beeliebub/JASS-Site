# JASS Site — Phased Implementation Plan

Phases 0–17 are complete and shipped (block-based CMS, theming, resource-pack hosting,
the setup wizard, admin-authored custom themes, self-service password change, a round
of block-builder expansion, admin chrome/mobile fixes, and site-wide favicon +
link-share defaults). Their full specs no longer live in this file for phases 0–15 —
`git show 8036bf5:PLAN.md` has the complete historical document if you need it; phases
16–17 retain their full specs below as documentation of what was built. This file now
tracks only Phases 18–21 below, scoped 2026-07-11 from a fresh batch of feature/bugfix
requests. **None of Phases 18–21 have started implementation yet** — this is a
locked-in scope document awaiting a separate go-ahead per phase.

---

## How to use this plan

### Agent-dispatch conventions

Each phase contains: **Goal · Prerequisite reading · Design/locked-in decisions · DB
migration · Steps (numbered, per-file specs) · API contracts (where relevant) ·
Security checklist · Verification · Agent dispatch**. When executing a phase:

1. Have every dispatched agent read the phase's *Prerequisite reading* files first.
2. Dispatch implementation agents per the *Agent dispatch* subsection.
3. Run the named review agents (`security-reviewer`, `react-reviewer`/`typescript-reviewer`,
   `code-reviewer`) before closing the phase. Where a phase marks security review
   **mandatory**, treat that as a hard gate, not optional.
4. Run the *Verification* list end-to-end (live, in a real browser where UI is
   involved — not just `tsc`/`lint`) before marking a phase done.
5. Commit per phase (conventional commits: `feat: …`), never mid-phase broken states.

### Machine quirks (this machine's Node crashes — see CLAUDE.md for full detail)

- `npm install`: if it crashes with the `InductionVariablePhiTypeIsPrefixedPoint` V8
  fatal error, retry as `NODE_OPTIONS="--jitless" npm install ...` (breaks WASM, so
  never use it for Prisma).
- Prisma CLI: `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name <name>`
  (not `npx`, `--no-turbofan` must go directly on the `node` invocation).

### Project conventions every agent must follow

- **API envelope**: all JSON API routes use `lib/api-response.ts` helpers (`apiSuccess`,
  `apiError`, `unauthorized`, `notFound`, `badRequest`, `conflict`, `validationError`,
  `internalError`).
- **Auth gates**: mutations require `requireAdmin()` (or `requireOwner()`) from
  `lib/auth-guard.ts`, checked *inside the route handler* — never rely on UI gating.
- **Validation**: Zod schemas live in `lib/validation/*`; validate every body with
  `safeParse` and return `validationError(...)` on failure.
- **Cache invalidation**: call `revalidatePath()` for every path a mutation affects.
- **Design tokens**: colors/radii are CSS custom properties in `app/globals.css`,
  exposed to Tailwind via `@theme inline`. Never hardcode hex values in components.
- **Data layer**: server components read via `lib/content.ts`/Prisma directly — no
  self-fetching of our own API from server code.
- **Uploads**: images go through the existing content-addressed `UploadedImage`
  pipeline (`lib/uploads.ts`, `app/api/uploads/images/route.ts`) — reuse it, don't
  invent a second upload path.
- **Prisma 7**: config lives in `prisma.config.ts`; client generated into
  `app/generated/prisma`, instantiated with the better-sqlite3 driver adapter in
  `lib/prisma.ts`.

---

## Phase 16 — Admin UI stabilization (chrome, mobile theme picker, custom themes) — COMPLETE

### Goal

Fix three UI defects: (1) every "Site Management" admin page (`/admin/pages`,
`/admin/nav`, `/admin/themes`, `/admin/users`) renders with no header or footer; (2)
the visitor-facing theme picker popover overflows off the left edge of the viewport on
narrow/mobile screens and can't be interacted with; (3) the admin custom-theme editor
has UI stability issues and must behave identically for every user with access.

### Prerequisite reading

`components/pages/site-chrome.tsx` · `app/admin/page.tsx` (currently self-wraps in
`SiteChrome` — becomes the one place that stops doing so) ·
`app/admin/{pages,nav,themes,users}/page.tsx` · `components/theme/theme-picker.tsx` ·
`components/admin/custom-themes-admin.tsx` · `components/site-footer.tsx`.

### Design decisions

1. **Root cause of the missing chrome**: there is no `app/admin/layout.tsx`. Only
   `app/admin/page.tsx` renders `<SiteChrome>` itself; every other `/admin/**` route
   just renders a bare `<Container>` inside the root layout's `<body>`, with no
   `SiteHeader`/`SiteFooter` at all. **Fix**: add `app/admin/layout.tsx` wrapping every
   admin route in one `<SiteChrome theme={null} customThemeTokens={null}>` — the
   single per-route-group integration point, matching how every other route already
   gets its chrome. `app/admin/page.tsx` must stop wrapping itself (drop its own
   `SiteChrome` import/usage) to avoid a doubled header/footer. Each page's own
   `auth()`-based redirect-to-`/login` guard stays exactly where it is (per-page, not
   hoisted) — not in scope to change.
2. **Root cause of the mobile overflow**: `theme-picker.tsx`'s panel is
   `absolute bottom-full right-0 ... w-72`, anchored to its trigger button at the
   right edge of the footer's flex row. On any viewport narrower than roughly 288px
   plus the trigger's offset from the left edge, the fixed-width panel runs off the
   left of the screen with nothing clamping it back into view. **Fix**: make the panel
   `fixed inset-x-4 bottom-20` (viewport-clamped) below the `sm:` breakpoint, and keep
   today's `absolute bottom-full right-0 w-72` from `sm:` up — i.e.
   `className="fixed inset-x-4 bottom-20 z-50 ... sm:absolute sm:inset-x-auto sm:bottom-full sm:right-0 sm:mb-2 sm:w-72"`.
   Desktop stays pixel-identical; only small screens change.
3. **Custom themes admin stability**: known-suspect area to fix first —
   `ColorField`'s per-swatch picker popovers (`custom-themes-admin.tsx`) have no
   click-outside/Escape handling, unlike `theme-picker.tsx`'s panel, so multiple can be
   left open simultaneously and stack unpredictably. Add the same
   click-outside/Escape-close `useEffect` pattern `theme-picker.tsx` already uses.
   Beyond that specific bug, reproduce the reported "buggy"/"not uniform across users"
   behavior live in a real browser before deciding on further fixes — don't assume the
   data flow (`getCustomThemes()` fetched fresh per page load, mutated through the API)
   is the problem without confirming it.

### DB migration

None.

### Steps

1. `app/admin/layout.tsx` (new) — `SiteChrome` wrapper per decision 1.
2. `app/admin/page.tsx` — remove its own `SiteChrome` wrap.
3. `components/theme/theme-picker.tsx` — responsive positioning fix per decision 2.
4. `components/admin/custom-themes-admin.tsx` — click-outside/Escape handling on
   `ColorField`'s popover; fix whatever else reproduces live per decision 3.

### Security checklist

- [ ] Every `/admin/**` page still redirects unauthenticated visitors to `/login` —
      the new layout must not bypass any per-page `auth()` check.

### Verification

1. `/admin/pages`, `/admin/nav`, `/admin/themes`, `/admin/users` all render header +
   footer, identical to every other page.
2. `/admin` itself shows exactly one header and one footer (no doubling).
3. On a real mobile viewport (or ≤375px devtools emulation), the footer theme picker
   opens fully on-screen with every control reachable/tappable.
4. Two admin sessions (or one hard-refreshed) see identical custom-theme behavior.
5. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

Single frontend agent — small, contained. `code-reviewer` pass after.

---

## Phase 17 — Site settings: favicon + link-share (embed) defaults — COMPLETE

Shipped 2026-07-11. Implementation notes/deviations from the original spec below, kept
for anyone touching this area later:

- `POST /api/uploads/images`' response gained an `id` field (the `UploadedImage` row's
  id, alongside the existing `url`/`sha1`/`mime`/`size`) -- the admin settings UI needs
  a real id to send as `faviconImageId`/`embedImageId`, which the original response
  shape didn't carry. Additive/backward-compatible; `image-block.tsx` only ever read
  `url`.
- `app/opengraph-image.tsx` (a pre-existing Phase 9 file-based OG image route) had to be
  taught to render the custom embed image, in addition to `app/layout.tsx`'s
  `generateMetadata()` -- Next.js gives file-based image metadata conventions strict
  priority over `openGraph.images` set via the metadata object/`generateMetadata`, so
  the embed image would never have shown up in a real link preview otherwise. See
  `getEmbedImageAsset()` in `lib/site-settings.ts`.
- `app/page.tsx` (Home) layers the same embed-text fallback as the root layout, on top
  of its own existing CMS-driven title/description -- per-segment `generateMetadata`
  fully replaces (not merges with) the parent layout's `title`/`description`/
  `openGraph`/`twitter`, so without this the fallback text would have had zero visible
  effect on `/`, the site's most commonly shared link. Rules/Features/News/custom pages
  were left untouched (their titles are page-specific content, not "the site's" generic
  identity).
- Both `app/icon.tsx` and `app/opengraph-image.tsx` export `dynamic = "force-dynamic"`
  -- these code-based image Route Handlers are cached by default, and a plain
  `await prisma...` call does not by itself opt a route out of that caching (unlike
  Server Component pages). Without this, both served stale renders after a
  `SiteSettings` change until the cache happened to be invalidated.

### Goal

Give admins a place to (a) change the browser-tab icon, and (b) control what a Discord
(or Slack/iMessage/etc.) link preview shows when someone shares a link to the site — a
custom preview image, and, when no image is set, custom fallback title/description
text. Both are **site-wide** settings (per the locked-in scope decision — not
per-page), configured from a new admin area.

### Prerequisite reading

`prisma/schema.prisma` (`UploadedImage`) · `lib/uploads.ts` ·
`app/api/uploads/images/route.ts` · `components/blocks/image-block.tsx` (upload-widget
pattern to reuse) · `app/layout.tsx` (current static `metadata`) · `lib/site-config.ts`
· `lib/content.ts` (`getSiteContent`'s upsert-on-read pattern to mirror) ·
`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/app-icons.md`
(Next 16's dynamic icon file convention — read before writing `app/icon.tsx`).

### Design decisions

1. New `SiteSettings` singleton row (fixed id, upsert-only) rather than overloading the
   generic `ContentBlock` key-value store — these fields have a stronger shape
   (validated image references, bounded text) that benefits from real columns and one
   Zod schema, matching the `CustomTheme` field-per-token precedent.
2. **Favicon**: reuses the existing `UploadedImage` pipeline — `SiteSettings.faviconImageId`
   is a nullable FK. Served via Next's dynamic `app/icon.tsx` (read the doc above for
   the exact API), which reads `SiteSettings` at request time and streams the uploaded
   image, falling back to the existing static `app/favicon.ico` when unset (that file
   is never deleted — it's the permanent fallback).
3. **Embed image**: same pipeline, `SiteSettings.embedImageId`. When set, it feeds
   `app/layout.tsx`'s `metadata.openGraph.images`/`metadata.twitter.images`. This
   requires turning (or supplementing) the layout's currently-static `export const
   metadata` into a `generateMetadata()` that reads `SiteSettings` — verify against the
   installed Next docs that this doesn't force the whole tree into dynamic rendering
   (metadata generation and page-rendering strategy are independent in Next, but
   confirm rather than assume, echoing Phase 9's care around the root layout).
4. **Fallback text**: `SiteSettings.embedTitle`/`embedDescription`, both nullable —
   null means "use today's hardcoded `siteConfig.name`/`siteConfig.tagline`", so this
   ships with zero visible change until an admin opts in. Only used when
   `embedImageId` is null, per the original ask ("in the absence of an image").
5. New `/admin/settings` page (added to `app/admin/page.tsx`'s `managementLinks`),
   `requireAdmin()`-gated like every other management surface (no owner-only carve-out).

### DB migration

```prisma
model SiteSettings {
  id               String         @id @default("singleton")
  faviconImageId   String?
  faviconImage     UploadedImage? @relation("SiteSettingsFavicon", fields: [faviconImageId], references: [id], onDelete: SetNull)
  embedImageId     String?
  embedImage       UploadedImage? @relation("SiteSettingsEmbed", fields: [embedImageId], references: [id], onDelete: SetNull)
  embedTitle       String?
  embedDescription String?
  updatedAt        DateTime       @updatedAt
  updatedBy        String?
}
```

(Add the two named back-relations to `UploadedImage`.) Run via the `--no-turbofan`
command from CLAUDE.md.

### Steps

1. Schema + migration above.
2. `lib/site-settings.ts` (new) — `getSiteSettings()` (upsert-on-read so the row always
   exists), returning resolved favicon/embed-image URLs in the same
   `/api/uploads/images/<sha1>.<ext>` shape the Image block already produces.
3. `lib/validation/site-settings.ts` (new) — `siteSettingsUpdateSchema`:
   `embedTitle`/`embedDescription` nullable, capped ~70/~200 chars (standard OG/Twitter
   card limits); `faviconImageId`/`embedImageId` nullable cuid strings, re-validated
   server-side against real `UploadedImage` rows before saving (never trust a
   client-supplied id blindly).
4. `app/api/site-settings/route.ts` — `GET` (public) + `PUT` (admin), `revalidatePath("/", "layout")`
   on update since it affects every page's metadata/icon.
5. `app/icon.tsx` (new) — dynamic icon per decision 2.
6. `app/layout.tsx` — extend metadata generation per decision 3, falling back to
   today's `siteConfig` values exactly when `SiteSettings` fields are unset.
7. `components/admin/site-settings-admin.tsx` (new) + `app/admin/settings/page.tsx`
   (new) — favicon upload, embed image upload (both reusing `image-block.tsx`'s
   file-input pattern), embed title/description fields (visibly disabled/hinted
   "falls back to the image above" when an embed image is set).
8. `app/admin/page.tsx` — add the Settings entry to `managementLinks`.

### Security checklist

- [ ] `PUT /api/site-settings` behind `requireAdmin()`.
- [ ] `faviconImageId`/`embedImageId` re-validated against real `UploadedImage` rows
      server-side.
- [ ] `app/icon.tsx` only serves bytes for a `sha1`/`ext` pulled from the DB row
      (already validated on write) — same defense-in-depth re-validation `lib/uploads.ts`
      already does elsewhere.
- [ ] Embed title/description only ever rendered through Next's `Metadata` API
      (auto-escaped) — never interpolated into a raw HTML string.

### Verification

1. Upload a custom favicon → tab icon changes site-wide; unset → falls back to the
   original static icon.
2. Set a custom embed image → a link-preview debugger (or pasting into Discord) shows
   it.
3. Clear the embed image, set custom title/description → preview falls back to that
   text, not `siteConfig` defaults.
4. Neither set → preview behaves exactly as before this phase (regression check).
5. Non-admin hitting `PUT /api/site-settings` → 401/403 envelope.
6. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

One backend agent (schema/validation/API/`lib/site-settings.ts`), one frontend agent
(admin UI + `app/icon.tsx` + layout metadata) — fix the `SiteSettings` shape as the
contract before splitting.

---

## Phase 18 — Per-instance block content (Post List, Rule List, Feature Grid, Hero) + news tag filtering & styling

### Goal

Today `hero`, `ruleList`, `featureGrid`, and `postList` are intentional site-wide
singletons (a Phase 15 design decision, documented in `registry.tsx`'s
`ADDABLE_BLOCK_TYPES` comment): every instance of a given type, anywhere on the site,
renders identical content, because `PageRenderer` fetches each referenced table once
per page and hands the full result to every block of that type. **Per explicit scope
decision, this phase reverses that** for all four block types: each instance gets its
own optional display-level filter/override, so two instances of the same block type on
different pages can show different subsets. The driving concrete case: Post List
instances can be filtered to one tag, and tags get real visual styling instead of
plain muted text.

### Prerequisite reading

`components/blocks/registry.tsx` (the `ADDABLE_BLOCK_TYPES` comment this phase
partially supersedes) · `components/pages/page-renderer.tsx` ·
`components/news/{posts-editor.tsx,news-post-item.tsx,posts-data.ts}` ·
`components/rules/rules-editor.tsx` · `components/features/features-editor.tsx` ·
`components/home/hero.tsx` · `lib/validation/pages.ts` (block data schemas) ·
`prisma/schema.prisma` (`Post.tag`).

### Locked-in decisions

1. **Filtering is display-time, layered on the existing global fetch — not a
   data-model change.** `PageRenderer` keeps fetching the full `ruleSections`/
   `features`/`posts` arrays once per page exactly as today (cheap for a single
   Minecraft server's dataset). Each block instance's own `Block.data` gains optional
   filter fields; the block component applies the filter to the already-fetched full
   array before rendering. Smallest change that satisfies the ask without touching the
   underlying tables.
2. **Editors keep managing the full global list in edit mode, unchanged.** Adding/
   editing/deleting a rule, feature, or post from any instance still affects the one
   real underlying row — structured data stays in shared tables, per the original
   Phase 8 CMS principle. Only the non-edit-mode (visitor-facing) view is filtered.
   In edit mode, each editor additionally shows a "Showing: `<selection>` (N of M)"
   indicator plus the new selection control, so admins aren't confused about content
   that's hidden from the live view but still fully editable.
3. **Per-block-type filter shape** — all new fields optional; unset/null = show
   everything, i.e. today's exact behavior (no data migration; existing `Block` rows
   stay valid):
   - `postList`: `{ tag?: string | null; limit?: number | null }`. `tag` matches
     `Post.tag` exactly (case-sensitive, freeform, matching today's values); `limit`
     caps the displayed count, most-recent-first. Tag options offered in the
     edit-mode `<select>` come from the distinct values already present in the
     `posts` array already threaded through as `referenceData` — no new API call.
   - `ruleList`: `{ sectionIds?: string[] | null }` — checklist of existing
     `RuleSection`s from `referenceData.ruleSections`; unset/empty = all sections.
   - `featureGrid`: `{ featureIds?: string[] | null }` — same pattern against
     `referenceData.features`.
   - `hero`: no natural "subset" (it's one live-status widget, not a list) — instead
     `{ headingOverride?: string | null; taglineOverride?: string | null }`. Set =
     this instance shows the override text instead of the global `ContentBlock` hero
     text; the live server-status ping itself stays global (there's only one server —
     it can never be "unique per instance"). Unset = renders exactly as today.
4. **Tag visual styling**: `NewsPostItem`'s tag (currently bare
   `text-[11px] ... text-muted` text, `components/news/news-post-item.tsx`) becomes a
   pill/badge. Reuse the token approach from `components/blocks/tones.ts` rather than a
   new hardcoded color, so it themes correctly across every built-in and custom theme.
   Default: one consistent accent-tinted pill (`border-accent/30 bg-accent/10
   text-accent`, matching the existing "Latest" badge's color family) — no per-tag
   color mapping (freeform tag text has no fixed palette to map from; out of scope).
5. Update `registry.tsx`'s `ADDABLE_BLOCK_TYPES` doc comment to describe the new
   per-instance-filter behavior instead of "always the same site-wide content."

### DB migration

None — all new fields live inside the existing `Block.data` JSON string, validated by
extending the relevant Zod schemas.

### Steps

1. `lib/validation/pages.ts` — extend the four data-referencing types' schemas with
   the optional fields from decision 3 (confirm their current shape first — they may
   validate as bare `{}` today — and extend in place).
2. `components/blocks/registry.tsx` — `defaultBlockData` for the four types gains the
   new fields, defaulted unset/null; update the doc comment per decision 5.
3. `components/news/posts-editor.tsx` — accept optional `filterTag`/`limit` props;
   filter only in the non-edit-mode view; in edit mode show the "Showing X of Y"
   indicator plus a `<select>`/number input wired to `onSaveData`, following the exact
   persistence pattern `link-grid-block.tsx`'s `ToneSelect`/`saveHeading` already use.
4. `components/rules/rules-editor.tsx` / `components/features/features-editor.tsx` —
   same pattern via a new small shared `components/admin/multi-select-checklist.tsx`.
5. `components/home/hero.tsx` — accept optional heading/tagline overrides. Note `Hero()`
   is currently a props-less async Server Component (`page-renderer.tsx` calls it bare
   and hands the result down as `block.heroContent`, ignoring `block.data` entirely) —
   `page-renderer.tsx`'s `hero` branch must read `block.data` before calling `<Hero />`.
6. `components/blocks/registry.tsx`'s `blockComponents` entries for the four types —
   wire the new props through from `block.data`.
7. `components/news/news-post-item.tsx` — pill-style tag per decision 4.
8. `components/pages/page-renderer.tsx` — no change to the fetch strategy (decision 1);
   only what's passed into each block instance changes (steps 3–5 read it off
   `block.data` directly).

### Security checklist

- [ ] `sectionIds`/`featureIds`/`tag` validated server-side as plain strings/string
      arrays with length caps — filter keys only, never rendered as HTML or used in
      raw queries.
- [ ] `headingOverride`/`taglineOverride` render through React's normal escaping, same
      as every other `EditableText`-driven field — no new sanitization needed.

### Verification

1. A second Post List block on a custom page, filtered to one tag, shows only that
   tag's posts; the original News page's (unfiltered) Post List still shows everything.
2. In edit mode on the filtered instance, the "Showing tag X (N of M)" indicator
   appears and any post (including ones outside the filter) is still fully editable.
3. Same pattern verified for a filtered Rule List and a filtered Feature Grid on a
   custom page.
4. A Hero block with a heading override shows the custom heading; the live
   server-status ping still reflects the real server.
5. Existing Home/Rules/Features/News pages (pre-existing rows, no new fields set)
   render identically to before this phase.
6. Tags render as a visible, legible pill on the News page and inside Post List
   blocks — spot-checked on every built-in theme plus at least one custom theme.
7. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

Split by shared dependency: one agent builds `multi-select-checklist.tsx` first (both
Rule List and Feature Grid depend on it), then in parallel — one agent for
Rule List + Feature Grid, one for Post List + news tag styling, one for Hero
(touches the shared `page-renderer.tsx`, so keep it isolated and careful). `code-reviewer`
plus a live-verification pass before closing (no automated test suite covers this).

---

## Phase 19 — Image sizing controls + Link Grid images

### Goal

Let admins control an Image block's displayed size (exact pixel dimensions, or a
proportional scale), and add an optional image to each Link Grid item (shown to the
left of its title/description, sized to the grid cell).

### Prerequisite reading

`components/blocks/image-block.tsx` · `components/blocks/link-grid-block.tsx` ·
`lib/validation/pages.ts` (`imageDataSchema`, `linkGridDataSchema`).

### Design decisions

1. **Image block sizing**: two modes, both optional (unset = today's exact behavior —
   full-width, `object-cover`, natural aspect ratio in a `max-w-2xl` figure).
   `ImageData` gains `sizeMode?: "scale" | "custom"`, `scale?: number` (percentage,
   e.g. 10–100, only meaningful when `sizeMode === "scale"` — the "proper scaling"
   ask: a percentage of the block's natural container width, responsive), `width?:
   number` / `height?: number` (pixels, only meaningful when `sizeMode === "custom"` —
   the "direct specification" ask; either may be set alone to preserve aspect ratio via
   `auto`, or both for an exact box; capped at a sane max, e.g. 2000px, so a typo can't
   blow out the layout).
2. **Link Grid images**: `QuickLink` gains `image?: string` (same URL convention as
   `ImageData.src` — reuses the identical upload widget from `image-block.tsx`, not a
   new upload path). Rendered as a fixed-size thumbnail to the left of the title +
   description (flex row instead of today's flex column) within each grid cell, sized
   to roughly the cell's height. Absent `image` = today's exact layout.

### DB migration

None — both are new optional fields inside existing `Block.data` JSON.

### Steps

1. `lib/validation/pages.ts` — extend `imageDataSchema` with `sizeMode`/`scale`/
   `width`/`height` (bounded per decision 1). Extend `linkGridDataSchema`'s per-item
   shape with optional `image: z.string().max(2000).optional()`.
2. `components/blocks/image-block.tsx` — edit-mode controls: mode toggle
   (Scale / Custom size / Original), percentage input for Scale, width/height number
   inputs for Custom, applied via inline `style` (numeric `width`/`height` px, or
   `width: "<scale>%"` + `height: "auto"` for Scale) — not Tailwind classes, since
   values are admin-chosen numbers.
3. `components/blocks/link-grid-block.tsx` — per-item image upload control (mirroring
   `image-block.tsx`'s file-input + `/api/uploads/images` pattern); render a
   fixed-size thumbnail (e.g. `h-16 w-16`, `object-cover`, rounded) to the left of the
   title/description column when `link.image` is set.

### Security checklist

- [ ] `width`/`height`/`scale` are numeric, bounded, and applied only via numeric
      inline `style` properties — validated as numbers server-side, never a
      passthrough string that could carry arbitrary CSS.
- [ ] Link Grid images reuse the exact same upload pipeline/validation as the Image
      block — no new upload surface.

### Verification

1. Image block at Scale 50% → renders at half its container width, aspect ratio
   preserved, responsive on resize.
2. Image block at Custom 400×300 → renders at exactly that box.
3. An existing Image block with sizing unset → renders exactly as before this phase.
4. A Link Grid item with an image → thumbnail appears to the left, consistent with
   its siblings; an item with no image looks exactly as it does today.
5. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

Single frontend agent (both blocks are small, self-contained changes); `code-reviewer`
after.

---

## Phase 20 — Editable page slug & browser-tab title in /admin/pages

### Goal

Let admins change a (non-protected) page's slug and its browser-tab title
(`Page.title`, already used by `generateMetadata` as the `<title>`) directly from the
`/admin/pages` table, at any time — today `title` is only set once via a
`window.prompt()` at creation, and slug has no edit UI at all.

### Prerequisite reading

`components/admin/pages-admin.tsx` · `app/api/pages/[id]/route.ts` ·
`lib/validation/pages.ts` (`pageUpdateSchema`, `protectedSlugChangeError`) ·
`app/[slug]/page.tsx` (`generateMetadata`).

### Design decisions

1. **No backend work needed** — confirmed `PUT /api/pages/[id]` already accepts and
   validates both `title` and `slug` in `pageUpdateSchema`, already re-checks
   `protectedSlugChangeError` (protected-page slug changes already rejected
   server-side), and already rejects slug collisions with `conflict()`. This phase is
   UI-only.
2. Reuse the existing `EditableText` component for both fields (matching every other
   inline-editable field in the CMS) rather than inventing a new edit affordance.
3. On success, refresh so the slug column and any cross-linked "Edit" button href
   update immediately; surface server errors via the existing `showError` toast
   pattern already used throughout `pages-admin.tsx`.
4. Protected pages' slug cell stays plain text (not editable) — the server already
   rejects the change, and an editable control that always fails is a bad dead end.
   Title stays editable even for protected pages (only slug is protected).

### DB migration

None. No new API routes — reuses `PUT /api/pages/[id]` exactly as it exists today.

### Steps

1. `components/admin/pages-admin.tsx` — replace the static title cell with an
   `EditableText` bound to a new `saveTitle` handler (optimistic update + revert on
   error, matching every other mutator already in this file). Replace the static slug
   cell (non-protected pages only) with an `EditableText` bound to a new `saveSlug`
   handler, with a friendly client-side format pre-check (full enforcement stays
   server-side).

### Security checklist

- [ ] Confirm — don't just assume — `protectedSlugChangeError` is still enforced with
      no regression after the UI change.
- [ ] Title/slug still validated server-side (`pageUpdateSchema`) regardless of any
      client-side pre-check.

### Verification

1. Rename a custom page's title inline → tab title reflects the change on next
   navigation; the "New page" creation flow still works.
2. Change a custom page's slug inline → old URL 404s, new URL serves the page; any
   NavItem pointing at that page still resolves (it's keyed by `pageId`, not a cached
   slug string — confirm this holds).
3. Protected page → no editable slug control shown (or, if attempted directly via
   API, still rejected).
4. Slug collision with an existing page → inline error via toast, no partial state
   change.
5. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

Single frontend agent, small scope; `code-reviewer` after.

---

## Phase 21 — Audit log with single-step undo

### Goal

Every admin mutation across the CMS (pages, blocks, nav items, custom themes, users,
resource pack, and Phase 17's site settings) is recorded in an audit log visible in the
admin panel, and any entry can be undone — reverting that specific entity to its state
immediately before that mutation. **Per explicit scope decision this is single-step
revert per entity, not a branching/redo-capable history**: undoing an entry always
restores the stored "before" snapshot for that one entity, regardless of what's
happened to it since.

### Prerequisite reading

Every mutation route this phase instruments — `app/api/pages/route.ts` + `[id]/route.ts`,
`app/api/blocks/**`, `app/api/nav-items/**` (confirm exact route names from
`components/admin/nav-admin.tsx`), `app/api/custom-themes/**`,
`app/api/users/[id]/route.ts`, `app/api/resource-pack/**`,
`app/api/site-settings/route.ts` (Phase 17) — plus `lib/api-response.ts`,
`lib/auth-guard.ts`.

### Locked-in decisions

1. **One `AuditLogEntry` model**, entity-agnostic: `entityType`
   (`"Page" | "Block" | "NavItem" | "CustomTheme" | "User" | "ResourcePack" | "SiteSettings"`),
   `entityId`, `action` (`"create" | "update" | "delete"`), `before` (JSON string, null
   for `create`), `after` (JSON string, null for `delete`), `actorEmail`, `createdAt`.
   Same JSON-as-string convention `Block.data` already uses.
2. **Snapshots exclude secrets, always**: the `User` entity type's `before`/`after`
   snapshots must never include `passwordHash` — only `email`/`name`/`role`. Hard
   rule, not a nice-to-have.
3. **Writing an entry is the mutation route's own responsibility**, inside the same
   Prisma transaction as the mutation. A helper `lib/audit-log.ts`'s
   `recordAuditLog(tx, { entityType, entityId, action, before, after, actorEmail })`
   is called from every route in the Prerequisite-reading list — the single largest
   mechanical part of this phase.
4. **Undo mechanics per action type**:
   - Undo an `update` → re-applies the stored `before` JSON, re-validated through that
     entity's existing Zod schema before writing (schemas may have evolved since the
     snapshot was taken; reject with a clear error rather than write invalid data).
   - Undo a `delete` → recreates the row from the stored pre-delete snapshot with the
     same id, re-validated the same way; if recreation fails (e.g. a unique
     constraint collision since), reject with a clear `conflict()`, never partially
     apply.
   - Undo a `create` → deletes the entity if it still exists.
   - Undoing an already-undone entry, or one whose entity has changed since: **allowed,
     not blocked** — the UI shows a non-blocking staleness warning but doesn't prevent
     the action.
   - Cascades (e.g. undoing a Page delete restoring its Blocks) are **out of scope for
     v1**: undoing a Page delete restores the Page row only, not its cascade-deleted
     Blocks. Document this limitation directly in the admin UI next to the Page
     entity's undo action, not just here.
5. **Admin UI**: new `/admin/audit-log` page (added to `managementLinks`),
   `requireAdmin()`-gated like every other management surface, paginated table (entity
   type, action, actor, timestamp, expandable before/after diff, an "Undo" button with
   a confirm dialog surfacing the staleness warning from decision 4 when applicable).
6. **Retention**: no automatic pruning in v1 (unlike `ResourcePack`'s keep-3 policy) —
   a known future concern, not solved here; the single-step-revert scope explicitly
   bounds this phase's effort.

### DB migration

```prisma
model AuditLogEntry {
  id         String   @id @default(cuid())
  entityType String
  entityId   String
  action     String   // "create" | "update" | "delete"
  before     String?  // JSON snapshot, null for create
  after      String?  // JSON snapshot, null for delete
  actorEmail String?
  createdAt  DateTime @default(now())

  @@index([entityType, entityId])
}
```

### API contracts

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/audit-log` | admin | Paginated `{ data: AuditLogEntry[], nextCursor }`, newest-first, optional `?entityType=`/`?entityId=` filters. |
| `POST /api/audit-log/[id]/undo` | admin | Loads the entry, dispatches to the per-entity-type undo handler (decision 4), writes a **new** audit entry recording the undo itself (undoing is itself audited), `revalidatePath` for whatever the reverted entity affects (reuse each entity's existing revalidation targets), `200 { data: { entityType, entityId, result: "reverted" } }` or `conflict()` on failure. |

### Steps

1. Schema + migration above.
2. `lib/audit-log.ts` (new) — `recordAuditLog(tx, entry)` helper; per-entity-type
   `undoHandlers` map implementing decision 4, each re-validating via that entity's
   existing Zod schema.
3. Instrument every mutation route in the Prerequisite-reading list: wrap existing
   Prisma calls in `$transaction` where not already transactional, call
   `recordAuditLog` with before/after state. Mechanical but touches ~8–10 route files —
   the biggest time cost in this phase.
4. `app/api/audit-log/route.ts` (new, `GET`), `app/api/audit-log/[id]/undo/route.ts`
   (new, `POST`).
5. `components/admin/audit-log-admin.tsx` (new) + `app/admin/audit-log/page.tsx` (new).
6. `app/admin/page.tsx` — add the Audit log entry to `managementLinks`.
7. Relies on Phase 16's `app/admin/layout.tsx` for header/footer — no extra chrome
   work needed if Phase 16 has landed first.

### Security checklist

- [ ] `User` snapshots never include `passwordHash` (decision 2) — verify explicitly
      in the `User` entity's audit-write code path, not just by convention.
- [ ] `GET`/`POST /api/audit-log/**` both behind `requireAdmin()`.
- [ ] Undo re-validates restored data through the entity's existing Zod schema before
      writing — never a raw trust-the-snapshot write.
- [ ] Undo of a `delete` re-checks unique constraints (slug, name, email, sha1, etc.)
      the same way the original create path did, surfacing `conflict()` rather than
      crashing or silently corrupting state.
- [ ] The undo endpoint itself writes a new audit entry — undo is never a silent,
      untracked bypass of the audit trail.

### Verification

1. Edit a page's title → audit log shows an `update` entry with before/after → Undo
   reverts the title.
2. Delete a non-protected page → `delete` entry → Undo recreates the Page row (its
   Blocks do not come back, per the documented v1 limitation — confirm the UI actually
   surfaces this, not just PLAN.md).
3. Create a new custom theme → Undo removes it.
4. Change a user's role → inspect the raw DB row and confirm `passwordHash` never
   appears in either snapshot.
5. Undo an entry for an entity modified again afterward → staleness warning appears,
   undo still proceeds.
6. Non-admin hitting either audit-log route → 401/403 envelope.
7. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

Do not split carelessly — `lib/audit-log.ts`'s contract (step 2) must land first and
be fixed before any route instrumentation starts, since every other agent's work
depends on its exact function signature. Suggested split: one agent for
`lib/audit-log.ts` + schema + the two new API routes + the admin UI; a second agent (or
several, working file-by-file since routes are independent of each other)
instrumenting the existing mutation routes per step 3, once the helper's signature is
fixed. **`security-reviewer` pass is mandatory before this phase closes** (undo of
arbitrary past state, re-validation of stale data, and the secrets-in-snapshots rule
are all real risk surfaces) — matching Phase 10's mandatory review for its
highest-risk surface.
