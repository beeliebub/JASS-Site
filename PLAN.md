# JASS — Minecraft Server Website: Implementation Plan

A sleek, modern website that displays information about the Minecraft server, with an
admin-only login system that lets admins edit site content in place, in real time.

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router, TypeScript) | One codebase for UI + API routes; server components keep the public site fast |
| Styling | Tailwind CSS | Rapid, consistent styling; pairs well with a design-token system |
| Database | SQLite via Prisma | Zero-ops persistence for content + admin accounts; easy to migrate to Postgres later |
| Auth | Auth.js (NextAuth) with credentials provider | Session-based login; no public signup — accounts are seeded/invited only. Two roles: `OWNER` and `ADMIN` (Phase 8) — an `ADMIN` cannot edit, demote, or delete an `OWNER` |
| Server status | Minecraft Server List Ping (e.g. `minecraft-server-util`) | Live online/offline, player count, and MOTD straight from the server |
| Animations | CSS transitions + Framer Motion (sparingly) | Sleek/modern feel per the `motion-ui` skill — performance and accessibility first |
| Markdown rendering | `react-markdown` + `rehype-sanitize` (Phase 8) | Sanitized rendering for post bodies and RichText blocks — no raw HTML from the DB ever reaches the page unsanitized |

## Installed Skills (from ECC) and where they apply

- `frontend-design-direction`, `design-system`, `make-interfaces-feel-better`, `motion-ui` — visual direction, tokens, polish, motion (Phases 1, 6)
- `frontend-patterns`, `react-patterns`, `nextjs-turbopack` — component architecture, server/client boundaries, dev tooling (Phases 1–5)
- `backend-patterns`, `api-design`, `error-handling` — API routes, data layer, robust failure handling (Phases 2–5)
- `coding-standards` — baseline conventions across the whole project (all phases)

---

## Phase 0 — Project Scaffold

**Goal:** A running dev environment with the toolchain in place.

- [x] `create-next-app` with TypeScript, Tailwind, ESLint, App Router (Turbopack dev)
- [x] Add Prisma + SQLite; commit an initial empty schema and migration workflow
- [x] Project structure: `app/`, `components/`, `lib/`, `prisma/`
- [x] `.env` handling (`DATABASE_URL`, `AUTH_SECRET`, `MC_SERVER_HOST`/`MC_SERVER_PORT`)
- [x] CLAUDE.md documenting commands (dev, build, migrate, seed)

**Done when:** `npm run dev` serves a blank page; `prisma migrate dev` works.

## Phase 1 — Design System & Public Pages (static content)

**Goal:** The full public-facing site, looking sleek and modern, with placeholder content.

- [x] Define design tokens (per `design-system` skill): dark-first palette suited to a Minecraft aesthetic without being kitschy, type scale, spacing, radii, shadows
- [x] Layout shell: header with server name + nav, footer, responsive container
- [x] Pages:
  - [x] **Home** — hero with server name, tagline, IP with copy-to-clipboard, live status badge (stubbed for now)
  - [x] **Rules** — ordered, styled rule list
  - [x] **Features** — cards for gameplay features (custom enchants, claims, minigames from the Tweaks plugin)
  - [x] **News/Announcements** — reverse-chronological post list
- [x] Apply `make-interfaces-feel-better` pass: hover/focus states, hit areas, text wrapping, spacing rhythm
- [x] Mobile-first responsive check on all pages

**Done when:** Every public page renders with hardcoded content and looks finished.

## Phase 2 — Content Persistence

**Goal:** All editable content lives in the database, served through a clean API.

- [x] Prisma schema:
  - `ContentBlock` (key, JSON/markdown value, updatedAt, updatedBy) — for hero text, tagline, IP, etc.
  - `Rule` (order, text) — plus `RuleSection` for the grouping the UI already relies on
  - `Feature` (order, title, description, icon)
  - `Post` (title, body, publishedAt, author)
  - `User` (email, passwordHash, name, role=ADMIN)
- [x] Seed script that loads the Phase 1 placeholder content into the DB
- [x] Server components read content directly via a `lib/content.ts` data layer
- [x] REST API routes for mutations (`api-design` skill): `PUT /api/content/[key]`, CRUD for rules/features/posts — **auth-gated but stubbed open until Phase 3**
- [x] Consistent error envelope + input validation with Zod (`error-handling` skill)

**Done when:** Editing a DB row changes what the site renders; API routes pass manual tests.

## Phase 3 — Admin Authentication

**Goal:** Only admins can log in; sessions gate every mutation.

- [x] Auth.js credentials provider; bcrypt/argon2 password hashing
- [x] No public registration — seed the first admin via script; admins can invite/create other admins from a settings panel later
- [x] `/login` page styled to match the design system; generic error messages (no user enumeration)
- [x] Middleware protecting `/admin/**` routes and all mutation API routes (server-side session check — never trust the client) — note: Next.js 16 renamed Middleware to `proxy.ts`; page-level redirects live there, mutation routes are gated via `lib/auth-guard.ts`
- [x] Rate limiting on the login endpoint; secure/httpOnly session cookies; CSRF covered by Auth.js defaults
- [x] Logout + session expiry behavior

**Done when:** Mutation APIs return 401 without a session; a seeded admin can log in and out.

## Phase 4 — Real-Time In-Place Editing

**Goal:** A logged-in admin browses the normal site with an "edit mode" toggle; content is editable where it appears.

- [x] Global edit-mode toggle in the header (visible only to logged-in admins)
- [x] `Editable` component wrapper: renders plain content for visitors; in edit mode, click-to-edit inline (text fields, markdown textarea for posts)
- [x] Optimistic updates: UI changes instantly, saves via the Phase 2 APIs, rolls back on failure with a toast
- [x] List management inline: add/remove/reorder rules and features (drag or up/down controls)
- [x] Post editor: create/edit/publish/delete announcements
- [x] Revalidation so visitors see changes immediately (`revalidatePath`/tag-based)
- [x] Clear edit-mode affordances (dashed outlines, edit cursors) that never leak to logged-out visitors

**Done when:** An admin can change any piece of site content without leaving the page, and a visitor in another browser sees it on next load.

## Phase 5 — Live Server Status

**Goal:** Real server data on the site.

- [x] `GET /api/status` route that pings the Minecraft server (status + player count + MOTD), cached ~30s server-side to avoid hammering the server
- [x] Home hero status badge: online/offline, player count `x / max`, graceful "offline" state
- [x] Client polling (~30–60s) for the badge so it stays fresh without reloads
- [x] Error handling: timeouts, DNS failures → render "offline", never crash the page

**Done when:** The badge reflects reality when the server is started/stopped.

## Phase 6 — Polish & Deployment

**Goal:** Production-ready.

- [x] Motion pass (`motion-ui` skill): page transitions, hover micro-interactions, respects `prefers-reduced-motion`
- [x] Accessibility pass: keyboard nav, focus rings, contrast, semantic landmarks
- [x] Performance: Lighthouse ≥ 90s, image optimization, font loading
- [x] SEO/meta: titles, descriptions, Open Graph card with server branding
- [x] Production build + hosting decision (VPS alongside the MC server via Docker/PM2 + Caddy, or Vercel with a remote DB) — see `docs/DEPLOYMENT.md`; actual deployment to a live host is still outstanding
- [x] Backup story for the SQLite DB — see `scripts/backup-db.ts` / `npm run db:backup`, documented in `docs/DEPLOYMENT.md`

**Done when:** Deployed, reachable, and an admin can log in and edit in production.

## Phase 7 — Security Hardening

**Goal:** Close the gaps found in the pre-launch security review before this goes live.
Full findings write-up (what's already solid vs. what's below) lives in the
`jass-security-review` memory from the review conversation — this checklist is the
actionable subset.

- [x] **Security response headers** — add an async `headers()` export to
      `next.config.ts` (verify the exact Next 16 shape against
      `node_modules/next/dist/docs/` per CLAUDE.md before writing it — the API has been
      stable across Next majors but confirm rather than assume). Starting point, apply
      to `source: "/(.*)"`:
      - `Content-Security-Policy`: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'` — `style-src 'unsafe-inline'` is a pragmatic allowance for Next's injected `<style>` tags (next/font, Tailwind); tighten to a nonce-based policy later if desired, don't block on it now. **Deviation from the original draft:** `script-src` also needed `'unsafe-inline'` (not just `'self'`) — verified by testing: the App Router injects unnonced inline `<script>` tags on every page to stream the RSC payload (`self.__next_f.push(...)`), and a strict `script-src 'self'` blocked them outright, leaving pages fully unhydrated. Next's own CSP guide (`node_modules/next/dist/docs/.../content-security-policy.md`, "Without Nonces" section) confirms this is the expected allowance without a per-request-nonce setup (which would require `proxy.ts` changes + opting every page into dynamic rendering — deferred, not needed now). Test the whole site in `npm run dev` after adding this — a too-strict CSP silently breaks hydration/fetch and is easy to ship broken without checking.
      - `X-Content-Type-Options: nosniff`
      - `Referrer-Policy: strict-origin-when-cross-origin`
      - `Permissions-Policy: camera=(), microphone=(), geolocation=()` (none of these are used anywhere in the app)
      - `Strict-Transport-Security: max-age=63072000; includeSubDomains` — only meaningful once served over HTTPS (Caddy terminates TLS per `docs/DEPLOYMENT.md`); safe to send unconditionally since HTTP requests just ignore it
      - Drop the now-redundant `X-Frame-Options` in favor of `frame-ancestors 'none'` above (CSP's `frame-ancestors` supersedes it in all current browsers, but add `X-Frame-Options: DENY` too if targeting anything ancient — low cost either way)
- [x] **Audit trail on content edits.** `ContentBlock.updatedBy` exists in the schema but no route sets it. Fix as part of this phase (touches the same routes Phase 8 will later extend for `Page`/`Block`, so do it now to establish the pattern once):
      1. Add `getSessionUser()` to `lib/auth-guard.ts`: returns `{ id, email, role } | null` from `await auth()`.
      2. In `app/api/content/[key]/route.ts`'s `PUT`, pass `updatedBy: user.email` into both the `create` and `update` branches of the `prisma.contentBlock.upsert` call.
      3. This establishes the convention Phase 8 reuses for `Page.updatedBy` / `Block.updatedBy`.
- [x] **`AUTH_TRUST_HOST` behind Caddy.** NextAuth v5 needs to know it's behind a
      reverse proxy or session cookies/redirects can misbehave. Add
      `trustHost: true` to the `NextAuth({...})` config object in `auth.ts` (confirm
      this is still the correct v5 option name against the installed
      `next-auth@^5.0.0-beta.31` — it's a beta, check its actual type defs in
      `node_modules/next-auth` rather than assuming). Document in `docs/DEPLOYMENT.md`'s
      pre-deploy checklist as well, in case the code-level fix needs an env-var
      companion (`AUTH_URL` set to the real public URL) — check both.
- [x] **Per-IP login rate limit.** `lib/rate-limit.ts` currently only limits
      `email:ip` (5 attempts / 15 min). Add a second, more permissive ceiling keyed on
      IP alone (e.g. 20 attempts / 15 min across all emails from one IP) so one IP can't
      spray many different admin emails. Simplest approach: export a second function
      `checkIpRateLimit(ip: string): boolean` using the same `Map`-based fixed-window
      pattern (or a second `Map`), called from `auth.ts`'s `authorize()` alongside the
      existing `checkRateLimit(rateLimitKey)` check — reject if *either* check fails.
- [x] **Ops step, not code:** rotate `AUTH_SECRET` to a freshly generated value before
      any real production deploy (command already documented in `.env.example`). Add
      this as an explicit line item in `docs/DEPLOYMENT.md`'s pre-deploy checklist if
      it isn't already called out clearly enough there.
- [x] **Re-run `npm audit` before deploy.** As of the last check, 5 moderate findings
      are transitive dev-tooling only (Prisma's dev server via `@prisma/dev` /
      `@hono/node-server`, Next's bundled PostCSS) and not present in the production
      runtime; `npm audit fix --force` would downgrade to breaking major versions and
      should **not** be run. Re-verify this reasoning still holds at deploy time rather
      than trusting this note as dependencies drift.

**Done when:** every item above is checked, security headers are verified present on
live responses (`curl -I` against a running `npm run start`), and a `ContentBlock` edit
made through the UI shows a non-null `updatedBy` in `npx prisma studio`.

## Phase 8 — Dynamic Pages, Navigation & Roles

**[x] Complete.** Schema/migration, `isAdminRole`/`requireOwner`, validation,
data layer, all API routes (pages/blocks/nav-items/users), `create-admin
--role`, `seedPagesAndNav()`, the block renderer/editor library, the 4
rewired pages + `app/[slug]` + `app/news/[slug]`, the `SiteHeader` dropdown
nav, the 3 admin sub-routes, and sanitized markdown (`react-markdown` +
`rehype-sanitize`) are all in place and verified against the running dev
server (see the end-of-phase verification notes below the "Done when"
section for what was actually exercised and one blocking pre-existing bug
found along the way).

**Goal:** Replace the fixed page set with an admin-manageable block-based page builder,
admin-manageable header navigation (with one level of dropdowns), and an Owner/Admin
role hierarchy — building on the Phase 4 in-place editing UX (`EditableText`,
`list-controls.tsx`, optimistic-update-with-toast-rollback) rather than a separate
form-heavy back office. This is the big phase — land it as one coherent pass, not split
across parallel agents touching overlapping files, given how much of the data model and
rendering path changes at once. Do Phase 7 first or in parallel; it's small and
independent.

**Scope decisions locked in during scoping** (see `jass-cms-scope` memory for the
original rationale — restated here as the operative spec):
- Block-based builder; **all** of Home/Rules/Features/News migrate into it, protected
  from deletion/slug-changes but otherwise fully editable; News gains `/news/[slug]`
  detail pages with sanitized markdown; one level of header dropdown nesting; new
  `OWNER`/`ADMIN` role split where `ADMIN` cannot touch `OWNER` accounts.

### 1. Schema (`prisma/schema.prisma`)

```prisma
enum Role {
  OWNER
  ADMIN
}

model Page {
  id              String   @id @default(cuid())
  slug            String   @unique
  title           String
  metaDescription String?
  published       Boolean  @default(true)
  protected       Boolean  @default(false) // true for home/rules/features/news — blocks delete + slug change
  blocks          Block[]
  updatedAt       DateTime @updatedAt
  updatedBy       String?
}

model Block {
  id        String   @id @default(cuid())
  page      Page     @relation(fields: [pageId], references: [id], onDelete: Cascade)
  pageId    String
  order     Int
  type      String   // see block type library below — validated against a fixed set in Zod, not a DB enum, so new types don't need a migration
  data      String   // JSON, shape depends on `type` — see block type library
  updatedAt DateTime @updatedAt
  updatedBy String?
}

model NavItem {
  id       String    @id @default(cuid())
  label    String
  href     String?   // external URL; mutually exclusive with pageId
  page     Page?     @relation(fields: [pageId], references: [id])
  pageId   String?
  order    Int
  parent   NavItem?  @relation("NavItemChildren", fields: [parentId], references: [id], onDelete: Cascade)
  parentId String?
  children NavItem[] @relation("NavItemChildren")
}
```

Add the reverse `Page.navItems NavItem[]` relation field if Prisma requires it for the
`page`/`pageId` relation on `NavItem` (check the generated client — Prisma 7 may need
it explicit). `Block.data` is a JSON-as-string column (matches the existing
`ContentBlock.value: String` convention in this schema, i.e. no native SQLite JSON
type) — parse/stringify at the API boundary, validate the parsed shape with Zod per
`type` before storing.

**Critical gotcha — fix this or `OWNER` accounts get silently locked out:**
`lib/auth-guard.ts`'s `requireAdmin()` currently checks `role === "ADMIN"` exactly
(see the existing file), and `app/layout.tsx` independently computes
`const isAdmin = session?.user?.role === "ADMIN"`. Once `OWNER` exists, *both* of these
checks must accept `OWNER` too, or an `OWNER` account can log in but every mutation
route returns 401 and the edit-mode toggle never appears for them. Fix by adding one
shared helper and using it in both places:

```ts
// lib/auth-guard.ts
export function isAdminRole(role: string | undefined | null): boolean {
  return role === "ADMIN" || role === "OWNER";
}
export async function requireAdmin(): Promise<boolean> {
  const session = await auth();
  return isAdminRole(session?.user?.role);
}
export async function requireOwner(): Promise<boolean> {
  const session = await auth();
  return session?.user?.role === "OWNER";
}
export async function getSessionUser() {
  const session = await auth();
  return session?.user ? { id: session.user.id, email: session.user.email, role: session.user.role } : null;
}
```

Update `app/layout.tsx`'s `isAdmin` computation to `isAdminRole(session?.user?.role)` (import from `lib/auth-guard.ts`) instead of its own inline check.

### 2. Validation (`lib/validation/pages.ts`, new file)

Add a new file rather than growing `lib/validation/content.ts` further — this is a
separate domain. Define:
- `pageCreateSchema` / `pageUpdateSchema` — `{ title, slug? }` / partial, with a
  **reserved-slug check**: reject `admin`, `login`, `api`, plus the 4 fixed slugs
  (`home` is reserved as a concept but the home Page's actual slug can just be `""` or
  a sentinel like `"home"` depending on the routing approach chosen in step 5 — pick
  one and keep it consistent) if the target Page isn't itself the protected page that
  legitimately owns that slug. Also reject slug changes entirely when `protected: true`
  (return 409/400 from the route, not just a UI restriction).
- `blockDataSchemas`: a `z.discriminatedUnion("type", [...])` covering every block type
  below, each with its own `data` shape. Use this both to validate `POST /api/blocks`
  and `PUT /api/blocks/[id]` bodies.
- `navItemCreateSchema` / `navItemUpdateSchema` — `{ label, href?, pageId?, parentId?, order }`,
  with a refinement that exactly one of `href`/`pageId` is set, and a refinement that
  `parentId` (if set) refers to a *top-level* `NavItem` (i.e. reject creating a
  grandchild — enforces the one-level-deep decision at the validation layer, not just
  in the UI).
- `userCreateSchema` / `userUpdateSchema` — `{ email, password, name?, role }` /
  partial, `role` restricted to the `Role` enum.

### 3. Block type library

Every block type maps to the exact copy/behavior the current 4 pages already have —
this is the "all current features available in the editor" requirement. Two flavors:

**Data-referencing blocks** (data is `{}`/empty — the block just marks *where* existing
DB-backed content renders; editing goes through the existing Phase 2/4 routes and
editor components, completely unchanged):
| type | Renders via (unchanged) |
|---|---|
| `hero` | `components/home/hero.tsx` as-is (name/tagline/IP/status badge/CTAs from `ContentBlock`) |
| `ruleList` | `components/rules/rules-editor.tsx` (`RulesEditor`) as-is, backed by `getRuleSections()` |
| `featureGrid` | `components/features/features-editor.tsx` (`FeaturesEditor`) as-is, backed by `getFeatures()` |
| `postList` | `components/news/posts-editor.tsx` (`PostsEditor`) as-is, backed by `getPosts()` — update `NewsPostItem`/`PostsEditor` cards to link to `/news/[slug]` (new in this phase, see step 6) |

**Data-carrying blocks** (content lives directly in `Block.data` JSON; editing is a new,
small editor component per type, following the exact pattern `RulesEditor` already
establishes — `useEditMode()` + local state + `EditableText` per field + optimistic
`PUT /api/blocks/[id]` with `{ data: {...} }`, list items get `list-controls.tsx`
add/remove/reorder same as rules/features do today):
| type | `data` shape | Sourced from (copy the exact current strings, don't rewrite) |
|---|---|---|
| `pageHeader` | `{ eyebrow?: string, heading: string, description?: string }` | The eyebrow+h1+intro pattern at the top of `app/rules/page.tsx`, `app/features/page.tsx`, `app/news/page.tsx` today |
| `callout` | `{ variant: "warning" \| "info", body: string }` | The amber "Read carefully" warning box in `app/rules/page.tsx` |
| `steps` | `{ items: { number: string, title: string, description: string }[] }` | `components/home/getting-started.tsx`'s hardcoded `steps` array |
| `linkGrid` | `{ links: { href: string, title: string, description: string }[] }` | `components/home/quick-links.tsx`'s hardcoded `links` array |
| `richText` | `{ markdown: string }` | General-purpose; used for Rules page's closing "Staff decisions are final..." paragraph, and any new custom page content. Rendered via `react-markdown` + `rehype-sanitize` (new deps — install both; this is also where the Phase 7-adjacent sanitization requirement is actually implemented) |
| `image` | `{ src: string, alt: string, caption?: string }` | New capability. **URL-only for this phase** — no file upload pipeline (no object storage configured); `src` must be an absolute URL. Note upload support as explicit future scope, don't build it unprompted |
| `ctaBanner` | `{ heading: string, body?: string, buttonLabel: string, buttonHref: string }` | New capability, general-purpose |

### 4. Data layer (`lib/content.ts`)

Add, following the existing function style:
- `getPageBySlug(slug: string)` — `prisma.page.findUnique({ where: { slug }, include: { blocks: { orderBy: { order: "asc" } } } })`
- `getPages()` — all pages, for the admin Pages panel
- `getNavTree()` — top-level `NavItem`s (`where: { parentId: null }`) with `include: { children: { orderBy: { order: "asc" } } }`, ordered

### 5. Routing & rendering

**Reserved/fixed routing (avoids the classic "generic `[slug]` catch-all shadows my
other routes" trap):** Next.js already resolves more-specific static segments
(`app/admin/`, `app/login/`, `app/api/`, `app/news/[slug]/`) before falling through to
a sibling `app/[slug]/page.tsx`, so those are safe by construction — but keep the
4 fixed pages on their **existing static route files** rather than routing them through
the new catch-all, so `app/news/[slug]/page.tsx` (new post-detail route, nested under
`app/news/`) can coexist with a `news` Page rendered at the `/news` path itself:

- `app/page.tsx` (Home) — replace its current body with: fetch `getPageBySlug("home")`, render `<PageRenderer page={page} />`
- `app/rules/page.tsx` — same, `getPageBySlug("rules")`
- `app/features/page.tsx` — same, `getPageBySlug("features")`
- `app/news/page.tsx` — same, `getPageBySlug("news")`
- `app/news/[slug]/page.tsx` (**new**) — post detail: `prisma.post.findUnique({ where: { slug } })`, 404 via `notFound()` if missing, render title/tag/date/author + sanitized markdown `body` (reuse the `react-markdown`+`rehype-sanitize` pipeline from the `richText` block)
- `app/[slug]/page.tsx` (**new**) — catch-all for admin-created custom pages: `getPageBySlug(params.slug)`, `notFound()` if missing; if `!published`, `notFound()` for non-admins but render with a visible "Unpublished draft" banner for admins in edit mode (nice-to-have, skip if it adds meaningful complexity — not required for done-when)

**`components/pages/page-renderer.tsx`** (new, server component): takes
`page: Page & { blocks: Block[] }`, maps each block to its renderer by `block.type`
(a lookup object, not a long `if`/`switch`, so adding a block type later is a
one-line registration), wrapping each in a shared **`components/blocks/block-shell.tsx`**
(new client component) that — only in edit mode — adds the dashed-outline chrome plus
`MoveUpButton`/`MoveDownButton`/`DeleteButton` from `components/admin/list-controls.tsx`
(reused, not rebuilt) calling `PUT /api/blocks/[id]` (order swap, same pattern as
`moveSection` in `rules-editor.tsx`) and `DELETE /api/blocks/[id]`. Below the last
block in edit mode, an `AddButton` opens a block-type picker (a simple list/select of
the block types above) that `POST /api/blocks` with an empty/default `data` for the
chosen type.

One renderer component per block type under `components/blocks/` (e.g.
`hero-block.tsx`, `page-header-block.tsx`, `callout-block.tsx`, `rule-list-block.tsx`,
`feature-grid-block.tsx`, `post-list-block.tsx`, `steps-block.tsx`,
`link-grid-block.tsx`, `rich-text-block.tsx`, `image-block.tsx`, `cta-banner-block.tsx`)
— data-referencing ones are thin wrappers around the existing editor components listed
in step 3's first table; data-carrying ones are new small editors following the
`RulesEditor`/`FeaturesEditor` pattern exactly (read those two files as the reference
implementation before writing new ones).

### 6. API routes (new, following `lib/api-response.ts` + Zod + `requireAdmin()`/`requireOwner()` conventions exactly as every existing route under `app/api/**` already does)

- `GET/POST /api/pages`, `PUT/DELETE /api/pages/[id]` — admin-management only (public page rendering reads go through `lib/content.ts` directly in server components, not this API); `PUT`/`DELETE` reject with 400/409 on protected pages per the slug/delete rules in step 2
- `POST /api/blocks`, `PUT/DELETE /api/blocks/[id]` — body per the discriminated union in step 2; `PUT` handles both reordering (`{ order }`) and content edits (`{ data }`)
- `GET/POST /api/nav-items`, `PUT/DELETE /api/nav-items/[id]` — parent/child via `parentId` in the body, same flat-resource pattern `app/api/rules/route.ts` already uses for `sectionId` (read that file as the reference)
- `GET/POST /api/users`, `PUT/DELETE /api/users/[id]` — **every handler starts with `if (!(await requireOwner())) return unauthorized();`**, no exceptions. Additional invariants to enforce server-side (not just UI): reject deleting/demoting yourself, reject deleting/demoting the last remaining `OWNER` (count `OWNER` rows before allowing either)
- Every mutation route that touches `Page`/`Block` should call `revalidatePath` for the affected page's rendered URL(s) afterward, same as every Phase 4 route already does — for a `NavItem` change, revalidate `"/"` at minimum since the header renders on every page (or use `revalidatePath("/", "layout")` to hit the whole tree in one call — check the Next 16 docs for the layout-scope revalidation signature)

### 7. Admin UI

Split the admin dashboard into sub-routes rather than growing `app/admin/page.tsx`
further — it already has "quick links to editable pages" from Phase 4, extend that
pattern:
- `app/admin/pages/page.tsx` (**new**) — list of `Page` rows (title, slug, published toggle, protected badge, "Edit" link that navigates to the live page in edit mode), "New Page" button (prompts for a title, auto-slugifies, creates via `POST /api/pages` with zero blocks, redirects to `/{slug}` so the admin immediately starts adding blocks inline)
- `app/admin/nav/page.tsx` (**new**) — `NavItem` list (top-level rows, indented children), add/remove/reorder (reuse `list-controls.tsx`), each item's form: label, target picker (radio between "internal page" — a `<select>` of published `Page`s — or "external URL" — text input), "add dropdown item" action nested under a top-level row
- `app/admin/users/page.tsx` (**new**, `OWNER`-only — redirect non-owners server-side, same pattern as the existing `if (!session?.user) redirect("/login")` in `app/admin/page.tsx`) — list users (email, name, role, createdAt), create form (email, temp password, name, role picker), per-row edit role / delete (both blocked client- and server-side against self and against the last `OWNER`, per step 6)
- `app/admin/page.tsx` — add cards linking to the 3 new sub-routes; only show the Users card when `session.user.role === "OWNER"` (the route itself still enforces this independently — defense in depth, same posture as every other gate in this app)

### 8. Seeding & backfill (`prisma/seed.ts`)

Rather than a separate one-off migration script, add a new idempotent
`seedPagesAndNav()` function to the existing `prisma/seed.ts` (matches its established
upsert-everything, safe-to-rerun pattern) that creates, **guarded to skip if any `Page`
row already exists** (so it never clobbers an admin's custom pages or reordering on a
second run):
- The 4 protected `Page` rows with their `Block`s in order, using the **exact current
  copy** from each page file as the seed values (don't invent new copy):
  - `home`: `hero` (empty data), `linkGrid` (copy `components/home/quick-links.tsx`'s `links` array into `data.links`), `steps` (copy `components/home/getting-started.tsx`'s `steps` array into `data.items`)
  - `rules`: `pageHeader` (eyebrow "Server Rules", heading "Playing on Embervale", description = the intro paragraph from `app/rules/page.tsx`), `callout` (variant "warning", body = the "Read carefully..." text), `ruleList` (empty data), `richText` (markdown = the closing "Staff decisions are final..." paragraph)
  - `features`: `pageHeader` (copy the eyebrow/h1/intro from `app/features/page.tsx`), `featureGrid` (empty data)
  - `news`: `pageHeader` (copy the eyebrow/h1/intro from `app/news/page.tsx`), `postList` (empty data)
- Default `NavItem` rows matching the current `siteConfig.nav` array in `lib/site-config.ts` (Home/Rules/Features/News as top-level items, no children) — reference the corresponding `Page.id` via `pageId`, not a raw `href`
- **Caution:** the existing `seedContentBlocks()`/`seedRuleSections()`/etc. functions in this file unconditionally overwrite `ContentBlock`/`Rule`/`Feature`/`Post` values on every re-run (`update: { value: block.value }` with no "only if unchanged" guard) — this is pre-existing behavior, not introduced here, but it means blindly re-running `npm run db:seed` on a DB with live admin edits (e.g. this dev.db, which has already been edited once or twice this session) will silently revert those edits back to placeholder text. When backfilling this phase onto the existing `prisma/dev.db`, either add a `--pages-only` mode to the seed script (skip the content-overwriting functions, run only `seedPagesAndNav()`), or accept the overwrite consciously if the current DB content is disposable. Don't silently run full `db:seed` against data anyone cares about.

### 9. `scripts/create-admin.ts`

Add a `--role` flag (or `ADMIN_ROLE` env var), accepted values `OWNER`/`ADMIN`
(case-insensitive, default `ADMIN` if omitted), passed into the `prisma.user.upsert`
call's `role` field. Update the `usage()` text. Document in `CLAUDE.md` or
`docs/DEPLOYMENT.md` that the *first* bootstrapped account for a fresh deploy should be
created with `--role OWNER`.

### 10. Cleanup

- `lib/site-config.ts`'s `nav` array becomes dead once `SiteHeader` reads from
  `getNavTree()` instead — remove it, keep `name`/`tagline`/`ip` (still used as
  `ContentBlock` fallback defaults in `lib/content.ts`)
- `components/home/quick-links.tsx` and `components/home/getting-started.tsx` as
  *standalone hardcoded components* become dead once the `linkGrid`/`steps` block
  renderers exist — their JSX/markup should move into the new block renderer/editor
  components rather than being deleted outright (the visual design is correct today,
  just needs to become data-driven + editable)
- `components/rules/rules-data.ts` and `components/news/posts-data.ts` stay — they're
  still `prisma/seed.ts`'s source for `Rule`/`Post` seed content, unrelated to this
  phase's `Page`/`Block` migration

### Suggested build order (minimize backtracking)

1. Schema + migration (`node --no-turbofan node_modules/prisma/build/index.js migrate dev --name pages_nav_roles` per CLAUDE.md's documented workaround)
2. `lib/auth-guard.ts` additions (`isAdminRole`, `requireOwner`, `getSessionUser`) + fix `app/layout.tsx`'s `isAdmin` computation — do this immediately after the migration, before anything else depends on it
3. `lib/validation/pages.ts`
4. `lib/content.ts` additions
5. API routes: pages → blocks → nav-items → users, in that order (each is independently testable with `curl`/Prisma Studio before the UI exists)
6. `scripts/create-admin.ts` `--role` flag
7. `prisma/seed.ts`'s `seedPagesAndNav()`, run it, verify in `npx prisma studio`
8. Block renderer + editor components (`components/blocks/*`, `components/pages/page-renderer.tsx`, `components/blocks/block-shell.tsx`)
9. Rewire the 4 existing page files to render via `PageRenderer`; add `app/[slug]/page.tsx` and `app/news/[slug]/page.tsx`
10. `SiteHeader` refactor to consume `getNavTree()` + dropdown UI (desktop hover/focus-triggered `aria-haspopup`/`aria-expanded` pattern, not the strict ARIA `role="menu"` pattern — simpler to get right and equally accessible for a marketing nav; mobile gets an accordion-style expand)
11. Admin sub-routes: `app/admin/pages/page.tsx`, `app/admin/nav/page.tsx`, `app/admin/users/page.tsx`, plus the new cards on `app/admin/page.tsx`
12. Install `react-markdown` + `rehype-sanitize`, wire the `richText` block and `/news/[slug]`
13. Full regression pass: confirm Phase 4 editing, Phase 5 status badge, and Phase 6 motion/a11y are all unaffected by the rendering-path swap

**Done when:** an `OWNER` or `ADMIN` can create a brand-new page from scratch out of
blocks, publish it, add it to the header nav (top-level or inside a dropdown), and it's
live for visitors — with Home/Rules/Features/News running through the same system
rather than as a special case — and an `OWNER` can manage the account roster without an
`ADMIN` being able to touch `OWNER` accounts.

### End-of-phase verification notes

All of the above was exercised against the real running `npm run dev` server (not just
code review) via authenticated HTTP requests: created a brand-new page from zero blocks,
added `pageHeader`/`richText`/`ctaBanner` blocks to it, confirmed it rendered for a
logged-out visitor at its slug; added it to the header nav both as a top-level item and
as a dropdown child under Features, confirmed both rendered in the server-rendered HTML
(`aria-haspopup` present); confirmed the one-level-nesting rule rejects a grandchild
nav item (400); confirmed reserved slugs are rejected (400) and protected pages
(Rules) reject slug changes and deletion (409) while still accepting other edits;
confirmed an `ADMIN` account gets 401 from every `/api/users/**` route and a 307
redirect away from `/admin/users`, and cannot view/edit/delete/promote the seeded
`OWNER` account; confirmed the `OWNER` cannot demote or delete themselves, nor delete
the last remaining `OWNER` (409 in both cases); confirmed a Phase 4 content edit
(`hero.name`) from both an `OWNER` and an `ADMIN` session revalidates and appears on the
next page load; confirmed unauthenticated mutation attempts get 401; confirmed
Home/Rules/Features/News still render their full original content through the new
block system, and `/news/[slug]` post-detail pages work. Test artifacts (the scratch
page and its nav entries) were deleted afterward.

**Pre-existing bug found during verification (not introduced by Phase 8) — fixed:**
`bcryptjs@3.0.3`'s pure-JS `compare`/`hash` was intermittently non-deterministic on
this machine's Node `v25.3.0` install (measured ~1–5% failure rate per hash+compare
round-trip via a minimal repro outside Next.js/Prisma entirely — not "most of the time"
as first suspected, but real and reproducible). This predates Phase 8 (Phase 3) and
wasn't introduced here; because it's rare rather than constant, sessions for the
OWNER/ADMIN test accounts were minted directly with `next-auth/jwt`'s `encode()` to
complete this phase's own login-gated verification without depending on it.

**Resolution:** swapped `bcryptjs` for the native `bcrypt` package (C++ binding, not
subject to the same JIT miscompilation path) across all 4 usage sites (`auth.ts`,
`scripts/create-admin.ts`, `app/api/users/route.ts`, `app/api/users/[id]/route.ts`) —
a drop-in swap since both expose the same `hash`/`compare` API and produce
interoperable `$2a$`/`$2b$` hash strings. `npm install bcrypt @types/bcrypt` pulled a
prebuilt binary for this platform, no native toolchain/node-gyp needed. Verified:
native `bcrypt` hash+compare round-tripped 0/300 failures (vs. bcryptjs's ~1–5%);
`npm run build` succeeds (one retry needed for the documented flaky V8 crash, per
CLAUDE.md); 5/5 real logins through the actual `/login` credentials flow (CSRF token,
cookie jar, no shortcuts) succeeded end-to-end against a `npm run start` production
server. Test account and scratch script deleted afterward.

---

## Suggested Order of Attack

Phases are sequential by design — each is independently shippable. Phase 5 (server
status) has no dependency on 3–4 and can be pulled earlier if seeing live data is
motivating. Nothing in Phases 1–4 requires the Minecraft server to be online.

Phases 7 and 8 were scoped after a pre-launch security/readiness review (see
conversation history) and are additive on top of the otherwise-complete Phases 0–6.
Phase 7 is small and independent — safe to do first or in parallel. Phase 8 is the big
one: it subsumes and rebuilds the Phase 4 editing surface for Home/Rules/Features/News,
so it should land as a single coherent pass rather than being split arbitrarily across
files/agents the way Phases 4–6 were, given how much of the data model and rendering
path it touches at once.
