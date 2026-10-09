# Deployment: hosting decision, production build, and backups

This doc covers hosting, production builds, and backups; SEO/meta is handled
separately (see `app/layout.tsx`, `app/page.tsx`, `app/opengraph-image.tsx`).
The VPS provisioning and deploy scripts use the repository's Docker Compose
and Caddy configuration. Validate the commands and routing on the actual host
before installing the separate server-panel daemon.

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
  `justasimpleserver.net` and reverse-proxying to the container. It refuses
  public `/api/panel` requests and imports service-owned routes from
  `/etc/caddy/conf.d/*.caddy`; the separate panel daemon installs its `/panel`
  route there. Caddy has no
  default request body size limit, so the large resource-pack uploads
  (up to 256 MiB, enforced app-side) pass through untouched; add an
  explicit `request_body { max_size 300MB }` directive inside the site block
  if you want Caddy itself to reject oversized requests before they reach
  the app.

## JASS Panel daemon

The Minecraft server control panel is a separate process and repository on
the VPS. In production, Caddy sends `/panel` and `/panel/*` to that daemon
using a snippet under `/etc/caddy/conf.d/`; these paths do not render through
Next.js. The Next `/panel` page is a signed-in fallback for local development
or a missing Caddy route. The daemon depends on this app to check sessions, so
the panel cannot authenticate users while the site app is unavailable.

The site is the source of the shared visual tokens in `app/globals.css`:
dark neutral surfaces, emerald primary actions, amber accents, Geist
typography, and compact radii. The daemon UI should use those tokens while
keeping its own denser server dashboard and navigation so it remains clearly
an operator tool. Site-owned panel links and fallback pages continue to use
the website's components and tokens.

The daemon must verify the browser session by making a loopback request to
`http://127.0.0.1:3000/api/panel/session` and forwarding the browser's `Cookie`
header verbatim. It must not forward or trust identity headers. A successful
response uses the standard `{ data: { user } }` envelope and returns only
`id`, `email`, `name`, and `role`; both `ADMIN` and `OWNER` pass this app's
gate. The daemon can cache positive results for a few seconds, but must not
cache a denial or server error.

The daemon owns panel capabilities. An OWNER must be able to grant or revoke
for an ADMIN every panel capability that an OWNER can use, including
capabilities added later. Keep the grant interface OWNER-only and associate
grants with the user's stable `id`; this site returns `role` so the daemon can
distinguish an OWNER from an ADMIN, but it does not store or enforce panel
capability grants.

- `401` means there is no valid live session. Send the browser to
  `/login?next=/panel&reauth=1` so a session accepted by the site but rejected
  by the daemon does not enter a redirect loop.
- `403` means the user is signed in but does not have an allowed role. Show a
  terminal no-access page; do not redirect to sign-in. The current user-role
  enum contains only `ADMIN` and `OWNER`, which both pass this gate.
- A `5xx`, timeout, or network error means authentication is temporarily
  unavailable. Fail closed and show a temporary-unavailable page.

The endpoint rejects non-loopback `Host` values, and the public Caddy site
returns `404` for `/api/panel` and `/api/panel/*`. The Host check is defense in
depth, not a network boundary: Docker Compose binds the app to
`127.0.0.1:3000`, while the PM2 setup can bind on `0.0.0.0:3000`. When using
PM2, the host firewall must block public access to port 3000.

Set `AUTH_URL` to the public HTTPS origin. Its protocol determines whether
Auth.js expects the secure cookie name; the daemon must forward the cookie it
received from the browser unchanged. A missing or incorrect value can make
the loopback check reject every browser session.

The daemon owns its Content-Security-Policy, framing, referrer, and robots
headers because Caddy routing bypasses Next.js response headers. After the
daemon is installed, `curl -I https://<host>/panel/` should include
`Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`,
`X-Content-Type-Options`, and `X-Robots-Tag: noindex`. A request to the site
root only verifies the Next.js upstream.

The site and panel share an origin. An ADMIN who can author raw-HTML blocks
can run script in an OWNER's browser session on that origin and reach the
panel as that OWNER. This risk is accepted; the site's CSP permits inline
scripts for the App Router. Two-factor authentication or moving the panel to
a separate subdomain would change this boundary.

### Panel deployment checks

Before running the pages-only seed on an existing database, inspect custom
pages and navigation that could be shadowed by the new route. Run these
queries against the live SQLite file and resolve any returned rows manually:

```sql
SELECT id, slug, title, protected FROM Page
WHERE slug = 'panel' OR slug LIKE 'panel/%';

SELECT id, label, href, pageId FROM NavItem
WHERE href = '/panel' OR href LIKE '/panel/%'
   OR pageId IN (SELECT id FROM Page WHERE slug = 'panel' OR slug LIKE 'panel/%');
```

The static-route seed creates the protected `panel` row and reports an
unprotected static page or a nested `panel/...` page with a `FAILED` message.
It still finishes its other seed work, but sets a nonzero exit code. Do not
install or enable the daemon until a failed seed is resolved and the seed
exits successfully.

On an existing VPS, `./setup.sh --mode provision --domain <current-domain>`
runs the full provisioning sequence, not only the Caddy step. To update Caddy
alone before installing the daemon, create the import directory, substitute
the host's domain into the template, write the file, and reload Caddy:

```bash
DOMAIN="your-live-domain.example" # replace with the domain on the Caddy site-address line
CADDY_TEMPLATE="$(< /opt/jass/Caddyfile)"
DESIRED_CADDYFILE="${CADDY_TEMPLATE//justasimpleserver.net/$DOMAIN}"
sudo mkdir -p /etc/caddy/conf.d
printf '%s\n' "$DESIRED_CADDYFILE" | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy
```

The provisioning Caddy step performs this domain substitution automatically.

The daemon installer must verify that the live Caddyfile imports
`/etc/caddy/conf.d/*.caddy`; otherwise `/panel` silently reaches the Next
fallback page. On the VPS, validate the Caddyfile with both an empty and a
populated `conf.d` directory and confirm the imported `/panel` handler wins
over the default app handler. The snippet must use mutually exclusive
`handle` blocks; a loose `reverse_proxy` can sort after the default handler.
Check the path matrix for public
`/api/panel` variants against the installed Caddy version before enabling the
daemon.

### Resource-pack hosting

The `/resource` page supports multiple independently hosted resource packs. Each
upload is stored under `UPLOADS_DIR/resource-packs/<sha1>.zip` and receives its
own public download URL:

```text
https://<site>/api/resource-pack/<id>
```

The page and `/api/resource-pack/meta` expose every pack newest-first. For each
one, copy the three matching lines into `server.properties`:

```text
resource-pack=https\://<site>/api/resource-pack/<id>
resource-pack-sha1=<sha1>
resource-pack-id=<uuid>
```

The backslash before `://` is required by Java's `server.properties` parser. In
the admin upload panel, a replacement can optionally reuse an existing pack's
UUID; UUIDs are therefore intentionally not unique across rows. The admin-only
Active/Inactive label is bookkeeping for operators and has no effect on the
packs shown by `/resource` or `/api/resource-pack/meta`.

Uploads with the same SHA-1 are rejected with `409 Conflict`; they do not create
a second row or replace the existing file. Packs are not pruned automatically,
and an admin can delete any individual pack from `/resource`. Deleting a pack
removes its row and stored file, so its ID URL then returns `404`.

The old parameterless `/api/resource-pack` download URL is no longer served.
Update any existing Minecraft `server.properties` entry to a specific pack ID
before deploying this change.

Verify the better-sqlite3 prebuild works for the actual host's OS/arch before
relying on the Dockerfile as-is (see comments in the file), and replace the
placeholder domain if the production domain differs (`justasimpleserver.net`
is also the current `MC_SERVER_HOST` value in `.env`).

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

### Live sessions and owner recovery

The JWT callback re-reads the user's live row on each authenticated request
and refreshes the session's role, email, and name. A session for a deleted
user ends on the next request after this code is deployed. If the database
lookup fails temporarily, the callback logs the error and retains the current
token so one transient SQLite error does not clear every user's cookie; the
panel session endpoint fails closed when its own live-user lookup fails.

Do not demote or delete the last `OWNER`. If every owner is removed, restore
one from the server with:

```bash
npm run create-admin -- <email> <strong-password> --role OWNER
```

## Pre-deploy security checklist

Run through this before every real production deploy, not just the first one:

- [ ] **Rotate `AUTH_SECRET`.** Generate a fresh value — do not reuse the dev
      secret or a previous deploy's secret. The generation command is in
      `.env.example`: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
      Rotating invalidates all existing sessions, which is expected.
- [ ] **Set `AUTH_URL`** to the real public URL (see the table above).
- [ ] **Review live `/panel` collisions before seeding.** Query `Page` for
      `panel` and `panel/%`, and `NavItem` for links or page references to
      those routes (queries above). Resolve any collision manually.
- [ ] **Run the pages-only seed and check its exit code.** If it reports
      `FAILED` or exits nonzero, do not install or enable the panel daemon.
- [ ] **Update Caddy on an existing host before installing the daemon.**
      Use the manual Caddy update above or rerun full provisioning with the
      same `--domain` value. Validate imports with an empty
      and populated directory and confirm the panel handler precedes the
      default app handler.
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
- [ ] **After installing the panel daemon**, request
      `curl -I https://<host>/panel/` and confirm
      `Content-Security-Policy`, `X-Frame-Options`, `Referrer-Policy`,
      `X-Content-Type-Options`, and `X-Robots-Tag: noindex` come from the
      daemon route.

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

Run the migration before the pages-only seed. The seed intentionally skips an
already-populated page tree; it cannot rename an existing `/features` row by
itself. The migration moves that row to the canonical `/wiki` slug while
preserving its page ID, blocks, feature rows, and page-linked navigation.

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
