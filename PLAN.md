# PLAN.md — Raw-HTML mode for admin-authored custom blocks

**Status: scoped, not yet implemented.** Nothing here carries over from any
prior version of this file. This plan *extends* the already-shipped custom
block system (admin-defined `BlockDefinition`/`BlockFieldDefinition` types,
the dynamic `Block.data` Zod builder in `lib/validation/block-definitions.ts`,
the fixed-`layout` template renderer in
`components/blocks/custom-block-renderer.tsx`, and the block-type builder in
`components/admin/block-definitions-admin.tsx`, all commit `a0b985c`). That
system is the baseline; do not re-plan it. Phase numbers below are local to
this file only.

**Hard rule, unchanged from every prior version of this file: this file's own
nomenclature (`Phase N`, `PLAN.md`, decision numbers, etc.) must never be
referenced in source code comments.** A comment has to stand on its own and
still make sense after this file is deleted or replaced by the next one.

---

## What this is

Today an admin builds a custom block *type* by declaring fields and picking
one of four fixed arrangement templates (`stacked`/`banner`/`split`/
`repeaterGrid` — `lib/block-layouts.ts`). The renderer guesses which field
goes in which slot by field type. This plan adds a second authoring mode to
the same `BlockDefinition`: **the admin writes the block's markup directly as
raw HTML**, with `{{placeholder}}` references to the block type's own fields
so each *instance* still fills in its own content.

Rendered HTML is **auto-colored to match whatever theme it's displayed under**
— for every visitor, on every page, including per-page themes and
visitor-selected custom themes — by leaning on the existing 16-token CSS
custom-property system rather than hardcoding any colors.

### Locked decisions (answered 2026-07-14 — do not re-litigate)

1. **HTML + field placeholders**, not static-only HTML. The definition stores
   an HTML *template*; `{{fieldKey}}` placeholders interpolate the block
   type's existing per-instance fields. A block type in HTML mode keeps its
   `fields` (they supply placeholder values); it just ignores `layout`.
2. **Full raw HTML is allowed** (no allowlist sanitizer on the *template*
   itself). The admin's markup renders as authored. This is a deliberate
   trust decision: ADMIN/OWNER are trusted authors. See the security section
   — this introduces the project's first `dangerouslySetInnerHTML`, and there
   is a real, non-obvious caveat about inline `<script>` execution.
3. **Auto-theming is two-layered, with the second layer opt-in per block
   type:**
   - **Always on:** a scoped stylesheet colors *unstyled* bare elements
     (headings, `p`, `a`, `button`, lists, tables, `code`, `hr`, `blockquote`,
     …) from the current theme's tokens, and the 16 theme CSS variables are in
     scope so the admin's own HTML can reference `var(--primary)` etc. The
     admin's explicit colors are left untouched.
   - **Opt-in toggle at creation time (`remapThemeColors`, default off):**
     when enabled, explicit colors the admin set (inline `style`, presentation
     attributes) are rewritten onto the nearest theme *token reference* so
     even hardcoded colors follow the theme. Off by default so an admin who
     wanted an exact color keeps it.

---

## Phase 1 — Data model + validation

### Schema (`prisma/schema.prisma`)

`BlockDefinition` gains three columns, all additive and safe-defaulted so
every existing definition keeps behaving exactly as today:

```prisma
model BlockDefinition {
  // ...existing fields unchanged...
  renderMode       String   @default("fields")  // "fields" | "html"
  htmlTemplate     String?                        // raw HTML w/ {{placeholders}}; required when renderMode == "html"
  remapThemeColors Boolean  @default(false)       // opt-in explicit-color remap (Phase 4)
}
```

- `renderMode` discriminates the two authoring modes. `"fields"` is the
  existing behavior (arrange `fields` via `layout`); `"html"` renders
  `htmlTemplate`. Defaulting to `"fields"` means every existing row is
  unchanged. `layout` stays required at the schema level (keep it set even in
  HTML mode — a definition switched back to `"fields"` still needs one; the
  builder just hides the layout picker while in HTML mode).
- `htmlTemplate` is nullable because `"fields"`-mode definitions have none.
- `fields` (the `BlockFieldDefinition` relation) is **unchanged** — HTML mode
  reuses it for placeholder values.

### Migration

- Purely additive: three new columns, two with `@default`, one nullable, **no
  backfill**. Confirm the generated `migration.sql` is `ALTER TABLE` /
  `ADD COLUMN` only, with **no `INSERT`/`UPDATE` and no ids/values read off
  this dev `prisma/dev.db`** (the `ac831b6` failure mode). A defaulted/nullable
  column needs no data migration.
- Prisma-7 note: generate via the CLAUDE.md workaround
  (`node --no-turbofan node_modules/prisma/build/index.js migrate dev --name
  custom-block-html-mode`), then read the SQL by hand.

### Validation (`lib/validation/block-definitions.ts`)

- Extend `blockDefinitionCreateSchema` and `blockDefinitionUpdateSchema` with:
  - `renderMode: z.enum(["fields", "html"]).default("fields")`
  - `htmlTemplate: z.string().max(N).nullable().optional()` (pick a generous
    but bounded cap, e.g. 50 000 chars, so the column can't be used to store
    unbounded blobs)
  - `remapThemeColors: z.boolean().default(false)`
- Add a `superRefine` cross-field rule: when `renderMode === "html"`,
  `htmlTemplate` must be a non-empty string. When `renderMode === "fields"`,
  `htmlTemplate` may be null/absent (don't force clearing it, but it's ignored).
- **Placeholder validation:** parse the template for `{{...}}` tokens (reusing
  the same extractor Phase 2 defines) and reject any placeholder whose key
  isn't a defined field `key` on this definition — a typo'd `{{titel}}` should
  fail at save, not silently render an empty string forever. Repeater-loop
  tokens (`{{#each key}}`/`{{/each}}`, Phase 2) validate that `key` is a
  `repeater` field and that inner `{{itemKey}}` tokens are that repeater's
  item-field keys. Keep this a *warning-grade strictness* decision consistent
  with the existing `refineUniqueFieldKeys` refinements — a `ctx.addIssue`
  with a clear path, not a thrown error.
- The dynamic `Block.data` schema builder (`buildDataSchemaFromDefinition`)
  and `defaultDataForFields` are **unchanged** — HTML-mode instances still
  store the same per-field `Block.data`, so instance create/update through
  `/api/blocks/**` needs no special-casing.

### Production-safety for this phase

Additive migration only (checked above); `prisma/seed.ts` untouched (no new
block type is seeded — admins author these). No env vars, no Docker/deploy
changes.

---

## Phase 2 — The template engine (shared, pure, dependency-free)

A single pure module (e.g. `lib/custom-html-template.ts`) that both the
server render path and the client live-preview import. No new npm dependency
(this machine's install is fragile — see CLAUDE.md; a ~100-line regex
interpolator is preferable to a templating package here).

### Placeholder syntax

- `{{fieldKey}}` — substitutes a scalar field's value.
- `{{#each repeaterKey}} … {{itemFieldKey}} … {{/each}}` — repeats the inner
  fragment once per row of a `repeater` field, with `{{itemFieldKey}}`
  resolving against each row. One level only (repeaters are already one level
  deep by construction — `nonRepeaterFieldTypeSchema`).

### Substitution + escaping semantics (correctness, not just security)

Even though the *template* is trusted raw HTML, interpolated *values* must be
escaped so a stray `<`, `&`, or `"` in a field value can't break the
surrounding markup:

- `text`, `number`, `boolean`, `select`, `color`, `link` (href),
  `image` (src): **HTML-escape** the value on substitution (and
  attribute-escape when the placeholder sits in an attribute context — the
  simplest robust approach is to HTML-escape `&<>"'` uniformly, which is valid
  in both text and quoted-attribute contexts). `boolean` renders as `""`/the
  field's value per a documented convention; `number` null → empty string.
- `richText`: the value is markdown. Convert it to **sanitized HTML** using
  the exact existing pipeline (react-markdown + `rehype-sanitize`, the same as
  `components/blocks/rich-text-field.tsx` / `RichTextBlock`) and interpolate
  the result **without** re-escaping — this is the one field type whose value
  is intentionally HTML. Server-side, render to a string via
  `react-dom/server`'s `renderToStaticMarkup`. Keep sanitization on richText
  regardless of the template-level "full raw HTML" decision — unsanitized
  markdown-HTML buys nothing and the pipeline already exists.
- Unknown/missing keys resolve to empty string (defensive — a stale template
  referencing a since-deleted field must not throw at render).

### Where interpolation runs

- **View mode (visitors + admins not editing): server-side.** Do the
  interpolation + richText render + (Phase 4) color remap in
  `components/pages/page-renderer.tsx`'s existing per-block server pass, and
  pass the finished HTML string down to the client block component as a
  precomputed prop (e.g. `renderedHtml`). Rationale: keeps the heavy work
  (markdown→HTML, color remap) off the client, and assembles the one
  dangerous HTML string in a single auditable server location.
- **Edit-mode live preview (admin editing an instance): client-side**, using
  the *same* pure interpolation function for scalar fields. richText preview
  can reuse the already-client react-markdown pipeline. This is a nicety, not
  the source of truth — see Phase 6 for how edit mode actually captures field
  values.

Keep the core interpolation a pure `(template, fields, data) => string` so
server and client share it verbatim.

---

## Phase 3 — Rendering + theme-matched coloring

### The rendering element

A new client component (e.g. `components/blocks/custom-html-block.tsx`, or an
HTML branch inside `CustomBlockRenderer`) that, in **view mode**, renders the
precomputed HTML string into a scoped wrapper:

```tsx
<Container className="py-6 sm:py-8">
  <div className="custom-html-scope" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
</Container>
```

This is the project's first `dangerouslySetInnerHTML` (the security review
noted its absence as a strength — see the security section for why this is an
accepted, bounded exception).

### Why theme-matching "just works" for every viewer (the key insight)

The 16 theme tokens are **inherited CSS custom properties** set on `<html>`
(visitor theme + accent + custom-theme inline vars, via
`components/theme/*`) and re-set on `PageRenderer`'s per-page `[data-theme]`
wrapper `<div>`. The custom-HTML block renders **inside** those wrappers, so at
that point in the DOM `var(--primary)` etc. already resolve to *whatever theme
this block is being displayed under* — per-page theme, a visitor's selected
built-in theme, or a visitor's custom theme. Nothing block-specific has to
detect or pass the theme; we just reference the tokens and the cascade does
the rest, and it recolors live when a visitor switches themes (the theme
provider mutates the same vars). Confirm during implementation that the
wrapper sits inside both the `<html>` token scope and `PageRenderer`'s
per-page `[data-theme]` div (it will, since blocks render within page body).

### The scoped stylesheet (`.custom-html-scope` in `app/globals.css`)

Parallel to the existing `.markdown-content` block, add a `.custom-html-scope`
rule set that colors bare elements from tokens, e.g.:

```css
.custom-html-scope { color: var(--foreground); }
.custom-html-scope h1, .custom-html-scope h2, .custom-html-scope h3,
.custom-html-scope h4 { color: var(--foreground); font-weight: 600; }
.custom-html-scope a { color: var(--primary); text-underline-offset: 2px; }
.custom-html-scope button { background: var(--primary); color: var(--primary-foreground); }
.custom-html-scope hr, .custom-html-scope table,
.custom-html-scope th, .custom-html-scope td { border-color: var(--border-strong); }
.custom-html-scope code, .custom-html-scope pre { background: var(--surface-2); }
.custom-html-scope blockquote { color: var(--muted); border-left: 2px solid var(--border-strong); }
/* …lists, small, hr, etc. — the same tag set .markdown-content already covers,
   plus button/table which markdown never emits. */
```

- **Specificity discipline:** keep every selector a single class + tag
  (low specificity) so the admin's own inline `style=""` (Phase 4 "leave
  alone" case) and any classes they write reliably win. These rules are a
  *floor* for unstyled markup, never an override of deliberate styling.
- Reuse `.markdown-content`'s existing spacing/typography conventions where
  they apply so custom-HTML output and richText output read consistently.

### Verification

- Place an HTML-mode block on a page; switch the page's theme in the Pages
  admin and confirm the block recolors. As a visitor, switch built-in themes
  and a custom theme and confirm the same block recolors each time with no
  reload. Confirm an element the admin colored explicitly (with
  `remapThemeColors` off) keeps its color across all themes.

---

## Phase 4 — Opt-in explicit-color remap (`remapThemeColors`)

When a definition has `remapThemeColors === true`, run a transform over the
interpolated HTML that rewrites explicit colors onto **theme-token references**
(not fixed hexes) so remapped colors still follow whatever theme the block is
shown under.

### Approach

- A server-side pure function (e.g. `remapColorsToTokens(html) => html`) run in
  the same `page-renderer.tsx` pass, after interpolation.
- Detect explicit colors via regex over inline `style="…"` declarations
  (`color:`, `background`/`background-color:`, `border-color:`) and legacy
  presentation attributes (`color=`, `bgcolor=`). A full DOM parse would need
  a parser dependency; regex over inline styles/attributes is the pragmatic,
  dependency-free scope. **Document the known limit:** colors declared inside a
  `<style>` block within the template are not remapped (only inline styles /
  attributes are). That's an acceptable v1 boundary given full raw HTML is
  allowed anyway.
- For each detected color, parse it with `lib/color.ts` (`parseHex` etc.) and
  pick the **nearest theme token** by color distance against a single
  **canonical reference palette** (the base obsidian token values from
  `:root` in `globals.css`) — matching against a fixed palette (not the
  live theme) is what lets the output be a token *reference*: e.g. `#ee2222`
  → `var(--danger)`, `#33bb77` → `var(--primary)`. Because the replacement is
  `var(--token)`, it then re-resolves per theme automatically (same cascade as
  Phase 3).
- Restrict the candidate token set to the semantically sensible ones for
  foreground/background/border (`--foreground`, `--muted`, `--primary`,
  `--accent`, `--danger`, `--info`, `--surface`, `--surface-2`, `--background`,
  `--border`, `--border-strong`) so a stray off-white doesn't map to, say,
  `--online`.

### Notes

- Keep this a **pure string transform** with unit-testable input/output — it's
  the fiddliest piece and the easiest to get subtly wrong.
- The toggle is authored in the block-type builder (Phase 5) and stored on the
  definition (Phase 1); it is *not* a per-instance setting.

---

## Phase 5 — Admin UI (the block-type builder)

`components/admin/block-definitions-admin.tsx` (+ its create/update flow
through `/api/block-definitions/**`) gains the HTML authoring mode.

- **Mode switch:** a `renderMode` toggle (Fields ⟷ HTML) on the definition
  editor. In HTML mode, hide the `layout` picker (it's inert) and show:
  - A `<textarea>` (monospace, like the richText field editor's textarea) for
    `htmlTemplate`.
  - A **placeholder palette**: the definition's current field keys rendered as
    click-to-insert chips (`{{key}}`), plus the `{{#each}}…{{/each}}` snippet
    for any repeater field, so the admin doesn't have to remember exact keys.
    This is also why field-key validation (Phase 1) matters — the chips are the
    happy path, hand-typed keys are the fallible one.
  - The **`remapThemeColors` checkbox** with a one-line explanation ("Recolor
    colors you set to match the site theme").
- The **fields editor stays visible in HTML mode** — fields define the
  placeholder values. (Copy tweak: in HTML mode, fields are "referenced by
  `{{…}}`" rather than "arranged by a layout.")
- Optional but recommended: a small **live preview** in the builder that
  renders the template with each field's placeholder/sample value, using the
  Phase 2 client interpolation + the `.custom-html-scope` styling, so the admin
  sees theme-matched output before saving.
- Thread the three new fields through the `/api/block-definitions` create/
  update payloads and the GET shape. **Audit-log** create/update as today
  (`lib/audit-log.ts`) — no new audit call sites, just make sure the new
  fields ride along on the existing ones.

---

## Phase 6 — Wiring instance rendering through the existing pipeline

The per-instance render path (`page-renderer.tsx` → `registry.tsx` →
`page-blocks.tsx` → `custom-block-renderer.tsx`) must carry the three new
definition fields and branch on `renderMode`.

- **Thread the new fields onto `BlockDefinitionWithFields`** (the client-facing
  shape in `components/blocks/registry.tsx`) and the
  `BlockDefinitionApiRow`/`toBlockDefinitionWithFields` mapping in
  `components/pages/page-blocks.tsx` and the server prefetch in
  `page-renderer.tsx`. Add `renderMode`, `htmlTemplate`, `remapThemeColors`
  (and, for view mode, the server-precomputed `renderedHtml`).
- **Branch in `CustomBlockRenderer`:** if `definition.renderMode === "html"`,
  render the Phase 3 HTML component instead of a `LAYOUT_TEMPLATES` template.
  The existing layout templates and their slot-guessing are untouched for
  `"fields"` mode.
- **Edit mode for an HTML-mode instance:** there are no inline-editable slots
  inside arbitrary admin HTML, so in edit mode render a simple **field form**
  — reuse the existing per-field input components
  (`components/blocks/custom-fields/*`, the same ones the `stacked` template
  uses) in a stacked editor so admins edit each field's value, saving via the
  existing `onSaveData`/`PUT /api/blocks/[id]` path. View mode shows the
  interpolated HTML; edit mode shows the form (+ optional live preview from
  Phase 5's shared interpolator). This keeps HTML-mode instances editable
  without trying to make arbitrary markup contenteditable.
- **Add-block flow is unchanged:** `defaultDataForFields` already seeds a new
  instance's `Block.data` from the fields; HTML-mode types add through the
  same picker in `page-blocks.tsx` with no special case.
- `MissingBlockDefinitionNotice` and the built-in block types are untouched.

---

## Cross-cutting: security & the full-raw-HTML decision

Full raw HTML was chosen deliberately (locked decision 2). Record the
consequences so they aren't a surprise later:

- **This is the first `dangerouslySetInnerHTML` in the app.** The stored-XSS
  surface it opens is bounded to content authored by ADMIN/OWNER accounts
  (only they can create/edit block types and instances). The threat it accepts
  is a *compromised admin session* being able to persist markup that runs for
  every visitor. That is the accepted trade for the requested power.
  - **Recommendation (not blocking):** consider gating HTML *type creation* to
    OWNER (not any ADMIN) given the elevated capability, mirroring the
    OWNER-vs-ADMIN split the site already draws elsewhere. Confirm with the
    user before implementing if desired.
- **Non-obvious correctness caveat — inline `<script>` does not execute via
  `innerHTML`.** Browsers do **not** run `<script>` tags inserted through
  `innerHTML`/`dangerouslySetInnerHTML`. So "full raw HTML" gets iframes,
  embeds, styles, and all structural/visual markup working out of the box, but
  an inline `<script>` in the template will **not** run as-authored. If truly
  executable inline scripts are required, that needs a deliberate
  post-mount "script activation" step (clone each `<script>` node into a fresh
  element so the browser executes it) — a well-known pattern, but one that
  meaningfully raises the security weight and should be an explicit,
  separately-confirmed decision, not smuggled in. Default plan: **do not**
  auto-activate scripts; document that iframes/embeds work and inline scripts
  don't. Flag this to the user.
- **CSP interaction (forward-looking).** A future security-headers pass
  (previously queued) that adds a strict `Content-Security-Policy` will
  conflict with admin inline `style`/`<style>` and any script activation
  (`'unsafe-inline'`/nonce concerns). Note this here so whoever implements CSP
  knows custom-HTML blocks are a deliberate inline-content source to design
  around, not an oversight.
- **richText values stay sanitized** (Phase 2) — the one place per-instance
  markdown becomes HTML keeps `rehype-sanitize`.

## Cross-cutting: production-safety checklist (per CLAUDE.md)

- **One additive migration**, three defaulted/nullable columns on
  `BlockDefinition`, **no backfill, no dev-db ids/values in the SQL.** Read the
  generated `migration.sql` by hand before calling it done (the `ac831b6`
  lesson) — the live site runs this against a *different* database.
- **`prisma/seed.ts` untouched.** No new block type is seeded; if a demo
  HTML-mode type is ever added for illustration it must be an upsert inside the
  guarded `seedPagesAndNav()` bootstrap, never an unconditional create.
- **No new env vars, no Docker/`docker-compose`/`Caddyfile` changes, no new
  deploy step** — the existing `prisma migrate deploy` + `npm run db:seed`
  flow covers this.
- **No dev-only artifacts:** delete any scratch HTML-mode block types/instances
  and any temp admin account created for interactive verification before
  considering the work done.

## Suggested build order

Phases 1 → 2 → 3 give a working, theme-matched HTML block with scalar
placeholders (the core deliverable). Phase 6 wires it into the instance
pipeline (needed for 3 to be visible on a real page — 3 and 6 land together in
practice). Phase 4 (color remap) and the repeater `{{#each}}` half of Phase 2
are independent add-ons that can follow. Phase 5 (builder UI) is needed for an
admin to author one at all, but can be developed in parallel against the
Phase 1 schema.
