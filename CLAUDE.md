# JASS — Minecraft Server Website

See `PLAN.md` for the phased implementation plan (phases 0–8 complete; phases 9–11
— themes, resource pack hosting, setup wizard — specified and pending).

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

If a fresh `npm install`/`npx prisma ...` fails with the fatal error above, retry with
these flags before assuming something is actually broken.

## Environment variables

Copy `.env.example` to `.env` and fill in real values:

- `DATABASE_URL` — SQLite file path (default `file:./prisma/dev.db`)
- `AUTH_SECRET` — Auth.js session secret
- `MC_SERVER_HOST` / `MC_SERVER_PORT` — Minecraft server for the live status ping (Phase 5)

## Project structure

- `app/` — routes, layouts, pages (App Router)
- `components/` — shared UI components
- `lib/` — data layer, Prisma client singleton, utilities
- `prisma/` — schema, migrations, and the local SQLite DB file
