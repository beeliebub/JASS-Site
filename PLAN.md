# JASS Site — Phased Implementation Plan

This is the working implementation plan for the JASS (Just A Simple Server) Minecraft
server website. **All phases (0–11) are complete.** Phases 0–8 are summarized in the
retrospective below (the full historical spec for those phases lives in git history:
`git show 564cf60:PLAN.md`); phases 9–11 (theme system, resource-pack hosting, and the
unified setup wizard) retain their full specs below as documentation of what was built
and how it was verified.

---

## How to use this plan

### Agent-dispatch conventions

Each pending phase contains: **Goal · Prerequisite reading · DB migration · Steps
(numbered, per-file specs) · API contracts · Security checklist · Verification · Agent
dispatch**. When executing a phase:

1. Have every dispatched agent read the phase's *Prerequisite reading* files first —
   they define the conventions the new code must match.
2. Dispatch implementation agents per the *Agent dispatch* subsection (backend and
   frontend work can usually run as separate agents; steps within a group are ordered).
3. After implementation, dispatch the named review agents (`security-reviewer`,
   `react-reviewer` / `typescript-reviewer`, `code-reviewer`) before closing the phase.
   Phase 10's security review is **mandatory, not optional**.
4. Run the *Verification* list end-to-end before marking a phase done. Fix CRITICAL and
   HIGH review findings before continuing.
5. Commit per phase (conventional commits: `feat: …`), never mid-phase broken states.

### Machine quirks (READ FIRST — this machine's Node crashes)

`npm install` and some CLI tools crash with a V8 fatal error
(`InductionVariablePhiTypeIsPrefixedPoint`) on this machine's Node install:

- **npm install**: if it crashes, retry as `NODE_OPTIONS="--jitless" npm install ...`.
  `--jitless` disables JIT and **breaks WebAssembly**, so never use it for Prisma.
- **Prisma CLI** (needs WASM): invoke the JS entry directly with `--no-turbofan`:
  `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name <name>`
  (`--no-turbofan` isn't allowlisted for `NODE_OPTIONS`, so it must be passed directly
  to `node` on the entry file, not via `npx`.)

All migration commands in this plan are written in the safe form.

### Project conventions every agent must follow

- **API envelope**: all JSON API routes use `lib/api-response.ts` helpers
  (`apiSuccess`, `apiError`, `unauthorized`, `notFound`, `badRequest`, `conflict`,
  `validationError`, `internalError`). The only exception in this plan is the binary
  pack download in Phase 10.
- **Auth gates**: mutations require `requireAdmin()` (or `requireOwner()`) from
  `lib/auth-guard.ts`, checked *inside the route handler* — never rely on UI gating.
- **Validation**: Zod schemas live in `lib/validation/*`; validate every body with
  `safeParse` and return `validationError(...)` on failure. `lib/validation/pages.ts`
  must stay importable from client components (no Prisma imports there).
- **Cache invalidation**: call `revalidatePath()` for every path a mutation affects.
- **Design tokens**: colors/radii are CSS custom properties in `app/globals.css`,
  exposed to Tailwind via the `@theme inline` block (`bg-background`, `text-primary`,
  …). New colors must be added to both places. Never hardcode hex values in components.
- **Data layer**: server components read via `lib/content.ts` / Prisma directly — no
  self-fetching of our own API from server code.
- **Motion**: all animation guarded behind `prefers-reduced-motion: no-preference`
  (see the existing motion system in `app/globals.css`).
- **Prisma 7**: config lives in `prisma.config.ts`; client is generated into
  `app/generated/prisma` and instantiated with the better-sqlite3 driver adapter in
  `lib/prisma.ts`.

---

## Retrospective — completed phases

- **Phase 0 — Project scaffold.** Next.js 16 App Router + TypeScript + Tailwind v4
  toolchain, running dev environment.
- **Phase 1 — Design system & public pages.** Dark "obsidian" visual identity and
  token system, hardcoded placeholder content in `lib/site-config.ts`, core components
  (header, footer, hero, feature cards, rules, news).
- **Phase 2 — Database-backed content.** Prisma 7 + SQLite with models `ContentBlock`,
  `RuleSection`/`Rule`, `Feature`, `Post`; re-runnable seed (`prisma/seed.ts`,
  `npm run db:seed`, `--pages-only` flag); JSON envelope API routes with Zod validation.
- **Phase 3 — Authentication.** Auth.js v5 credentials provider (bcrypt, JWT sessions),
  `Role` enum `OWNER`/`ADMIN`, `lib/auth-guard.ts` gates, `scripts/create-admin.ts`
  bootstrap.
- **Phase 4 — In-place editors.** Edit mode (`components/admin/edit-mode-context.tsx`),
  inline editable text, list editors for rules/features/posts, toast feedback.
- **Phase 5 — Live server status.** `lib/mc-status.ts` (minecraft-server-util, 30s
  cache, in-flight dedupe, never throws), public `GET /api/status`, polling status badge.
- **Phase 6 — Polish & deployment.** Motion system (page-enter/toast/nav/icon
  keyframes in `app/globals.css`, blanket `prefers-reduced-motion` reset), Dockerfile +
  docker-compose (loopback bind, `./data/*` mounts), host Caddy with auto-HTTPS,
  `scripts/vps-setup.sh` / `scripts/vps-start.sh`, backups (`scripts/backup-db.ts` +
  systemd timer), `docs/DEPLOYMENT.md`.
- **Phase 7 — Security hardening.** Security headers in `next.config.ts` (CSP, HSTS,
  X-Frame-Options), login rate limiting, defense-in-depth auth gates, sanitized
  markdown rendering.
- **Phase 8 — Block-based page builder.** Models `Page`/`Block`/`NavItem`; block
  registry (`components/blocks/registry.tsx`) with 11 block types; `PageRenderer`;
  catch-all `app/[slug]`; protected pages; `/admin/pages`, `/admin/nav`, OWNER-only
  `/admin/users`; reserved-slug + protected-slug enforcement.

---

## Phase 9 — Theme system

> **Status: ✅ Complete.**

### Goal

Visitors can switch the whole site between four curated Minecraft-flavored themes and
set a **custom accent color** (color wheel + exact hex/RGB input), persisted across
visits with no flash of default theme. Admins can force a specific theme per page and
choose a color *tone* on emphasis-capable blocks while editing.

### Prerequisite reading

`app/globals.css` · `app/layout.tsx` · `components/blocks/registry.tsx` ·
`lib/validation/pages.ts` · `components/blocks/callout-block.tsx` (existing
variant-select pattern to clone) · `components/pages/page-renderer.tsx` ·
`next.config.ts` (CSP comment) · `app/api/pages/[id]/route.ts` ·
`components/admin/pages-admin.tsx`.

### Design decisions (do not relitigate)

- **No-flash persistence: localStorage + blocking inline `<script>` in `<head>`**
  (the next-themes pattern). NOT cookies: reading `cookies()` in the root layout would
  opt every route into dynamic rendering and break the static + `revalidatePath` model
  the whole site relies on. The CSP already carries `script-src 'unsafe-inline'`
  (required by RSC streaming), so the inline script costs nothing. SSR always emits
  default-theme markup; the script corrects `<html>` before first paint.
- **Themes are `[data-theme="…"]` token-override blocks** in `app/globals.css`.
  `:root` stays exactly as it is today (obsidian) so no-JS visitors get the current
  look. Selectors must be attribute-only (`[data-theme="end"]`, not
  `html[data-theme="end"]`) so the same rules power page-level wrapper overrides.
- **Theme set**: `obsidian` (current dark, default) · `parchment` (light) ·
  `deepslate` (cool blue-gray dark) · `end` (dark purple, purple primary).
  **No auto `prefers-color-scheme` switching** — dark-first is the brand (documented
  non-goal); the picker is one click away.
- **Custom accent**: `react-colorful`'s `HexColorPicker` (~2.8 kB, zero deps,
  keyboard-accessible) plus a hex text field and three R/G/B number inputs. The accent
  sets `--primary`, `--primary-hover`, `--primary-foreground` as **inline style
  custom properties on `<html>`**. Foreground is auto-picked (dark `#05130a` vs light
  `#edf2ec`) by WCAG relative luminance; hover is derived by darkening.
- **`Page.theme` is a forced override**: when non-null, that page renders in that theme
  regardless of visitor choice. Implemented as a `data-theme` wrapper div in
  `PageRenderer` — the wrapper's `[data-theme]` rule re-declares tokens closer to the
  content than the `<html>` inline accent vars, so it wins by cascade proximity. No JS
  arbitration needed. Visitor accent intentionally yields on such pages.
- **Block tones**: one shared enum `["neutral","primary","accent","info","warning","danger"]`.
  The existing `callout.variant` (`z.enum(["warning","info"])` in
  `lib/validation/pages.ts`) is **extended in place** to the full enum — the JSON key
  stays `variant`, so existing Block rows remain valid with **no data migration**.
  `pageHeader`, `ctaBanner`, and `linkGrid` gain an optional `tone` field
  (absent = `neutral` = exactly today's look, so existing rows stay valid too).

### DB migration

Add to `prisma/schema.prisma`:

```prisma
model Page {
  // ...existing fields...
  theme String? // one of lib/themes.ts THEME_IDS; null = follow visitor theme
}
```

Run: `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name page_theme`
then `node --no-turbofan node_modules/prisma/build/index.js generate`.

### Steps

1. **`lib/themes.ts` (new — client-safe, NO Prisma imports).**
   `export const THEME_IDS = ["obsidian", "parchment", "deepslate", "end"] as const;`
   `export type ThemeId = (typeof THEME_IDS)[number];` `DEFAULT_THEME = "obsidian"`,
   a `THEMES: Record<ThemeId, { label: string; description: string; swatch: string }>`
   map for pickers, localStorage keys (`STORAGE_KEY_THEME = "jass.theme"`,
   `STORAGE_KEY_ACCENT = "jass.accent"`), and
   `export const TONES = ["neutral", "primary", "accent", "info", "warning", "danger"] as const;`
   with `type Tone`.

2. **`lib/color.ts` (new — pure functions, unit-testable, no deps).**
   `parseHex(hex): {r,g,b} | null` (accept `#rgb`/`#rrggbb`), `rgbToHex(r,g,b)`,
   `relativeLuminance({r,g,b})` (WCAG 2.x formula), `readableForeground(hex)` →
   `"#05130a"` when luminance > ~0.4 else `"#edf2ec"`, `darken(hex, amount)` (for
   `--primary-hover`, ~12%). Clamp/validate all inputs.

3. **`app/globals.css`.**
   - Add an `--info` token to `:root` (readable blue on obsidian, e.g. `#4aa8e8`
     family) and `--color-info: var(--info)` to `@theme inline`.
   - Add three full token-override blocks: `[data-theme="parchment"]` (light surfaces,
     dark foreground, **darkened** emerald primary that hits ≥ 4.5:1 on the light
     background, border alphas flipped to dark), `[data-theme="deepslate"]` (cool
     blue-gray dark family), `[data-theme="end"]` (deep purple background, purple
     primary, chorus-fruit magenta accent). Each block must override *every* color
     token `:root` defines (`--background`, `--surface`, `--surface-2`, `--border`,
     `--border-strong`, `--foreground`, `--muted`, `--primary`, `--primary-foreground`,
     `--primary-hover`, `--accent`, `--accent-foreground`, `--danger`, `--info`,
     `--online`, `--offline`) — partial overrides create Frankenstein themes.
   - Do NOT emit a `[data-theme="obsidian"]` block; obsidian is `:root`.

4. **`components/theme/theme-script.tsx` (new — server component).**
   Renders `<script>{INLINE}</script>` where `INLINE` is a **static string literal**
   (no interpolation of any dynamic value — zero injection surface): reads the two
   localStorage keys inside `try/catch`; validates theme against a hardcoded ID array
   and accent against `/^#[0-9a-fA-F]{6}$/`; sets
   `document.documentElement.dataset.theme` (omit for obsidian) and
   `style.setProperty("--primary"|"--primary-hover"|"--primary-foreground", …)` using
   inlined minimal copies of the luminance/darken math. Keep it dependency-free and
   under ~1 kB.

5. **`components/theme/theme-provider.tsx` (new — `"use client"`).**
   Context `{ theme, accent, setTheme, setAccent, resetAccent }`. Setters write
   localStorage and mutate `<html>` (same operations as the inline script, but
   importing from `lib/themes.ts` + `lib/color.ts`). Initial state read from the DOM
   (`document.documentElement`) in a lazy `useState` initializer so provider state and
   the script-applied DOM agree.

6. **`components/theme/theme-picker.tsx` (new — `"use client"`).**
   Popover/panel opened from a small button in `SiteFooter` (and optionally the mobile
   menu): four labeled theme swatches (radio semantics, keyboard navigable),
   `react-colorful` `HexColorPicker` for the accent, hex input, three R/G/B number
   inputs (0–255, synced both ways via `lib/color.ts`), and a "Reset accent" button.
   Follow existing focus-visible/radius/surface token styling.
   Install: `npm install react-colorful` (fallback:
   `NODE_OPTIONS="--jitless" npm install react-colorful`).

7. **`app/layout.tsx`.** Add `suppressHydrationWarning` to `<html>`; render
   `<ThemeScript />` as the first child of `<body>` (Next 16 executes it before
   paint; keep it above all visible markup) or via an explicit `<head>` — whichever
   the installed Next docs (`node_modules/next/dist/docs/`) recommend for blocking
   scripts; wrap the existing provider stack with `<ThemeProvider>`.

8. **`components/pages/page-renderer.tsx`.** When `page.theme` is set, wrap the block
   list: `<div data-theme={page.theme} className="bg-background text-foreground">`
   (re-asserting bg/text so the wrapper actually repaints). All protected pages and
   `app/[slug]` funnel through PageRenderer, so this is the single integration point.

9. **`lib/validation/pages.ts`.**
   `export const themeSchema = z.enum(THEME_IDS);` — add
   `theme: themeSchema.nullable().optional()` to `pageCreateSchema` and
   `pageUpdateSchema`. `export const toneSchema = z.enum(TONES);` — change
   `calloutDataSchema.variant` to `toneSchema`, add `tone: toneSchema.optional()` to
   `pageHeaderDataSchema`, `ctaBannerDataSchema`, `linkGridDataSchema`.

10. **`app/api/pages/route.ts` + `app/api/pages/[id]/route.ts`.** Persist `theme` on
    create/update; `revalidatePath` the page's path (existing pattern).

11. **`components/blocks/tones.ts` (new).**
    `TONE_STYLES: Record<Tone, { container: string; title: string; icon?: ReactNode }>`
    mapping tones to token classes (e.g. info → `border-info/30 bg-info/10 text-info`;
    danger → danger tokens; neutral → current default styling). Export a shared
    `<ToneSelect value onChange>` edit-mode control cloned from callout's existing
    variant `<select>`.

12. **Block components.** `callout-block.tsx`: replace its two-variant style map with
    `TONE_STYLES` + per-tone icon; keep JSON key `variant`. `page-header-block.tsx`:
    tone tints the eyebrow/heading accent. `cta-banner-block.tsx`: tone tints panel +
    button. `link-grid-block.tsx`: tone tints hover border/title. Each shows
    `<ToneSelect>` only in edit mode. Leave `defaultBlockData` in `registry.tsx`
    unchanged (absent tone = neutral) unless a default is needed for callout
    (keep `variant: "info"`).

13. **`components/admin/pages-admin.tsx`.** Add a theme `<select>` per page row
    (Default + the four themes), PUT via the existing pages API pattern.

### Security checklist

- [ ] Inline theme script is a static literal — no user data interpolated.
- [ ] Accent validated as `#rrggbb` hex before any `style.setProperty` (script,
      provider, and picker all validate).
- [ ] `theme` strings validated against the enum server-side (Zod) and client-side.
- [ ] No new CSP loosening required (verify `next.config.ts` unchanged).

### Verification

1. `npm run lint` and `npx tsc --noEmit` pass.
2. Set each theme, hard-reload with devtools CPU throttling — **no flash** of obsidian
   before the chosen theme.
3. Disable JS → site renders obsidian correctly.
4. Set `Page.theme = "end"` on a test page → that page is purple while the rest of the
   site follows the visitor's theme; visitor accent does not leak into that page.
5. Set accent `#ffff00` on parchment → button text auto-flips dark; on obsidian too.
6. Existing callout blocks (variant `info`/`warning`) render unchanged (backward-compat).
7. Each tone spot-checked on each theme for contrast (especially parchment).
8. Reduced-motion and keyboard navigation of the picker verified.

### Agent dispatch

- Implementation: one frontend agent for steps 1–8 (tokens/script/provider/picker/
  layout), one for steps 9–13 (validation/API/tones/blocks/admin). Step 1–2 outputs are
  shared contracts — land them first.
- Review: `react-reviewer` on provider/picker/script; `code-reviewer` on the rest;
  a design pass (design-system / make-interfaces-feel-better skills) over the four
  themes' token values — parchment must be *designed*, not naively inverted.
- Tests: unit tests for `lib/color.ts` (luminance/foreground/darken edge cases) if a
  test runner is introduced; otherwise verify via the manual list above.

---

## Phase 10 — Resource pack hosting (`/resource`)

> **Status: ✅ Complete.**

### Goal

The site stores and delivers the server's resource pack, replacing what the old
justasimpleserver.net site did. Public `/resource` page shows a download button, the
**date of the last upload**, and the pack's **SHA-1 digest in lowercase hexadecimal**
(the exact format `server.properties` wants), plus a copyable `server.properties`
snippet. Admins upload new packs through the UI; a stable URL serves the active pack
to Minecraft clients. Packs survive Docker rebuilds.

### Prerequisite reading

`lib/api-response.ts` · `lib/auth-guard.ts` · `app/api/blocks/route.ts` (route
conventions) · `docker-compose.yml` · `Dockerfile` · `lib/validation/pages.ts`
(RESERVED_SLUGS) · `components/admin/toast.tsx` · `components/admin/edit-mode-context.tsx`
· `docs/DEPLOYMENT.md`.

### Design decisions (do not relitigate)

- **Upload transport: raw streaming POST** — the browser sends the `File` object
  directly as the `fetch` body; the route handler streams `request.body` to disk
  through a SHA-1 hasher. Next 16 route handlers stream request bodies with no size
  config (`bodySizeLimit` applies only to Server Actions). No multipart parser dep.
  Original filename travels in an `X-Filename` header, sanitized server-side.
- **Size cap 256 MiB (268435456 bytes)**, enforced **twice**: reject upfront on the
  (required) `Content-Length` header, and count bytes while streaming — on overflow
  abort, unlink the temp file, return 413. (Content-Length alone is spoofable;
  counting alone wastes bandwidth.)
- **Content-addressed storage**: `<UPLOADS_DIR>/resource-packs/<sha1>.zip`, where
  `UPLOADS_DIR` env defaults to `path.join(process.cwd(), "uploads")`. Stream to
  `<name>.tmp`, then atomic `rename`. Free dedupe, natural ETags, no filename-derived
  paths. **Keep the newest 3 packs** (rollback headroom on a small VPS); exactly one
  DB row is `active`.
- **Download URL: `GET /api/resource-pack`** — one canonical, stable URL for
  `server.properties`. Streams from disk (`fs.createReadStream` → `Readable.toWeb`),
  direct 200 (no redirects — MC clients handle them poorly), `ETag: "<sha1>"` with
  `If-None-Match` → 304 support.

### DB migration

```prisma
model ResourcePack {
  id         String   @id @default(cuid())
  filename   String            // sanitized original name, display only
  size       Int               // bytes; 256 MiB max fits Int comfortably
  sha1       String   @unique  // lowercase hex, 40 chars
  active     Boolean  @default(false)
  uploadedAt DateTime @default(now())
  uploadedBy String?           // uploader email, display only
}
```

Run: `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name resource_pack`
then regenerate the client.

### API contracts

All JSON responses use the `lib/api-response.ts` envelope. Admin = `requireAdmin()`.

| Route | Auth | Behavior |
|---|---|---|
| `GET /api/resource-pack` | public | **Binary.** 200 zip stream of the active pack: `Content-Type: application/zip`, `Content-Length`, `Content-Disposition: attachment; filename="<filename>"`, `ETag: "<sha1>"`, `Cache-Control: public, no-cache`. 304 when `If-None-Match` matches. 404 envelope when no active pack **or file missing on disk** (log the drift loudly). |
| `GET /api/resource-pack/meta` | public | 200 `{ data: { filename, size, sha1, uploadedAt } \| null }`. |
| `POST /api/resource-pack` | admin | Raw body stream. Pipeline: `requireAdmin()` → **Origin header must match the site origin** (CSRF guard: raw-body POSTs are not covered by Auth.js form CSRF) → require `Content-Length` ≤ 268435456 else 413 → stream to temp while hashing (`crypto.createHash("sha1")`) and counting; first 4 bytes must be `50 4B 03 04` ("PK\x03\x04") else 400 `invalid_zip`; overflow → abort/unlink → 413 → atomic rename to `<sha1>.zip` → transaction: `updateMany({ where: { active: true }, data: { active: false } })` + upsert by sha1 (`create` new or re-activate existing — re-upload of a known sha1 must NOT duplicate) with `uploadedBy` = session email → `prunePacks(3)` → `revalidatePath("/resource")` → 201 `{ data: pack }`. Temp file unlinked in `finally` on every error path. |
| `GET /api/resource-pack/history` | admin | 200 `{ data: ResourcePack[] }` newest-first. |
| `POST /api/resource-pack/[id]/activate` | admin | Verify the row's file exists on disk (else 409 `conflict` with drift message); transaction: deactivate others, activate this; `revalidatePath("/resource")`; 200 `{ data: pack }`; 404 unknown id. |
| `DELETE /api/resource-pack/[id]` | admin | 409 `conflict` if row is active; delete row + file (ignore ENOENT); 200. |

### Steps

1. **`lib/uploads.ts` (new — first line `import "server-only";`).**
   `uploadsDir()` (env `UPLOADS_DIR` fallback `./uploads`; `mkdirSync` recursive),
   `packsDir()`, `packPath(sha1)` — **re-validate `/^[a-f0-9]{40}$/` before
   `path.join`** (defense in depth even though sha1 comes from our own DB),
   `tempPackPath()`, `prunePacks(keep = 3)` (delete rows + files beyond the newest 3,
   never deleting the active row).
2. **API routes** per the contract table: `app/api/resource-pack/route.ts` (GET binary
   + POST upload), `app/api/resource-pack/meta/route.ts`,
   `app/api/resource-pack/history/route.ts`,
   `app/api/resource-pack/[id]/activate/route.ts`,
   `app/api/resource-pack/[id]/route.ts` (DELETE).
   Filename sanitization: `path.basename`, strip control chars, cap 200 chars, must
   end `.zip`, fallback `"resource-pack.zip"`. Never used for storage paths.
3. **`app/resource/page.tsx` (new — server component).** Reads the active
   `ResourcePack` row via Prisma directly. Static metadata ("Resource Pack — JASS").
   Renders `ResourcePackView` (+ `ResourcePackAdmin`, which self-hides outside edit
   mode). Absolute download URL built from `NEXT_PUBLIC_SITE_URL` (same fallback
   pattern as `app/layout.tsx`).
4. **`components/resource/resource-pack-view.tsx` (new).** Download button (primary
   token styling), uploaded date (human-readable + `<time dateTime>`), SHA-1 in mono
   (`font-mono`, lowercase, copy button), and a copyable snippet:

   ```
   resource-pack=https://<site>/api/resource-pack
   resource-pack-sha1=<sha1>
   ```

   Empty state when no pack yet ("No resource pack uploaded yet").
5. **`components/resource/resource-pack-admin.tsx` (new — `"use client"`).** Rendered
   only when `useEditMode()` is active: file input (`accept=".zip"`, client-side size
   pre-check with a friendly error), upload via
   `fetch("/api/resource-pack", { method: "POST", body: file, headers: { "X-Filename": file.name, "Content-Type": "application/zip" } })`
   with pending/disabled state (XHR progress bar is deferred — see appendix), then
   `router.refresh()`; history table (filename, size, date, sha1 prefix, active badge)
   with Activate/Delete actions; toasts via existing `ToastProvider`.
6. **`lib/validation/pages.ts`.** Add `"resource"` to `RESERVED_SLUGS` (a builder Page
   must never shadow the new static route).
7. **Infra.** `docker-compose.yml`: volume `./data/uploads:/app/uploads` + env
   `UPLOADS_DIR: /app/uploads`. `Dockerfile` runner stage: `mkdir -p /app/uploads`.
   `.gitignore`: `uploads/`. `.env.example`: document `UPLOADS_DIR` (optional, default
   `./uploads`).
8. **Docs + nav.** `docs/DEPLOYMENT.md`: uploads mount, and note Caddy has no default
   body limit (optionally add `request_body { max_size 300MB }` to the Caddyfile as an
   explicit cap). Optional: seed a "Resource Pack" NavItem → `/resource` in
   `prisma/seed.ts` (upsert style, `--pages-only`-safe).

### Security checklist

- [ ] Upload/activate/delete/history behind `requireAdmin()`; Origin check on POST.
- [ ] Magic-bytes check (`PK\x03\x04`) + double size enforcement.
- [ ] Storage paths derived only from validated sha1 — user filename never touches
      the filesystem path.
- [ ] Temp files cleaned in `finally` on all error paths.
- [ ] Zips are opaque bytes — never extracted or parsed server-side.
- [ ] Download re-validates sha1 format before path join; 404s cleanly on drift.
- [ ] No secrets/params leak into error messages (use envelope codes).

### Verification

1. Upload a real pack (ideally ~100 MB) locally; `sha1sum pack.zip` matches the
   displayed digest exactly (lowercase hex).
2. `curl -I http://localhost:3000/api/resource-pack` → 200 with all headers; repeat
   with `If-None-Match: "<sha1>"` → 304.
3. Watch process RSS during the large upload — memory stays flat (true streaming).
4. `docker compose up -d --build` twice → pack + metadata survive rebuilds.
5. Unauthenticated POST → 401 envelope. Oversized Content-Length → 413. Non-zip
   bytes → 400. After each failure the temp dir is empty.
6. Re-upload the same file → no duplicate row; it re-activates.
7. Activate an older pack → download + page reflect it after refresh.
8. Point a real MC server's `server.properties` at the deployed URL + sha1 and join
   (manual; the Phase 11 walkthrough automates the instructions).
9. `npm run lint` + `npx tsc --noEmit`.

### Agent dispatch

- Implementation: one backend agent (steps 1–2, 6–7), one frontend agent (steps 3–5, 8).
- Review: **`security-reviewer` over the upload/download routes is mandatory before
  phase close** (file upload + raw body + streaming = highest-risk surface in the
  project). `typescript-reviewer`/`code-reviewer` on the rest.
- The large-file streaming test (verification 3) must be explicitly reported, not
  assumed.

---

## Phase 11 — Unified interactive setup wizard (`setup.sh`)

> **Status: ✅ Complete.** Verified: `shellcheck` clean and `bash -n` clean on all
> seven files; wrapper `--help` output byte-identical to the originals; a fresh-clone
> `./setup.sh --mode local` run taken end-to-end to a live dev server (home, `/resource`,
> and the resource-pack + status APIs all responding).

### Goal

One entry point — `./setup.sh` — that interactively walks a human from zero to a
running site in any of three modes: **local dev**, **VPS first-time provision**,
**VPS redeploy/update**. Everything automatable is automated (idempotently, safe to
re-run); everything that isn't (DNS, OVH cloud firewall, `server.properties` on the
Minecraft server) becomes a guided, numbered walkthrough with pauses and verification
commands. Existing `vps-setup.sh` / `vps-start.sh` keep working as thin wrappers.

### Prerequisite reading

`scripts/vps-setup.sh` (all 709 lines) · `scripts/vps-start.sh` (all 460 lines) ·
`CLAUDE.md` (machine quirks) · `prisma/seed.ts` · `scripts/create-admin.ts` ·
`.env.example` · `docs/DEPLOYMENT.md` · `README.md` (setup sections).

### Design decisions (do not relitigate)

- **Refactor into sourced lib files.** The two VPS scripts duplicate ~200 lines of
  helpers (logging, traps, prompt helpers, `set_env_var`, xtrace secret guards,
  `generate_auth_secret`, validators, `run_apt`). A dispatcher that merely `exec`s
  them couldn't share state (domain, env values, step results) across modes.
- **Extraction is verbatim and behavior-preserving.** Function bodies move unchanged
  — no "improvements" during the move. This is the top regression control.
- **Back-compat wrappers.** `vps-setup.sh` and `vps-start.sh` become thin wrappers
  that source the libs and run their mode with identical flags (`--domain`, `--pull`,
  `--no-build`, `--help`) and identical `--help` output.

### Layout

```
setup.sh                      # dispatcher: interactive menu ("1) Local dev
                              # 2) Provision VPS  3) Redeploy") + --mode local|provision|deploy,
                              # --domain / --pull / --no-build passthrough, --help
scripts/lib/common.sh         # moved verbatim: colors, info/warn/error/die/step, EXIT/ERR
                              # traps, hide_xtrace/restore_xtrace, ask_yes_no,
                              # prompt_default, prompt_validated, is_valid_port,
                              # validate_domain, set_env_var, generate_auth_secret, run_apt
scripts/lib/local-dev.sh      # NEW mode (steps below)
scripts/lib/vps-provision.sh  # vps-setup.sh steps 1-11 as step_* functions
scripts/lib/vps-deploy.sh     # vps-start.sh tasks as step_* functions
scripts/lib/walkthroughs.sh   # guided manual steps (below)
scripts/vps-setup.sh          # thin wrapper → provision mode (back-compat)
scripts/vps-start.sh          # thin wrapper → deploy mode (back-compat)
```

All files `set -Eeuo pipefail`; libs must be source-safe (no top-level side effects
beyond function/readonly definitions).

### Steps

1. **Extract `scripts/lib/common.sh`** from the shared helpers of both VPS scripts
   (verbatim). Where the two scripts' copies differ trivially, keep the more defensive
   variant and note it in the commit message.
2. **Extract `scripts/lib/vps-provision.sh`** — each existing numbered step of
   `vps-setup.sh` becomes `step_sanity`, `step_dns_check`, `step_firewall`,
   `step_docker`, `step_caddy`, `step_env_production`, `step_compose_up`,
   `step_migrate_seed`, `step_owner_account`, `step_backups`, `step_final_checklist`,
   orchestrated by `run_provision "$DOMAIN"`. Add `mkdir -p data/uploads` beside the
   existing data-dir handling (Phase 10).
3. **Extract `scripts/lib/vps-deploy.sh`** — `step_sanity`, `step_git_pull`,
   `step_compose_up`, `step_migrate_deploy`, `step_health_check`,
   `step_caddy_reload`, `step_status_report`, orchestrated by `run_deploy`. Also
   `mkdir -p data/uploads`. After a successful deploy, offer the resource-pack
   walkthrough (step 6).
4. **Write `scripts/lib/local-dev.sh`** — `run_local_dev` with idempotent steps that
   print `SKIP` when already satisfied:
   1. Node ≥ 20 check (`node --version`), with install guidance if missing/old.
   2. `npm install`; on nonzero exit, retry **once** with
      `NODE_OPTIONS="--jitless" npm install`, warning that jitless breaks WASM (so
      Prisma steps below use the separate workaround).
   3. `.env` from `.env.example` if absent: generate `AUTH_SECRET`
      (`generate_auth_secret` under the xtrace guard), prompt for
      `MC_SERVER_HOST`/`MC_SERVER_PORT` with defaults. Never touch an existing `.env`.
   4. Prisma generate + `migrate dev`: try `npx prisma …` first; on the V8 crash
      signature fall back to
      `node --no-turbofan node_modules/prisma/build/index.js …`.
   5. `npm run db:seed` (skip with a warning if the DB already has content unless the
      user confirms; mention `--pages-only`).
   6. Offer OWNER account creation via `npm run create-admin -- <email> <pw> --role OWNER`
      (password prompted with confirmation, hidden input, min 8 chars).
   7. `mkdir -p uploads` (Phase 10 local storage).
   8. Offer to start `npm run dev`.
5. **Write `setup.sh`** (repo root, executable): parses `--mode`/`--domain`/`--pull`/
   `--no-build`/`--help`; with no `--mode`, shows the interactive menu; sources
   `scripts/lib/*.sh`; dispatches to `run_local_dev` / `run_provision` / `run_deploy`.
6. **Write `scripts/lib/walkthroughs.sh`** — each walkthrough prints numbered
   instructions, pauses with "Press Enter when done", then runs an optional
   verification command:
   - `walkthrough_dns`: A/AAAA records for `@` and `www` at the registrar; verify with
     `dig +short <domain>` vs detected public IP.
   - `walkthrough_ovh_firewall`: exact OVH console path to open 80/443 in the network
     firewall (in addition to ufw).
   - `walkthrough_resource_pack`: after deploy, `curl -fsS https://<domain>/api/resource-pack/meta`;
     if a pack exists, print ready-to-paste lines pre-filled with the live sha1:
     `resource-pack=https://<domain>/api/resource-pack` and
     `resource-pack-sha1=<sha1>`; mention `require-resource-pack=true` as optional;
     if no pack yet, explain uploading via `/resource` in edit mode first.
7. **Rewrite `scripts/vps-setup.sh` / `vps-start.sh` as thin wrappers** (keep flags
   and `--help` text identical).
8. **Update `README.md` + `docs/DEPLOYMENT.md`**: `./setup.sh` is now the front door;
   old script names still work.

### Security checklist

- [ ] `AUTH_SECRET` / passwords never echoed and never leak under `bash -x`
      (`hide_xtrace` guards preserved around every secret-handling block).
- [ ] `.env` / `.env.production` created atomically (mktemp 0600 → mv), existing
      files never overwritten.
- [ ] Domain/port inputs still pass `validate_domain` / `is_valid_port` before being
      written into Caddyfile/.env (shell-injection guard).
- [ ] No `curl | sh` beyond what already exists (Docker's get.docker.com — unchanged).

### Verification

1. `bash -n` on all seven files; `shellcheck` clean (or annotated) on each.
2. Diff every extracted function against its original — must be verbatim.
3. Fresh clone → `./setup.sh --mode local` runs to a working dev server; run it again
   → every step prints SKIP; `.env` untouched.
4. `./scripts/vps-setup.sh --help` and `./scripts/vps-start.sh --help` byte-identical
   to before the refactor.
5. Menu works with piped/EOF stdin (the existing EOF-safe prompt behavior preserved).
6. On the VPS (or a container): provision mode end-to-end, then deploy mode, then the
   resource-pack walkthrough against the live meta endpoint.

### Agent dispatch

- Implementation: one bash-focused agent for the mechanical extraction (steps 1–3, 7
  — instruct explicitly: *move function bodies verbatim, no improvements*); a second
  agent for `local-dev.sh`, `walkthroughs.sh`, and `setup.sh` (steps 4–6, 8).
- Review: `code-reviewer` pass focused on trap/ERR/xtrace integrity and idempotency;
  spot-check that no secret can appear in xtrace output.

---

## Appendix — cross-phase risks & deferred items

**Risks**

1. *Inline theme script vs future nonce-CSP*: if CSP is ever tightened to nonces, the
   Phase 9 script needs the nonce plumbed through — note this beside the CSP comment
   in `next.config.ts` when implementing.
2. *Large uploads through the full stack*: streaming behavior in `next start` and
   through Caddy (buffering/timeouts) is an **acceptance criterion** (Phase 10
   verification 3), not an assumption.
3. *DB/disk drift* for packs (file deleted but row active): mitigated by existence
   checks in download/activate; a consistency check in the wizard's deploy mode is a
   nice-to-have.
4. *Bash refactor regressions*: mitigated by verbatim extraction, shellcheck,
   wrapper back-compat, and help-output diffing.
5. *Parchment (light) contrast*: light theme needs re-derived border alphas and a
   darkened primary — design it, don't invert it. Flagged for the Phase 9 design pass.
6. *Hero block on non-default themes*: it renders server-side with token classes, so
   it themes automatically — but verify visually on all four themes.

**Deferred (explicitly out of scope for phases 9–11)**

- Upload progress bar (needs XHR; fetch has no upload progress) — revisit after
  Phase 10 ships.
- Pack version diffing / changelogs.
- Full per-block theme overrides (only tones for now).
- Cookie-based SSR theming (would force dynamic rendering).
- Automated test suite / CI — worth its own phase; manual verification lists above
  are the interim gate.
