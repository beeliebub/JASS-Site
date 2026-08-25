<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# JASS — agent & LLM guide

Cross-tool instructions for any coding agent (Claude Code, Codex CLI, Cursor, or a
plain LLM). Claude Code also reads `CLAUDE.md`; **Codex and most other tools do not**,
so the load-bearing project rules are summarized below. When they conflict, `CLAUDE.md`
is authoritative for Claude Code.

## Stack

Next.js 16 (App Router, TypeScript) + Tailwind CSS + Prisma 7 (SQLite) + Auth.js. It is
the website for a Minecraft server. Prisma 7 differs from older tutorials: config lives
in `prisma.config.ts`, and the client needs an explicit driver adapter (see
`lib/prisma.ts`, `@prisma/adapter-better-sqlite3`).

## Critical rules (read before coding)

### Node V8 crash on this machine
`npm install` and several CLI tools crash with a V8 fatal error
(`InductionVariablePhiTypeIsPrefixedPoint`) on this machine. Workarounds:
- `npm install` → prefix `NODE_OPTIONS="--jitless"` (breaks WASM — never use for Prisma).
- Prisma CLI → invoke the JS entry directly with `--no-turbofan`, e.g.
  `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name <name>`.
- `tsc` / eslint → `node --no-turbofan node_modules/typescript/lib/tsc.js --noEmit`,
  `node --no-turbofan node_modules/eslint/bin/eslint.js`.
- Seed / create-admin (tsx) → `node --no-turbofan -r tsx/cjs prisma/seed.ts`.

Retry with these flags before assuming something is actually broken.

### Production-safety (every change touching prisma/, seed, env, or deploy files)
This checkout is the development/source repository, not the live site. The live
site is deployed later by pulling this repo to a VPS and running
`prisma migrate deploy` + `npm run db:seed -- --pages-only` against a **different** SQLite database.
There is no staging environment — this is a careful read of the diff.
- **No hardcoded ids/rows from this dev DB in a migration.** Backfills must key on
  stable identifiers (slugs, type strings, FKs), never a literal cuid/id/count read off
  `prisma/dev.db`. (A hardcoded id already broke a real deploy once — commit `ac831b6`.)
- **`prisma/seed.ts` stays idempotent** — every write is an upsert (or guarded insert).
- **New/changed env vars** documented in both `.env.example` and `docs/DEPLOYMENT.md`.
- **New Docker/deploy dependencies** reflected in `Dockerfile` / `docker-compose.yml` /
  `docs/DEPLOYMENT.md`.
- **No dev-only artifacts** (temp admin accounts, scratch pages, debug logging) left behind.

Custom Page slugs may contain one to three lowercase kebab-case segments joined
by `/`. Exact static slugs remain reserved; nested slugs cannot begin with
`admin`, `api`, `login`, `account`, `news`, or `resource`. Pages may redirect to
absolute HTTP(S) URLs or root-relative paths, but protected pages cannot redirect.

### Verification (there is no test runner)
Typecheck → lint → build only when routing or the server/client boundary changed → manual walkthrough
against `npm run dev`. Do not write test files or invoke `npm test`; nothing is installed to run them.

### `PLAN.md` is an ephemeral work queue, not documentation
Never treat it as a source of truth about how the site behaves, and never migrate its contents into
`README.md`, `AGENTS.md`, `docs/DEPLOYMENT.md`, or a code comment. Valid edits: add scoped work, delete
items that have landed, clear it back to its reusable skeleton when empty. Do not delete the file.

### Git
Read-only git is expected (the production-safety pass is a careful read of the diff). **Never commit,
push, branch, stage, reset, revert, stash, or rewrite history** — the user owns git history.

### No AI-attribution in shipped artifacts
No code comment, JSDoc, schema comment, doc line, or commit message may reference AI agents, reviews,
or the planning process — no "found in review", no agent names, no `PLAN.md` phase labels or decision
numbers. State the reasoning directly; a comment must stand on its own to someone reading the file
cold.

## Skills

Reusable, task-specific playbooks. Load a skill's `SKILL.md` when the task matches.

- **Claude Code** auto-discovers them under `.claude/skills/<name>/`.
- **Codex / other tools** read them under `.agents/skills/<name>/` (each also has an
  `agents/openai.yaml` interface file). The two trees hold the same skills.

**Project-specific (written for this codebase, prefer these over the generic ones):**
`jass-stack-pro` — this stack (Next 16 / Prisma 7 / Auth.js v5) and this app's architecture: the
block system, the route contract, theming, uploads, and the deploy reality.
`typescript-coding-standards` — TypeScript conventions here: type design, Zod style, error handling,
async discipline, module boundaries, and the no-test-runner verification loop.

Generic (cross-project baselines): `prisma-patterns`, `database-migrations`, `backend-patterns`,
`api-design`, `error-handling`, `nextjs-turbopack`, `react-patterns`, `react-testing`,
`react-performance`, `frontend-patterns`, `frontend-a11y`, `design-system`,
`frontend-design-direction`, `make-interfaces-feel-better`, `motion-ui`,
`coding-standards`, `verification-loop`, `tdd-workflow`, `security-review`,
`git-workflow`, `e2e-testing`, `docker-patterns`, `deployment-patterns`.

## Agents / subagents

- **Claude Code** — specialist subagents live in `.claude/agents/*.md` (invoke via the
  Task tool). Highlights: `code-reviewer`, `code-simplifier`, `code-architect`,
  `react-reviewer`, `typescript-reviewer`, `database-reviewer`, `security-reviewer`,
  `silent-failure-hunter`, `build-error-resolver`, `react-build-resolver`,
  `refactor-cleaner`, `performance-optimizer`, `a11y-architect`, `tdd-guide`,
  `e2e-runner`, `planner`, `architect`, `spec-miner`, `doc-updater`, `docs-lookup`,
  and more. `hardening-analyst` is the adversarial pass: it reviews a plan *before* code is written
  and the implementation again afterwards, against a numbered Pattern Library of defect shapes that
  have actually occurred in this codebase.
- **Orchestrated workflow** — `/orchestrator` (`.claude/commands/orchestrator.md`) drives the full
  sequence: scope → explore → design → harden the design → implement → verify → production-safety
  pass → review → sync docs → append newly discovered hardening patterns → keep the agent/skill files
  current → summarize. The pattern library is append-only and grows every run.
- **Codex CLI** — role agents live in `.codex/agents/*.toml` (see below). There is no orchestrator
  equivalent; drive the same sequence manually and follow the same rules.
- **Codex CLI** — role agents live in `.codex/agents/*.toml`, registered in
  `.codex/config.toml` (`explorer`, `reviewer`, `docs_researcher`). Steer them with
  `/agent`. See `.codex/AGENTS.md` for Codex specifics.
