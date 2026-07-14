# Deployment: hosting decision, production build, and backups

This doc covers hosting decision, production build, and backups; SEO/meta is
handled separately (see `app/layout.tsx`, `app/page.tsx`, `app/opengraph-image.tsx`).
Nothing in this doc has been executed — the Dockerfile, `docker-compose.yml`,
and `Caddyfile` at the repo root are illustrative artifacts to review, not
things that have been run against real infrastructure.

## Hosting decision: VPS (Docker + Caddy), not Vercel

**Recommendation: deploy alongside the existing Minecraft server on a VPS,
running the app in Docker behind a host-level Caddy reverse proxy.**

### Why not Vercel

The app persists all editable content in SQLite via
`@prisma/adapter-better-sqlite3`, reading/writing a single file at
`prisma/dev.db` (see `lib/prisma.ts`, `prisma.config.ts`). Vercel's serverless
functions have an ephemeral, read-mostly filesystem with no persistent local
disk shared across invocations or deployments — a SQLite file written on one
invocation is not guaranteed to exist (or be current) on the next. That's
disqualifying for this app as it stands: every `ContentBlock`/`Rule`/
`Feature`/`Post` edit and every admin login would be at risk of silently not
persisting.

Making Vercel viable would mean migrating off SQLite to a remote database
(e.g. hosted Postgres) — swapping `@prisma/adapter-better-sqlite3` for a
Postgres driver adapter, updating `prisma/schema.prisma`'s `datasource`
provider, writing/running a data migration, and taking on a network hop (and
its cost) for every query that today is a local file read. That's a real
migration project, not a deployment step, and it's out of scope for "ship
what's built." It's worth revisiting later if the site needs Vercel's global
edge network or team-based preview deployments — it doesn't today.

### Why the VPS route fits

- **Zero DB migration.** SQLite-on-a-single-VPS-with-a-persistent-volume is
  exactly the deployment model the app already assumes in dev.
- **Already paying for the infrastructure.** The real Minecraft server is at
  `justasimpleserver.net` — presumably already a VPS somewhere. Running the
  website alongside it means one host to patch, monitor, and pay for instead
  of two separate platforms with different operational models.
- **Docker keeps the deploy reproducible** (pinned Node version, same build
  every time) without needing a full CI/CD platform. PM2 (a considered
  alternative) works too, and is simpler if Docker feels like
  overkill — see [PM2 alternative](#pm2-alternative-instead-of-docker) below
  — but Docker was picked here for the cleaner isolation from whatever else
  runs on the host (notably the MC server process itself).
- **Caddy** gets automatic HTTPS (Let's Encrypt) with a ~10-line config and
  no separate certbot/nginx setup.

### Reference artifacts (repo root)

- `setup.sh` (+ `scripts/lib/*.sh`) — the unified interactive setup wizard and
  the single entry point for all of the below: `./setup.sh` presents a menu, or
  use `--mode local|provision|deploy` directly. `scripts/vps-setup.sh` and
  `scripts/vps-start.sh` remain as thin back-compat wrappers over the same lib
  files, with their original flags and behavior.
- `Dockerfile` — multi-stage build: installs deps, runs `prisma generate` +
  `next build`, then a slim runtime stage that runs `npm run start`. Comments
  inline explain the better-sqlite3 native-module consideration.
- `docker-compose.yml` — binds the app to `127.0.0.1:3000` only (not public),
  bind-mounts `./data/db` and `./data/backups` so the DB and backup
  snapshots survive container rebuilds, and reads `.env.production` for
  secrets. `./data/db` maps to `/app/data` (not `/app/prisma`) because the
  Dockerfile bakes `schema.prisma`/`migrations`/`seed.ts` into `/app/prisma`
  in the image — bind-mounting the DB directly onto that path would shadow
  them and break `prisma migrate deploy`/`npm run db:seed`. A third
  bind-mount, `./data/uploads`, is added so resource packs (`UPLOADS_DIR`,
  content-addressed under `resource-packs/<sha1>.zip`) also survive rebuilds
  instead of living only inside the container layer.
- `Caddyfile` — host-level Caddy (outside Docker) terminating TLS for
  `justasimpleserver.net` and reverse-proxying to the container. Caddy has no
  default request body size limit, so the large resource-pack uploads
  (up to 256 MiB, enforced app-side) pass through untouched; add an
  explicit `request_body { max_size 300MB }` directive inside the site block
  if you want Caddy itself to reject oversized requests before they reach
  the app.

None of these have been built/run/deployed — verify the better-sqlite3
prebuild works for the actual host's OS/arch before relying on the Dockerfile
as-is (see comments in the file), and swap in the real domain once one is
decided (`justasimpleserver.net` is used as a placeholder throughout, since
that's the only real domain currently referenced anywhere in this repo — see
`MC_SERVER_HOST` in `.env`).

### PM2 alternative (instead of Docker)

If Docker turns out to be unwanted overhead on the host:

```bash
npm ci
npx prisma generate
npm run build
pm2 start npm --name jass -- run start
pm2 save
```

Caddy config is identical either way (`reverse_proxy 127.0.0.1:3000`) — only
how the Node process is supervised changes.

## Production build

`npm run build` was verified to succeed as part of this change (see the
command output in the PR/commit this doc shipped with). The new
`app/opengraph-image.tsx` route shows up as an additional static route in the
build output (`○ /opengraph-image`), generated once at build time since it
has no request-time data dependency.

## Environment variables on the host

Whichever hosting route is used, the host needs a `.env` (VPS/PM2) or
`.env.production` (Docker Compose, per `docker-compose.yml`'s `env_file`)
with real production values:

| Variable | Notes |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` on a VPS/PM2 host; `file:/app/data/dev.db` in the Docker Compose setup above (matches the bind mount — `docker-compose.yml` sets this itself via its `environment:` block, overriding whatever `.env.production` has). |
| `AUTH_SECRET` | **Must be regenerated for production** — do not reuse the value currently in this repo's local `.env`, which is a dev-only secret. Generate a fresh one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. |
| `MC_SERVER_HOST` / `MC_SERVER_PORT` | Already `justasimpleserver.net` / `25565` in `.env` — carry the real values over. |
| `NEXT_PUBLIC_SITE_URL` | Optional. Used by `app/layout.tsx` to set `metadataBase` for absolute OG/canonical URLs. Defaults to `https://justasimpleserver.net` if unset. |
| `AUTH_URL` | **Must be set to the real public URL** (e.g. `https://justasimpleserver.net`) in production. The app sits behind Caddy's reverse proxy (see the Caddyfile), and `auth.ts` sets `trustHost: true` so Auth.js will trust the proxy's forwarded host — but that only covers request-time host detection; anywhere Auth.js needs a fully-qualified callback/redirect URL at boot, `AUTH_URL` is the authoritative source. Leaving it unset/wrong can cause broken redirects or cookie misbehavior behind the proxy. |

## Pre-deploy security checklist

Run through this before every real production deploy, not just the first one:

- [ ] **Rotate `AUTH_SECRET`.** Generate a fresh value — do not reuse the dev
      secret or a previous deploy's secret. The generation command is in
      `.env.example`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
      Rotating invalidates all existing sessions, which is expected.
- [ ] **Set `AUTH_URL`** to the real public URL (see the table above).
- [ ] **Re-run `npm audit`** and re-verify any findings are still transitive
      dev-tooling only (as of the last check: Prisma's dev server via
      `@prisma/dev`/`@hono/node-server`, and Next's bundled PostCSS — not
      present in the production runtime). Do **not** run
      `npm audit fix --force` — it would downgrade to breaking major
      versions. Re-check this reasoning at deploy time rather than trusting
      this note as dependencies drift.
- [ ] **Verify security response headers** are present on a live response:
      `curl -I https://<host>` and confirm `Content-Security-Policy`,
      `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
      `Strict-Transport-Security`, and `X-Frame-Options` are all set (see
      `next.config.ts`'s `headers()`).

After the first deploy, seed the first admin the same way as in dev. **Use
`--role OWNER` for this very first account** — `OWNER` is the only role that
can manage other user accounts, so a fresh deploy needs at least
one before anyone else can be invited:

```bash
node --no-turbofan node_modules/prisma/build/index.js migrate deploy
npm run db:seed -- --pages-only
npm run create-admin -- <email> <strong-password> --role OWNER
```

(`migrate deploy` — not `migrate dev` — applies existing migrations without
prompting or generating new ones; it's the correct command for production.
`--role` accepts `OWNER` or `ADMIN`, case-insensitive, and defaults to `ADMIN`
if omitted — so every subsequent invite after the first OWNER should
normally omit it unless that invitee also needs account-management rights.)

**Run `npm run db:seed -- --pages-only` after every deploy, not just the
first.** This is a permanent part of the redeploy process from here on, not
a one-off step for the initial launch. `seedPagesAndNav()` and
`seedStaticRoutePages()` (the two functions `--pages-only` runs) are both
guarded/upsert-based specifically so they're safe to run repeatedly against
a live database that already has real admin-authored content — but that
safety only pays off if the step is actually routine. Skipping it on any
deploy after the first is exactly how the `resource`/`login`/`account`/
`admin` protected `Page` rows ended up missing in production: those rows
were added to `seedStaticRoutePages()` after the first deploy, and because
redeploys only ran `migrate deploy`, that new seed-backfill logic never
reached the live database. Future code changes will keep adding backfill
logic the same way (new protected pages, new default nav items, etc.), and
each one depends on this step running on every deploy to actually take
effect.

**Always use `--pages-only`, never the bare `npm run db:seed`.** Without the
flag, `main()` also runs `seedContentBlocks()`, `seedRuleSections()`,
`seedFeatures()`, and `seedPosts()` — which unconditionally reset
`ContentBlock`/`Rule`/`Feature`/`Post` to their hardcoded placeholder values
on every run, with no guard for existing content. Running the bare command
against a live site would destroy real admin-edited copy, rules, features,
and posts. `--pages-only` skips exactly those four functions and only runs
the two safe, guarded ones above.

## Backup story for the SQLite DB

### Why not a raw file copy

SQLite is a single file (`prisma/dev.db`; `prisma.config.ts` does not enable
WAL mode, so there are no `-wal`/`-shm` sidecar files to worry about
today — but the backup approach below is safe even if that changes later).
Copying `prisma/dev.db` directly with `cp` while the app is live can race a
writer and capture a torn/inconsistent snapshot. SQLite's own `VACUUM INTO`
avoids that: it produces a complete, consistent snapshot into a new file in
one transaction, safe to run against a live database.

### The backup script

`scripts/backup-db.ts` (run via `npm run db:backup`) runs `VACUUM INTO`
through the existing Prisma client (`lib/prisma.ts`) — no new dependency
needed, it reuses the same better-sqlite3 driver adapter the app already
uses — and writes a timestamped file to `backups/dev-<timestamp>.db`
(`backups/` is gitignored, same as `prisma/dev.db` itself). It also prunes
anything beyond the most recent 7 backups after each run.

Verified locally against the real `prisma/dev.db`:

```
$ npm run db:backup
Backup written to <repo>/backups/dev-20260708-193145.db
```

The output file was confirmed to be a valid SQLite database (correct file
header).

### Scheduling

**Cron (simplest, works identically on a plain VPS or inside the app
container if cron is available there):**

```cron
# /etc/cron.d/jass-db-backup — daily at 03:15
15 3 * * * deploy cd /opt/jass && /usr/bin/npm run db:backup >> /var/log/jass-backup.log 2>&1
```

**systemd timer (preferred on a systemd host — gives you status/logs via
`systemctl status` and `journalctl`):**

```ini
# /etc/systemd/system/jass-db-backup.service
[Unit]
Description=JASS SQLite DB backup

[Service]
Type=oneshot
WorkingDirectory=/opt/jass
ExecStart=/usr/bin/npm run db:backup
User=deploy
```

```ini
# /etc/systemd/system/jass-db-backup.timer
[Unit]
Description=Run JASS DB backup daily

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

Enable with `systemctl enable --now jass-db-backup.timer`.

### Retention

The script itself keeps the **last 7 daily backups** (`RETENTION_COUNT` in
`scripts/backup-db.ts`) and deletes older ones on every run — no separate
cleanup cron needed. If off-host durability is wanted later (the VPS itself
dying takes both the live DB and its local backups with it), the next step
would be an additional weekly job that copies the newest file in `backups/`
to off-host storage (e.g. `rclone`/`rsync` to another host or object
storage) — not implemented here, flagged as a reasonable follow-up.

### Restoring from a backup

```bash
# Stop the app first so nothing writes to prisma/dev.db mid-restore.
cp backups/dev-<timestamp>.db prisma/dev.db
# Docker Compose equivalent: cp backups/dev-<timestamp>.db data/db/dev.db
```
