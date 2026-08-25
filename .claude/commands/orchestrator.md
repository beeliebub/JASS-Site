---
description: End-to-end orchestration for a feature/fix on this Next.js + Prisma site — explores, designs, implements, verifies typecheck/lint/build, reviews, runs the production-safety pass, and syncs docs using this project's specialized agents and the jass-stack-pro skill.
argument-hint: [description of the feature, fix, or refactor to build]
---

# /orchestrator

**Task**: $ARGUMENTS

You are coordinating a multi-phase workflow for this project: **JASS**, the website for a Minecraft
server — Next.js 16 (App Router, TypeScript), Tailwind v4, Prisma 7 on SQLite with an explicit driver
adapter, Auth.js v5, Zod v4. No DI framework, no test runner installed. Content is admin-authored
through a block-based page builder (`Page` → `Block` → the registry in
`components/blocks/registry.tsx`), and every mutation goes through a route under `app/api/**` that
validates with Zod, gates on `lib/auth-guard.ts`, writes an audit-log entry, and revalidates the
affected path.

You do the actual reading/writing of code yourself in the phases that call for it; specialized
subagents (via the `Agent` tool) handle exploration, design review, and independent-perspective
review so their findings don't get lost in your own context.

**Git rule for this project**: read-only git (`git status`, `git diff`, `git log`, `git show`) is
allowed and is in fact *required* by the production-safety pass in Phase 4.5 — that pass is a careful
read of the diff. **Never commit, push, branch, stage, reset, revert, stash, or rewrite history**, in
this command or in any subagent you dispatch. The user owns every write to git history.

**No AI-attribution in shipped artifacts.** No code comment, JSDoc, schema comment, README line, or
commit-ready text you or any dispatched agent writes may reference AI agents, reviews, or this
orchestration process ("found in review", "flagged by security-reviewer", agent names, `PLAN.md`
phase labels, decision numbers, etc.). State the underlying reasoning directly — anyone reading the
shipped code must have no way to tell agents were involved. This applies to every phase below, not
just implementation: when relaying a review finding into a comment or a fix, translate it into a
plain statement of the rule or the failure it prevents, never a citation of the finding or the agent
that raised it. This project's own comments are the model to imitate — see `lib/auth-guard.ts` or
`lib/uploads.ts`, which explain *why* a guard exists without citing where the guard came from.

Throughout, load the `jass-stack-pro` skill for anything specific to Next.js 16 / Prisma 7 /
Auth.js v5 / this app's block system, and the `typescript-coding-standards` skill for general
TypeScript style. Both apply continuously, not just in one phase.

## This is NOT the Next.js or Prisma you remember

Next.js 16 and Prisma 7 are recent majors whose APIs differ from most training data and nearly every
tutorial online. Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/`
— the bundled docs for the exact installed version. Specifics that routinely trip up remembered
knowledge, and which you must not "fix" back to the older shape:

- Middleware lives in **`proxy.ts`**, not `middleware.ts`.
- Route handler params are a **Promise**: `{ params }: { params: Promise<{ id: string }> }`, awaited
  in the body.
- Prisma config lives in **`prisma.config.ts`**, not a `datasource url = env(...)` line in the schema,
  and the generated client requires an **explicit driver adapter** (`@prisma/adapter-better-sqlite3`,
  see `lib/prisma.ts`). The client is generated into `app/generated/prisma` (gitignored).
- Zod v4, not v3 — `z.enum`, `issue.path`, and `error.issues` shapes follow v4.

If a plan or a memory disagrees with `node_modules/next/dist/docs/`, the bundled docs win.

## Ask a lot of questions. Guessing is the failure mode.

**Ask the user about anything ambiguous, underspecified, or requiring guesswork — and then ask more.**
This is not a politeness ritual and it is not limited to Phase 0; raise a question the moment an
ambiguity appears, at any phase. An unstated assumption that survives into implementation costs far
more than a question did.

- Use `AskUserQuestion`, batched up to four at a time, and run **several rounds** — resolving one set
  of answers usually exposes the next set. Two or three rounds on a standard feature and four or more
  on a large one is normal, not excessive.
- **Ground every question in the code first.** Explore, then ask. A question that names the actual
  route, Zod schema, block type, or Prisma model you are worried about gets a decisive answer; a
  vague one gets a vague answer and you will have to ask again.
- Ask about anything where two readings would produce **materially different work**: which of two
  existing patterns to follow, whether an adjacent broken thing is in scope, what happens to existing
  rows when a shape changes, whether a capability is ADMIN or OWNER, whether a new field is nullable
  or defaulted, what an admin should see when the data is missing.
- **Recommend, don't just enumerate.** Put your recommended option first and mark it. You have read
  the code; the user has not just read it. Silent neutrality is not helpfulness.
- **Do not ask what you can determine yourself.** Read the file. Grep the tree. Questions are for
  decisions that are genuinely the user's — trade-offs, scope, priorities, product behavior — never
  for facts sitting in the repository.
- If an answer contradicts an earlier one, say so explicitly, state which reading you are treating as
  governing and why, and record the resolved tension in the design/plan so nobody re-litigates it.
- Record every answer as an explicit decision in whatever artifact you produce, phrased so a fresh
  agent executing it later cannot mistake a settled decision for an open one.

---

## Phase 0 — Scope the Task

- Read `$ARGUMENTS` and restate the goal in one or two sentences.
- Classify the size: **small** (one component or one route handler, no schema change, no new
  API surface) vs. **standard** (a new block type, a new admin screen, a new API resource, or a
  change touching several modules) vs. **large** (a new Prisma model or migration, a new
  cross-cutting subsystem, or a change to auth/roles/audit/uploads).
- Note immediately whether the task touches **`prisma/schema.prisma`, `prisma/migrations/`,
  `prisma/seed.ts`, environment variables, or `Dockerfile`/`docker-compose.yml`/`Caddyfile`.** If it
  does, Phase 4.5's production-safety pass is mandatory and you should plan for it from the start,
  not discover it at the end.
- For **small** tasks, you may collapse Phases 2–3 into a single lightweight design pass instead of
  dispatching separate agents — use judgment, don't over-orchestrate a one-line fix.
- If the request is ambiguous, ask before proceeding — see "Ask a lot of questions" above. For
  anything **standard** or **large**, assume up front that you will need multiple rounds of
  clarifying questions and budget for them rather than guessing to keep moving.

## Phase 1 — Explore

Dispatch the `code-explorer` agent (foreground if its findings gate the next phase) to map the
relevant existing surface: which route handlers, `lib/` modules, validation schemas, and components
are involved; where the server/client boundary sits; what the data flow is from request to Prisma to
rendered page. Point it at the specific paths you believe are in scope — don't make it search blind.

If the task needs Next.js 16 / Prisma 7 / Auth.js v5 specifics you're not certain of, consult the
`jass-stack-pro` skill and `node_modules/next/dist/docs/` now rather than guessing.

## Phase 2 — Design

Choose based on task size from Phase 0:

- **Standard feature**: dispatch `code-architect` for a concrete implementation blueprint (files to
  create/modify, data flow, build order).
- **New subsystem, new Prisma model, or an architectural decision with real trade-offs**: dispatch
  `architect` first for the system-level design and trade-off analysis, then `code-architect` for the
  concrete blueprint.
- **Multi-phase or higher-risk work** (schema/migration, auth or role boundaries, audit-log or undo
  behavior, uploads, anything the live deploy runs): dispatch `planner` for a phased implementation
  plan. This project expects plans to call out explicitly what happens to **rows that already exist
  in the live database**, and to name the docs that must be updated.
- **Small task**: do a lightweight design pass yourself, grounded in what Phase 1 found.

## Phase 2.5 — Harden the Design (before any code is written)

Dispatch `hardening-analyst` against the design/plan **and the source files it builds on**, for
anything **standard** or **large**. Run it before implementation, not after — the findings it
produces are usually "this plan is built on something already broken," which is cheap to absorb into
a plan and expensive to retrofit into finished code.

Give it: the plan text or design summary, the specific files it touches, and any decisions the user
has already made (so it hardens the chosen approach rather than relitigating it).

It reports findings as `PRE-EXISTING`, `INTRODUCED`, or `AMPLIFIED`. Treat all three as in scope — a
pre-existing defect on the path this change depends on is this change's problem, because building on
it produces a feature that appears to work and is wrong. Fold every CRITICAL and HIGH finding into
the plan as concrete work with acceptance criteria; if you deliberately defer one, say so and why.

**Then re-ask the user.** A hardening pass routinely surfaces genuine trade-offs the earlier rounds
could not have anticipated (what happens to existing rows, whether a fallback should be silent,
whether a capability is ADMIN or OWNER, how far to fix adjacent breakage). Take those back to the
user as another round of questions rather than deciding them silently.

Present the resulting design/plan to the user for anything **standard** or **large** before
implementing. Proceed without pausing only for genuinely small, low-risk changes.

## Phase 3 — Implement

Implement the approved design yourself, directly:

- Follow the conventions Phase 1 identified. Don't invent a new pattern when an existing module
  already owns this responsibility — `lib/api-response.ts` owns the JSON envelope, `lib/auth-guard.ts`
  owns the role gates, `lib/audit-log.ts` owns snapshots and undo, `lib/validation/**` owns every
  request schema, `lib/uploads.ts` owns every filesystem path.
- **Every mutating route handler follows the established shape**: `requireAdmin()` (or
  `requireOwner()`), then `requireEditingEnabled()` where site-editing applies, then JSON parse guard,
  then Zod `safeParse`, then the Prisma write inside `$transaction` alongside `recordAuditLog(...)`
  using the matching `*Snapshot` helper, then `revalidatePath(...)`, then `apiSuccess(...)`. Diverge
  only where an existing route deliberately does (e.g. `/api/users/**` is OWNER-gated and
  intentionally *not* behind the editing lock, so account management stays available while editing is
  locked) — and say so in the summary when you do.
- **Validate on write and on read.** Persisted `Block.data` is JSON-as-string; the render path
  re-validates it and falls back to a safe default rather than crashing a visitor's page. New
  persisted shapes get the same treatment.
- **Respect the server/client boundary.** Anything importing `lib/prisma.ts` (directly or through
  `lib/content.ts`, `lib/site-settings.ts`, `lib/uploads.ts`) is server-only; pulling it into a module
  a client component imports drags `better-sqlite3` into the client bundle and breaks the build. That
  is why `lib/routes.ts` exists separately from `lib/content.ts`, and why `lib/validation/nav-items.ts`
  is split out of `lib/validation/pages.ts`.
- **Adding a block type touches a fixed set of places.** `BLOCK_TYPES`, `blockTypeLabels`, the
  `*DataSchema`, `blockDataSchemas`, and the `blockCreateSchema` discriminated union in
  `lib/validation/pages.ts`; `blockComponents` and `defaultBlockData` in
  `components/blocks/registry.tsx`; the prefetch in `components/pages/page-renderer.tsx` if it needs
  reference data. Most of those maps are `Record<BlockType, …>` and the compiler catches a miss — the
  **discriminated union is not**, so a forgotten member there compiles cleanly and fails at runtime.
- Keep components and modules to a single responsibility; split a growing file by responsibility
  (route handler / data module / presentational component / admin editor) as you go.
- No comment or JSDoc may attribute itself to a review, an agent, or a `PLAN.md` phase — state the
  reasoning directly (see the "No AI-attribution" note above).

## Phase 4 — Verify

**Batch this. Run the verification commands once per implementation pass, after every edit in that
pass is done — not once per file, not once per `Edit` call.** A Next build is expensive in wall-clock
and in tokens spent reading output; re-running it after every incremental edit burns both for no
additional signal, since a mid-pass edit isn't expected to typecheck on its own.

This machine's Node install crashes with a V8 fatal error
(`InductionVariablePhiTypeIsPrefixedPoint`) when these tools are invoked through their normal CLIs,
so run the JS entry points directly (see `CLAUDE.md`):

```bash
node --no-turbofan node_modules/typescript/lib/tsc.js --noEmit
node --no-turbofan node_modules/eslint/bin/eslint.js
npm run build     # only when the change could affect the build graph, RSC boundaries, or routing
```

- Typecheck and lint are the cheap gates — run them on every implementation pass.
- `npm run build` is the expensive gate. Run it when the change touches route files, the
  server/client boundary, `next.config.ts`, or anything that could break static generation. Skip it
  for a change confined to logic inside an already-building module, and say so in the summary.
- **There is no test runner installed in this project.** Do not invent `npm test`. When a change
  deserves executable verification beyond typecheck, the options are a scratch script run through
  `node --no-turbofan -r tsx/cjs <path>` (deleted before you finish) or a manual pass against
  `npm run dev` — say which one you used.
- If a build or typecheck failure isn't a one-line typo, dispatch `build-error-resolver` with the
  exact error output rather than guessing at framework-specific causes. If you do fix it yourself,
  apply every fix the output implies and then re-verify **once** — don't re-run after each
  intermediate correction.
- **Never run typecheck/lint/build for a documentation-only change.** Edits confined to `README.md`,
  `CLAUDE.md`, `AGENTS.md`, `docs/**`, `PLAN.md`, `.claude/**`, or comments with no executable-line
  change cannot affect any of those outcomes — skip this phase entirely and say so in the summary
  instead of silently running it out of habit.

## Phase 4.5 — Production-Safety Pass (mandatory when the change touches deploy surface)

The live site is a **different SQLite database on a VPS**, updated by pulling this repo and running
`prisma migrate deploy` + `npm run db:seed -- --pages-only`. There is no staging environment, so this
is a careful reading pass over the diff — `git diff` the change and read the migration SQL and seed
changes by hand. A change that only works against this machine's `prisma/dev.db` is not done.

Two real deploys have already been broken by exactly this gap, and both failure modes are the
checklist below, not hypotheticals:

- A backfill `UPDATE` in a migration used `Block.id` values copied from this dev database; those ids
  exist nowhere else, so `migrate deploy` failed with a foreign-key error on the server (commit
  `ac831b6`, since fixed by keying the subquery on `Page.slug` + `Block.type`).
- New rows added to `seedStaticRoutePages()` never reached production because redeploys only ran
  `migrate deploy` and skipped the seed step (see `docs/DEPLOYMENT.md`).

Run the full checklist from `CLAUDE.md`:

- [ ] **No hardcoded ids/rows from this dev database in a migration.** Any data backfill must key on
      stable schema-level identifiers (unique slugs, type strings, existing foreign keys) — never a
      literal id, count, or value read off `prisma/dev.db`. Scan the generated SQL for anything that
      looks like a cuid before calling it done.
- [ ] **`prisma/seed.ts` changes stay idempotent.** Every write is an upsert, or an insert gated on
      proving the row doesn't exist yet. Anything added outside the guarded `seedPagesAndNav()`
      bootstrap will run against a live database that already has real content.
- [ ] **New/changed env vars documented** in both `.env.example` and the table in
      `docs/DEPLOYMENT.md` — not just read via `process.env` somewhere.
- [ ] **New Docker/deploy dependencies reflected** in `Dockerfile` / `docker-compose.yml` /
      `docs/DEPLOYMENT.md`.
- [ ] **No dev-only artifacts left behind** — temp admin accounts, scratch pages/posts/tags/block
      types created for interactive verification, debug logging. Delete them before finishing; the
      dev database is not a scratchpad you get to leave dirty.

For anything **standard** or **large** that touches this surface, dispatch `database-reviewer`
alongside the checklist rather than relying on your own read alone.

## Phase 5 — Review

Once verification is green, dispatch review agents. These are independent perspectives — run them in
parallel (single message, multiple `Agent` calls) since they don't depend on each other:

- `code-reviewer` — always
- `hardening-analyst` — always, now aimed at the implemented change rather than the plan. Give it the
  Phase 2.5 findings so it verifies they were actually fixed instead of re-deriving them, and so it
  can spend its effort on what implementation newly exposed.
- `security-reviewer` — always if the change touches auth, roles, an API route, admin-authored HTML,
  uploads, or anything reading `process.env`
- `silent-failure-hunter` — always if the change adds error handling, a `catch`, a fallback default,
  or filesystem/DB I/O
- `performance-optimizer` — if the change adds a query inside a render path, a new client component,
  or anything that scales with the number of blocks/pages/images
- `react-reviewer` / `typescript-reviewer` — for changes concentrated in components or in type
  design, respectively

Address CRITICAL and HIGH findings before moving on. A clean review (zero findings) from any of these
is a valid outcome — don't manufacture work to justify having run them. When a fix's comment explains
why a guard exists, write the reasoning itself, never "found in review" or the finding's severity.

If the change removed the need for old code, or you noticed dead code/duplication while implementing,
dispatch `refactor-cleaner` — but never on a file still under active development.

## Phase 6 — Sync Documentation

Dispatch `doc-updater` (or do it yourself for a small task) to sync, in the same change:

- `README.md` — the feature description, the scripts list, and the roles/accounts section if any of
  them changed
- `CLAUDE.md` — commands, environment variables, the production-safety checklist, and any new
  cross-cutting convention
- `AGENTS.md` — the mirrored summary Codex and other tools read, since they never read `CLAUDE.md`
- `docs/DEPLOYMENT.md` — the env-var table, the pre-deploy checklist, and the deploy sequence
- `.env.example` — every new or changed environment variable
- The comment blocks that carry this project's real design rationale — `prisma/schema.prisma`'s
  per-model comments, and the module-level JSDoc in `lib/**`. These are load-bearing documentation
  here, not decoration; a schema change with a stale model comment is an incomplete change.

## Phase 6.5 — Feed the Hardening Pattern Library (mandatory, every run)

`hardening-analyst` is read-only by design and **cannot edit its own file** — you own that write, so
additions get reviewed instead of self-applied. Its output ends with a required **NEW PATTERNS
DISCOVERED** section. Your job is to land it.

For every new pattern that agent proposed — and for every defect class **you or any other agent** hit
during this run that the Pattern Library does not already cover — append a full entry to
`.claude/agents/hardening-analyst.md`:

- Number sequentially (`P23`, `P24`, …). **Never renumber existing entries** — findings elsewhere
  cite them by number.
- Every entry needs all four parts: **Signature** (how to spot it), **Why it survives** ordinary
  review, **Detection** (a grep-able or mechanical heuristic, not a vibe), and a **Confirmed
  instance** with a real file/module reference from this codebase. An entry without a detection
  heuristic is a slogan and will not catch anything next time.
- If the new finding is a variant of an existing pattern rather than a new class, **strengthen that
  pattern's Detection section instead of adding a near-duplicate.** A library of 20 sharp patterns
  beats one of 60 overlapping ones.
- Update a `Confirmed instance` when this change **fixes** the instance it cites — swap in another
  real occurrence, or mark it fixed and keep the pattern. A pattern whose only example no longer
  exists still describes a real mistake; a pattern citing a fixed example as if it were live teaches
  the next pass something false.

The bar for inclusion is **transferability**: will this shape recur in a different module on a
different day? A one-off bug in one function does not qualify; the class of mistake it belongs to
does.

This is not optional and it is not "if there's time." The agent is only as good as what the last run
taught it — skipping this once costs every future run. If genuinely nothing new was found, say so
explicitly in the Phase 8 summary rather than passing over it in silence.

## Phase 7 — Maintenance: Keep `.claude/agents` and `.claude/skills` Current

This project's own agent and skill files encode assumptions about the codebase — route conventions,
guard helpers, the block registry, verification commands, deploy surface. Before finishing, check
whether **this** change invalidated any of those assumptions, and update the affected file(s)
directly if so:

| If this change... | ...update |
|---|---|
| Added a Prisma model, or changed an existing model's shape | `architect.md`'s architecture section, `code-explorer.md`, and `database-reviewer.md` if the new model has unusual delete/backfill semantics |
| Added or changed a block type, field type, or layout template | `jass-stack-pro`'s block-system section and `code-architect.md`'s build-order checklist |
| Changed a cross-cutting convention (a new guard in `lib/auth-guard.ts`, a new envelope helper, a new audit entity type, a new validation split) | every agent that describes the old convention — search for it, don't patch just one file |
| Changed the verification commands, the Node workaround, or the deploy sequence | `build-error-resolver.md`, the Phase 4 block above, `CLAUDE.md`, and `AGENTS.md` together |
| Upgraded Next.js, Prisma, Auth.js, React, or Zod across a major | `jass-stack-pro` and `typescript-coding-standards` |
| Invalidated a `Confirmed instance` cited in the hardening Pattern Library | `hardening-analyst.md` — repoint the citation, per Phase 6.5 |

If skills changed, mirror them into `.agents/skills/<name>/` too — `AGENTS.md` promises Codex and
Claude Code read the same skill set, and a drifted mirror silently breaks that promise.

Treat stale agent/skill guidance the same as a stale README: a defect introduced by this change, to
be fixed in this change. If nothing was invalidated, say so explicitly rather than skipping the check
silently.

## Phase 8 — Summary

Report to the user:

- What was built/changed (files touched)
- Design decisions worth flagging, including every decision that came from a clarifying-question
  round and any contradiction you resolved
- Verification actually run (which of typecheck / lint / build, and why any were skipped)
- The Phase 4.5 production-safety result, item by item, when the change touched deploy surface
- Review findings addressed (and any deliberately deferred, with reasoning)
- Hardening findings from Phase 2.5 and Phase 5, split by `PRE-EXISTING` / `INTRODUCED` /
  `AMPLIFIED` — pre-existing defects found on this change's path are worth calling out explicitly,
  since the user may not know they existed
- Patterns added to `hardening-analyst.md` in Phase 6.5, or explicit confirmation that nothing new
  was found
- Docs updated (README / CLAUDE.md / AGENTS.md / DEPLOYMENT.md / `.env.example` / schema comments)
- Any `.claude/agents` or `.claude/skills` files updated in Phase 7, or confirmation none needed it
- Suggested manual test steps — this project verifies UI and admin-flow changes by running
  `npm run dev` and clicking through as an admin, since there is no test suite to lean on
