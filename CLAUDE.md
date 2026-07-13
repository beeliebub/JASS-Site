# JASS — Minecraft Server Website

## Stack

Next.js (App Router, TypeScript) + Tailwind CSS + Prisma (SQLite) + Auth.js.

This project uses **Next.js 16** and **Prisma 7**, both recent major versions whose
APIs differ from older training data / tutorials. Before writing Next.js code, check
`node_modules/next/dist/docs/` (bundled docs for the exact installed version). Notable
Prisma 7 changes: config lives in `prisma.config.ts` (not `datasource url = env(...)`
in the schema), and the generated client requires an explicit driver adapter — see
`lib/prisma.ts` (uses `@prisma/adapter-better-sqlite3`).

## Commands

```bash
npm run dev              # start dev server, http://localhost:3000
npm run build             # production build
npm run start              # run a production build
npm run lint                # eslint
npm run db:seed           # seed placeholder content (re-runnable; --pages-only skips content overwrite)
npm run db:backup          # timestamped SQLite backup into backups/ (keeps last 7)
npm run create-admin        # create/update an OWNER or ADMIN account

# Prisma
npx prisma migrate dev --name <migration-name>   # create + apply a migration
npx prisma generate                                # regenerate the client into app/generated/prisma
npx prisma studio                                    # browse the SQLite DB
```

The seed script lives at `prisma/seed.ts`; all writes are upserts so it is safe to
re-run, and `npm run db:seed -- --pages-only` skips the content-overwriting portions.

## Known environment issue: Node V8 crash on this machine

`npm install` and some CLI tools crash with a V8 fatal error
(`InductionVariablePhiTypeIsPrefixedPoint`) on this machine's Node install. Workarounds:

- For plain `npm install`: prefix with `NODE_OPTIONS="--jitless"` (disables JIT; fine
  for install, but **breaks WebAssembly**, so never use it for Prisma commands).
- For Prisma CLI commands (which need WASM): invoke the JS entry directly with
  `--no-turbofan` instead of going through `npx`, e.g.:
  `node --no-turbofan node_modules/prisma/build/index.js migrate dev --name init`
  (`--no-turbofan` isn't allowlisted for `NODE_OPTIONS`, so it must be passed directly
  to `node` on the actual entry file, not via `npx`.)
- The same crash also hits `npx tsc` and `npm run lint` (eslint) on this machine at
  times. Same fix, invoke the entry directly:
  `node --no-turbofan node_modules/typescript/lib/tsc.js --noEmit`
  `node --no-turbofan node_modules/eslint/bin/eslint.js`
- `npm run db:seed`/`npm run create-admin` (both run via `tsx`) also crash, and the
  usual fix doesn't work here: `tsx`'s own CLI (`node_modules/tsx/dist/cli.mjs`)
  re-spawns itself as a child process, so a `--no-turbofan` passed on the parent
  `node` invocation never reaches the process that actually crashes. Bypass the CLI
  entirely and use tsx's CommonJS register hook instead, which runs in-process (no
  spawn) and still resolves the `@/...` tsconfig path aliases these scripts use:
  `node --no-turbofan -r tsx/cjs prisma/seed.ts`
  (swap the script path for `scripts/create-admin.ts` etc. as needed).

If a fresh `npm install`/`npx prisma ...`/`npx tsc`/`npm run lint`/`npm run db:seed`
fails with the fatal error above, retry with these flags before assuming something
is actually broken.

## Environment variables

Copy `.env.example` to `.env` and fill in real values:

- `DATABASE_URL` — SQLite file path (default `file:./prisma/dev.db`)
- `AUTH_SECRET` — Auth.js session secret
- `MC_SERVER_HOST` / `MC_SERVER_PORT` — Minecraft server for the live status ping (Phase 5)

## Production-safety check (mandatory — every change, not just migrations)

The live site is deployed manually: the user pulls this repo to a VPS and
runs `prisma migrate deploy` + `npm run db:seed` (see `docs/DEPLOYMENT.md`)
against **a different SQLite database than this dev machine's**. A change
that only works against *this* `prisma/dev.db` is not done. This already
broke a real deploy once — commit `ac831b6`: a migration's backfill `UPDATE`
statements had `Block.id` values hardcoded from this dev database; those ids
don't exist on any other database, so `migrate deploy` failed with a
FOREIGN KEY constraint error on the remote server. Treat that as the
concrete failure mode to check for, not a hypothetical.

Before considering **any** change complete that touches
`prisma/schema.prisma`, `prisma/migrations/`, `prisma/seed.ts`, environment
variables, or `Dockerfile`/`docker-compose.yml`/`Caddyfile`:

- [ ] **No hardcoded ids/rows from this dev database in a migration.** Any
      data backfill in a `migration.sql` must be expressed as a query keyed
      on stable schema-level identifiers (unique slugs, type strings,
      foreign keys already in place) — never a literal id, count, or other
      value read off this machine's `prisma/dev.db`. Scan the migration for
      anything that looks like a Prisma cuid before calling it done.
- [ ] **`prisma/seed.ts` changes stay idempotent.** Every write must be an
      upsert (or an insert gated on proving the row doesn't exist yet),
      never an unconditional `create` outside the existing guarded
      `seedPagesAndNav()` bootstrap — the live database already has real
      content the first time any new seed code runs against it, so an
      unconditional create would duplicate rows or throw on a
      unique-constraint clash.
- [ ] **New/changed env vars are documented** in both `.env.example` and the
      table in `docs/DEPLOYMENT.md`, not just read via `process.env`
      somewhere.
- [ ] **New Docker/deploy-file dependencies are reflected.** A new package
      needing native compilation, a new directory that needs bind-mounting,
      or a new required build step — update `Dockerfile`/
      `docker-compose.yml`/`docs/DEPLOYMENT.md` to match rather than letting
      them silently drift from what the app actually needs.
- [ ] **No dev-only artifacts leak into what gets pushed** — temporary test
      accounts, scratch pages/posts/tags created for interactive
      verification, debug logging. Any temp admin account created to test a
      change must be deleted again before the change is considered done, not
      left sitting in the dev DB.

There's no staging environment for this project (see `docs/DEPLOYMENT.md`),
so this is a careful reading pass over the diff — migration SQL and seed
changes especially — not a live rehearsal against a second database.

## Project structure

- `app/` — routes, layouts, pages (App Router)
- `components/` — shared UI components
- `lib/` — data layer, Prisma client singleton, utilities
- `prisma/` — schema, migrations, and the local SQLite DB file
