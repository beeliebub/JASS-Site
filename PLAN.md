# Open work requiring the JASS Panel daemon or the VPS

The website-side implementation is complete. The items below are what remains. Checks marked *local* ran against a scratch copy of the database or a scratch Caddy instance on high ports; none touched the live proxy or the live database.

## Actionable on the website

- **Session route returns `401` during a database lock, not the documented `5xx`.** Evidence (*local*, `app/api/panel/session/route.ts`): with an exclusive lock held on a copy of the database for 12 to 15 seconds, `GET /api/panel/session` with a valid OWNER cookie returned `401` after about 6 seconds. The identity route returned `500` under the same lock. The `jwt` callback's `unknown` branch did run and log, and Auth.js then logged a `JWTSessionError` (cause `invalid type: unit value, expected usize`). Auth.js's session action turns that failure into a null session, so `auth()` cannot distinguish "lookup failed" from "not signed in", and the route's independent live read never runs. The panel treats `401` as "not signed in" and redirects to login; `docs/DESIGN.md` §4 requires `5xx` for "unavailable". No `Set-Cookie` is sent on the failing response, so the site token is not cleared. Needed: make a database failure on this route return `5xx` (for example by decoding the session cookie in the route and doing the live read there), then run the auth-gate hardening pass and re-run the lock probe. The comment in the route claims the live read covers this case; it does not.

## Decisions needed before the walkthrough can be written

- **"Demoted returns `user: null`" cannot happen with the current roles.** The role enum has only `OWNER` and `ADMIN`, and both are eligible. Demotion returns the new role on the next request (*local*: OWNER to ADMIN was reflected by both routes with no re-login). Only deletion yields `user: null`. Decide whether demotion should remove panel access (which needs a third role or an explicit status) or whether the walkthrough should only expect deletion to return `null`.
- **Scheduled actions on a site outage: "pause" versus "skip".** The original requirement says a scheduled action pauses, not cancels, on a site outage. The panel queue (panel Phase 5) says a firing is skipped and recorded when the website cannot be reached, with no pending queue. `docs/DEPLOYMENT.md` says a `5xx` from the identity route should pause the action. Decide whether unreachable and `5xx` should differ, and which outcome the daemon records for each. The panel queue has to be changed to match whatever is decided.

## Blocked on the panel daemon (`/home/beeliebub/Desktop/JASS Panel`)

The daemon is written from the panel repository's own queue, `/home/beeliebub/Desktop/JASS Panel/PLAN.md`, which has Phases 2 to 7. Phase 2 (skeleton: config, gate, `authorize`, route table, audit writer) is the first phase there and has not been started. The items below depend on it and on the phases named after each one.

- **Panel capability grants** (panel Phase 2 `authorize` and route table; panel Phase 4 grants editor). Requirement as originally written: an OWNER must be able to grant and revoke for an ADMIN every panel capability an OWNER can use, including capabilities added later. Keep grants OWNER-managed and keyed by the user's stable `id`. This site already returns `id` and `role`; it does not own grant storage or UI.
- **`src/server/gate/identity-lookup.ts`** (panel Phase 5, schedules). Requirement as originally written: build the client against `POST /api/panel/identity` (path, contract and env as in `docs/DEPLOYMENT.md`) and verify end to end that a scheduled action pauses, not cancels, on a simulated site outage, and that a demoted or deleted OWNER/ADMIN's next scheduled check returns `user: null` within one polling interval. Website side is ready (*local*: `200` for eligible users, `user: null` for missing ones, `500` after about 6 seconds under a database lock, `200` after release). The client must treat a timeout (the route expects a 3-second client timeout), a `5xx`, or a malformed body as "unavailable", never as `user: null`.
- **Loopback session forwarding** (panel Phase 2 gate). Website side is verified locally with `AUTH_URL=https://...`: `200` with no `Set-Cookie` for OWNER and ADMIN; `401` for no cookie, a garbage cookie, or a deleted user; `404` for a public `Host`. The daemon's cookie forwarding still needs to be built and checked against that.

## Blocked on the VPS or on designated accounts

- **Caddy on the VPS.** *Local* Caddy 2.11.6 with the repository Caddyfile: empty `conf.d` (warning only), populated `conf.d` (`/panel`, `/panel/`, `/PANEL` reach the panel handler), and a loose `reverse_proxy` outside `handle` (it reaches the site, not the panel). Every `/api/panel` variant in the matrix is refused with `404`: `/API/PANEL/…`, `/api/%70anel/…`, `/api//panel/…`, `/api/x/../panel/…`, for both `session` and `identity`. The repository Caddyfile did not load before this pass (`handle /api/panel /api/panel/*` is a parse error in Caddy 2.11.6). It now uses a named `path` matcher, and the live VPS needs that Caddyfile installed (see the manual update in `docs/DEPLOYMENT.md`). Still open: run the same matrix against the installed VPS Caddy version with the real `/etc/caddy/conf.d`.
- **Live-account walkthrough.** *Local* results on a scratch database: a demoted OWNER is reflected on the next request; deleted accounts return `401`/`null`; with two OWNERs demoting or deleting each other at the same moment, 20 of 20 rounds ended with one request `200` and the other `409`, and the OWNER count never reached zero. That race ran inside one process. Still open: the same on the live site with designated test accounts (none are designated), and a race from a second process such as `db:seed` or `create-admin`.
- **Production SQLite.** *Local*: identity recovered to `200` after a 15-second lock was released. Still open: confirm the production proxy and route-handler connections behave the same on the VPS, and confirm the `unknown` log line reaches the production log.

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
