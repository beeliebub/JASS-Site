---
name: jass-stack-pro
description: Deep working knowledge of this site's actual stack — Next.js 16 App Router, Prisma 7 with a driver adapter on SQLite, Auth.js v5, Zod v4, Tailwind v4 — plus the app's own architecture: the block-based page builder, the guard/audit/revalidate route contract, the theming token system, content-addressed uploads, and the manual VPS deploy. Use PROACTIVELY for any feature, fix, or review touching this stack.
metadata:
  origin: JASS
---

# JASS Stack Pro

You are an expert on **this** application: the website for a Minecraft server, running Next.js 16
(App Router, TypeScript, Turbopack), Tailwind v4, Prisma 7 on SQLite, Auth.js v5, and Zod v4,
deployed by hand to a single VPS behind Caddy.

## Read this before writing framework code

Next.js 16 and Prisma 7 are recent majors. Most remembered patterns and nearly every tutorial online
describe older versions, and "fixing" this code back to those shapes breaks it. The bundled docs at
`node_modules/next/dist/docs/` are authoritative for the exact installed version — read the relevant
guide before writing Next.js code.

| Thing | This project | What you might remember |
|---|---|---|
| Middleware file | **`proxy.ts`** | `middleware.ts` |
| Route handler params | `{ params }: { params: Promise<{ id: string }> }`, then `await params` | a plain object |
| Prisma datasource config | **`prisma.config.ts`** (with `dotenv/config`) | `url = env("DATABASE_URL")` in the schema |
| Prisma client | explicit driver adapter: `new PrismaClient({ adapter })` with `PrismaBetterSqlite3` | bare `new PrismaClient()` |
| Generated client | `app/generated/prisma` (gitignored — must be generated) | `node_modules/.prisma` |
| Zod errors | `error.issues` | `error.errors` |
| Auth.js | v5: `export const { handlers, auth, signIn, signOut } = NextAuth({…})` in root `auth.ts` | `getServerSession(authOptions)` |

## This machine's Node crashes — know the workaround

`npm install` and several CLIs hit a V8 fatal error (`InductionVariablePhiTypeIsPrefixedPoint`) on
this development machine. A crash with that message is an environment problem, not a code problem:

```bash
node --no-turbofan node_modules/typescript/lib/tsc.js --noEmit    # typecheck
node --no-turbofan node_modules/eslint/bin/eslint.js              # lint
node --no-turbofan node_modules/prisma/build/index.js <cmd>       # any prisma CLI command
node --no-turbofan -r tsx/cjs prisma/seed.ts                      # tsx scripts (its CLI re-spawns)
NODE_OPTIONS="--jitless" npm install                              # install only — breaks WASM
```

Never use `--jitless` for Prisma; it needs WebAssembly.

## Architecture Map

```
Request
  ├─ proxy.ts .................. redirects /admin/** when logged out, /login when logged in
  ├─ app/**/page.tsx ........... server components; fetch via lib/, resolve the page theme
  │    └─ components/pages/site-chrome.tsx ...... applies page/custom theme around header+footer
  │         └─ components/pages/page-renderer.tsx  server: prefetch, parse, build ClientBlock[]
  │              └─ components/pages/page-blocks.tsx  client: add/reorder/save, optimistic state
  │                   └─ components/blocks/registry.tsx  type -> component
  └─ app/api/**/route.ts ....... guard -> parse -> transaction+audit -> revalidate -> envelope
       └─ lib/ .................. the rules live here, one concern per module
```

### The `lib/` contract map

| Module | Owns | Never do instead |
|---|---|---|
| `lib/auth-guard.ts` | `requireAdmin`, `requireOwner`, `requireEditingEnabled`, `isAdminRole` | compare `role === "ADMIN"` by hand |
| `lib/api-response.ts` | `{ data }` / `{ error: { code, message, details } }` envelope + helpers | ad-hoc `NextResponse.json` |
| `lib/validation/**` | every request schema, `parseBlockData`, `buildDataSchemaFromDefinition` | inline schemas in a route |
| `lib/audit-log.ts` | `*Snapshot` helpers, `recordAuditLog`, every undo handler | spread a raw row into a snapshot |
| `lib/content.ts`, `lib/site-settings.ts` | server-only reads with safe fallbacks | query Prisma from a component |
| `lib/uploads.ts` | content-addressed paths and usage detection | build an upload path by hand |
| `lib/routes.ts` | pure URL mapping, **no Prisma import** | import `lib/content.ts` in a client component |
| `lib/themes.ts`, `lib/color.ts`, `lib/custom-themes.ts` | theme tokens and color math | hardcode a hex in a component |

## The Route Handler Contract

Every mutating handler under `app/api/**` follows this shape. Deviating without a stated reason is a
review finding:

```ts
export async function POST(req: Request) {
  if (!(await requireAdmin())) return unauthorized();
  if (!(await requireEditingEnabled())) return editingDisabled();

  let body: unknown;
  try { body = await req.json(); } catch { return badRequest("Request body must be valid JSON."); }

  const parsed = someCreateSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const user = await getSessionUser();

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.thing.create({ data: { …parsed.data, updatedBy: user?.email } });
      await recordAuditLog(tx, {
        entityType: "Thing", entityId: row.id, action: "create",
        before: null, after: thingSnapshot(row), actorEmail: user?.email,
      });
      return row;
    });

    revalidatePath(pagePath(slug));      // computed, never a hand-built `/${slug}`
    return apiSuccess(created, { status: 201 });
  } catch (error) {
    return internalError(error);
  }
}
```

**Documented exceptions to the editing lock:** `/api/users/**` and `/api/account/password`. Account
and owner operations stay reachable while an OWNER has locked site editing — that is deliberate, and
`lib/auth-guard.ts` says so. Any other exception needs its own justification.

**Roles:** `OWNER` ⊃ `ADMIN`. Both edit all content; only `OWNER` manages accounts. `isAdminRole()`
exists because a hand-written `role === "ADMIN"` check silently locks owners out — that already
happened once.

## The Block System

This is the app's content architecture. Learn it before touching anything content-related.

```
Page (slug, title, theme?, customThemeId?, headerContent?, redirectUrl?, published, protected)
 └─ Block (order, type, data: JSON-as-string, blockDefinitionId?)
      ├─ built-in type  -> blockDataSchemas[type]        (static Zod schema)
      └─ type "custom"  -> BlockDefinition + fields      (dynamically built Zod schema)
           ├─ renderMode "fields" -> one of BLOCK_LAYOUT_TEMPLATES
           └─ renderMode "html"   -> htmlTemplate with {{placeholders}}
```

- **`Block.data` is a JSON string, not a JSON column** — SQLite has no native JSON type here, and the
  convention matches `ContentBlock.value`. It is validated on write against `blockDataSchemas[type]`
  **and re-validated on read** in `page-renderer.tsx`, which falls back to `defaultBlockData[type]`
  rather than crashing a visitor's page.
- **`RuleSection` / `Feature` / `Post` are owned by a block** through `blockId` and cascade-delete with
  it. The render path fetches them with one batched query per type and groups by block id.
  `postDisplay` is the deliberate exception — it selects *other* blocks' posts by tag, site-wide, and
  its per-block `tagIds` are unioned into a single query then filtered back down per instance.
- **`type: "custom"` blocks** resolve their `BlockDefinition` through `referenceData.blockDefinitionsById`
  (deduped per page). A block whose definition was deleted is skipped rather than crashing.
- Custom page slugs are lowercase kebab-case paths with one to three segments. The first segment cannot
  be `admin`, `api`, `login`, `account`, `news`, or `resource`; the catch-all route joins the segments
  before loading the page.
- `Page.redirectUrl` is an optional root-relative or HTTP redirect. Protected pages cannot redirect,
  and create, rename, update, and audit-undo paths reject redirect cycles before committing.
- Wiki blocks (`wikiIndex`, `infobox`, and `wikiArticle`) are built-in block types. Published wiki
  navigation and link references are prefetched in `page-renderer.tsx`; `lib/wiki-links.ts` stays
  Prisma-free so rich-text links can be enhanced on the client without crossing the server boundary.

### Adding a block type — the complete checklist

| Location | Enforced by the compiler? |
|---|---|
| `BLOCK_TYPES` in `lib/validation/pages.ts` | — (the source of truth) |
| `blockTypeLabels` | yes |
| the `<type>DataSchema` | — |
| `blockDataSchemas` | yes (`satisfies Record<BlockType, …>`) |
| **`blockCreateSchema` discriminated union** | **no — a miss compiles and fails at runtime** |
| `blockComponents` in `components/blocks/registry.tsx` | yes |
| `defaultBlockData` (must satisfy its own schema) | yes for presence, **no** for schema validity |
| prefetch + `ReferenceData` in `page-renderer.tsx` | only if it needs reference data |

`defaultBlockData.code` uses a non-empty placeholder string precisely because `codeDataSchema`
requires `min(1)` — an empty default would fail validation the moment an admin adds the block.

## Theming

16 CSS custom properties are set on `<html>` by the theme provider and re-set on `PageRenderer`'s
per-page `[data-theme]` wrapper. Because they are inherited custom properties, anything rendered
inside resolves `var(--primary)` to whichever theme applies — per-page theme, visitor-selected
built-in theme, or a visitor's custom theme — and recolors live when a visitor switches, with no
per-component theme detection.

- Built-in themes: `THEME_IDS` in `lib/themes.ts`. Admin-authored: the `CustomTheme` model, stored
  **field-per-token, not a JSON blob**, so each hex gets independent server-side Zod validation.
- Deleting a `CustomTheme` in use is `onDelete: SetNull` — those pages silently revert to following
  the visitor's theme. Deliberate, and documented in the schema.
- Never hardcode a color in a component. Reference a token.

## Uploads

Content-addressed: bytes live at `<UPLOADS_DIR>/{images,resource-packs}/<sha1>.<ext>`; the DB row is
metadata only. Resource-pack rows are independently public by database `id`, while their Minecraft
`resource-pack-id` UUID is stored in the row and has no filesystem footprint. Rules that are load-bearing:

- `packPath()` / `imagePath()` **re-validate the sha1 against `/^[a-f0-9]{40}$/` and throw otherwise**,
  so no call site can ever turn unvalidated input into a filesystem path.
- The extension comes from validated magic bytes, never from the client's filename.
- Re-uploading identical resource-pack bytes is rejected with a conflict naming the existing row;
  it must not reactivate, replace, or silently reuse that row.
- Resource-pack UUIDs are intentionally nonunique: an admin may reuse a UUID for a replacement row.
  The `active` field is an admin-only bookkeeping label with no effect on public visibility; the
  previous active field was dropped because it was unused, so never treat it as a public gate.
- Resource packs are retained until an admin explicitly deletes the row. There is no automatic
  pruning, because a previously copied server.properties snippet may still reference an older pack.
- Resource-pack deletion unlinks the **file before** the row, so a filesystem failure cannot leave a
  database row pointing at an absent file. The public item route looks up by row `id` and then uses
  the stored SHA-1 to locate the bytes.
- "Is this image used?" is derived by substring-matching the sha1 across every block's raw `data`,
  plus explicit checks for the two `SiteSettings` foreign keys — because those reference an image by
  id, which the substring scan cannot see.

## Admin-authored HTML

The custom-HTML block renders admin-authored markup through `dangerouslySetInnerHTML`. This is a
deliberate, bounded trust decision (ADMIN/OWNER are trusted authors), and it rests on two guarantees:

1. Interpolated per-instance **values** are HTML-escaped on substitution.
2. `richText` values still go through the `react-markdown` + `rehype-sanitize` pipeline.

`lib/render-custom-html.ts` is the single helper both the server render path and mutation responses
call, specifically so view mode and optimistic admin updates cannot drift onto different rules. Note
that inline `<script>` inserted via `innerHTML` does **not** execute — iframes and embeds work,
scripts do not, and making them work would be a separate, explicit security decision.

The CSP in `next.config.ts` allows `'unsafe-inline'` for `script-src` because the App Router emits
unnonced inline scripts; a strict policy left every page non-interactive. Do not "harden" that without
a nonce strategy.

## Deploy Reality

The live site is a **different SQLite database** on a VPS. There is no staging environment. Deploys
pull the repo and run:

```bash
node --no-turbofan node_modules/prisma/build/index.js migrate deploy
npm run db:seed -- --pages-only      # every deploy, never the bare db:seed
```

- **Never put dev-database ids in a migration.** Backfills key on stable identifiers (slug, type,
  foreign key). A hardcoded `Block.id` already broke a real deploy (`ac831b6`).
- **Every seed write must be an upsert or a guarded insert.** The bare `npm run db:seed` resets
  `ContentBlock`/`Rule`/`Feature`/`Post` to placeholders and would destroy live content — which is why
  `--pages-only` is mandatory.
- **Backfill logic must land in a function the deploy actually runs on every deploy.**
  `seedPagesAndNav()` skips itself once any `Page` exists; `seedStaticRoutePages()` upserts per row and
  therefore reaches an existing database.
- **New env vars go in both `.env.example` and the `docs/DEPLOYMENT.md` table.** `AUTH_SECRET` must be
  rotated for production and `AUTH_URL` must be set to the real public URL behind Caddy.

## Verification

No test runner is installed. Do not write test files or invoke `npm test`. The loop is typecheck →
lint → (build when routing or the server/client boundary changed) → manual walkthrough against
`npm run dev`, logged in as an admin. Lean on the type system to compensate: exhaustive
`Record<Union, …>` maps, literal unions, and `satisfies` are this repo's regression net.
