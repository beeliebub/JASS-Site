# Open work requiring the JASS Panel daemon or the VPS

The website-side implementation is complete. These integration requirements remain to be implemented or verified outside this checkout:

- **Panel capability grants**: In the JASS Panel daemon, an OWNER must be able to grant and revoke for an ADMIN every panel capability an OWNER can use, including capabilities added later. Keep grants OWNER-managed and keyed by the user's stable `id`. This site already returns `id` and `role`; it does not own panel grant storage or UI.
- **Caddy behavior on the target VPS**: Validate the imported glob with an empty and populated `/etc/caddy/conf.d`, verify imported `/panel` handlers precede the default proxy handler, and exercise `/API/PANEL/session`, `/api/%70anel/session`, `/api//panel/session`, `/api/x/../panel/session`, `/PANEL`, `/panel`, and `/panel/` through real Caddy.
- **Production session integration**: With `AUTH_URL` set, verify the daemon's loopback request forwards the browser cookie unchanged and a valid `200` response has no `Set-Cookie`; verify invalid sessions, deleted users, and database errors fail closed as documented.
- **Live-account walkthrough**: Using designated test accounts, confirm role and email changes apply on the next request, deleted accounts lose access, and concurrent OWNER removal or demotion cannot remove the final OWNER.
- **Production SQLite behavior**: Confirm the production proxy and route-handler connections do not prevent the live-user lookup from recovering cleanly from a locked database and that the `unknown` path logs and preserves the site token.

---

# Reusable execution skeleton

Everything below this line is the reusable skeleton for the *next* batch of work once the items above
are completed and retired. It is not itself a description of current site behavior — that lives in
`README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DEPLOYMENT.md`, and the comment blocks in
`prisma/schema.prisma` and `lib/**`. Never migrate content from this file into those, and never treat
a line here as authoritative about current behavior.

**Hard rule: this file's own nomenclature — `Phase N`, `PLAN.md`, decision numbers — must never
appear in source code, comments, commit messages, or documentation.** A comment has to stand on its
own and still make sense after this file is deleted or replaced by the next one. The same applies to
any reference to agents, reviews, or the orchestration process.

## Execution checklist

1. Read `CLAUDE.md`, `AGENTS.md`, this file, and the relevant `.claude` skills and agents before
   touching the project. Read `node_modules/next/dist/docs/` before writing Next.js code — this is
   Next.js 16 and Prisma 7, not the versions most guidance describes.
2. Confirm the requested scope, the settled decisions, the acceptance criteria, and how the work will
   actually be verified. There is no test runner here; name the manual walkthrough.
3. Execute implementation phases in dependency order: schema and migration → validation schemas →
   `lib/` module → audit wiring → route handlers → server render wiring → client/admin UI → docs.
4. Batch verification. Run typecheck and lint once per implementation pass, after every edit in that
   pass is done; run `npm run build` only when routing or the server/client boundary changed.
5. Run the production-safety pass on any change touching `prisma/**`, `prisma/seed.ts`, environment
   variables, or the deploy files. The live database is not this one.
6. Update `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DEPLOYMENT.md`, `.env.example`, and the
   relevant schema/module comments whenever durable behavior changes.
7. Retire completed work items immediately. When no active item remains, preserve this skeleton and
   remove the completed work.

## Ground rules

- Preserve the existing conventions: the guard → parse → transaction+audit → revalidate → envelope
  route contract, one concern per `lib/` module, Zod schemas in `lib/validation/**`, and audit
  snapshots through the `*Snapshot` helpers.
- `OWNER` is a superset of `ADMIN`. Route every role check through `lib/auth-guard.ts`; never compare
  the role string by hand.
- Keep Prisma out of the client import chain. A helper needed on both sides goes in a Prisma-free
  module, the way `lib/routes.ts` and `lib/validation/nav-items.ts` already do.
- Validate persisted shapes on write **and** on read. A corrupt row falls back to a safe default
  rather than crashing a visitor's page — and a fallback value is never written back.
- Adding a block type touches a fixed set of registries, and `blockCreateSchema` is the one the
  compiler does not check. Name every location in the plan.
- Never put ids, counts, or values read from this machine's `prisma/dev.db` into a migration. Backfills
  key on slugs, type strings, or existing foreign keys.
- Every `prisma/seed.ts` write is an upsert or a guarded insert, and backfill logic belongs in a
  function the deploy actually runs on **every** deploy.
- Read-only git only. Never commit, push, branch, stage, reset, or rewrite history.
- Do not attribute shipped code, comments, or documentation to agents, AI, reviews, or planning
  phases.
- Respect explicit scope exclusions; do not infer additional passes or deliverables.

## Phase template

### Phase — <short outcome>

**Scope**: `<files or modules>`

#### Actions

1. <concrete action>
2. <concrete action>

#### Acceptance criteria

- <observable result>

#### Verification

- Typecheck / lint / build (say which, and why any is skipped)
- Manual: <the exact admin or visitor walkthrough that proves this works>

#### Production-safety

- <migration/seed/env/deploy impact, or "none — no deploy surface touched">

## Retirement checklist

- [ ] Durable outcomes are recorded in `README.md`, `CLAUDE.md`, `AGENTS.md`, `docs/DEPLOYMENT.md`,
      `.env.example`, and the relevant schema/module comments as current behavior — never as a record
      of work planning.
- [ ] No shipped comment, doc line, or commit message cites a retired work item, a phase label, an
      agent, or a review.
- [ ] The production-safety checklist was applied, item by item, for anything touching deploy surface.
- [ ] No dev-only artifacts remain: temp admin accounts, scratch pages/posts/tags/block types, or
      debug logging.
- [ ] Documentation-only changes did not trigger a build.
- [ ] No stale active item or execution-order section remains in this file.
