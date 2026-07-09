# JASS — Just A Simple Server

The website for **JASS** ("Just A Simple Server"), a Minecraft survival server at
`justasimpleserver.net`. Public pages (Home, Rules, Features, News, plus any custom
pages an admin creates) are built from an admin-editable, block-based page builder —
content lives in the database and logged-in admins edit it in place, in real time,
without a separate back office.

## Tech stack

Next.js (App Router, TypeScript) + Tailwind CSS + Prisma 7 (SQLite) + Auth.js v5. See
`CLAUDE.md` for stack/version details and `PLAN.md` for the full phased build history.

## Local development

### Prerequisites

- Node.js 20+ and npm
- No external database — SQLite is a single file, created by Prisma migrations

### 1. Clone and install

```bash
git clone <repo-url> jass
cd jass
npm install
```

> **This dev machine's Node install has a known V8 crash** on plain `npm install` /
> Prisma CLI commands (see `CLAUDE.md`'s "Known environment issue" section for the full
> writeup). If you hit a `Fatal error ... InductionVariablePhiTypeIsPrefixedPoint`
> crash on this machine, retry with:
> ```bash
> NODE_OPTIONS="--jitless" npm install
> ```
> This is specific to this machine's Node build — it should not occur on a normal
> Linux server (see the OVH deployment section below).

### 2. Configure environment variables

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Local dev value |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` (already the default in `.env.example`) |
| `AUTH_SECRET` | Generate one: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `MC_SERVER_HOST` | `justasimpleserver.net` |
| `MC_SERVER_PORT` | `25565` |

### 3. Set up the database

```bash
npx prisma migrate dev
npm run db:seed
```

This creates `prisma/dev.db`, applies all migrations, and loads placeholder content
(Home/Rules/Features/News pages, sample rules/features/posts) so the site isn't blank.

> If `npx prisma ...` crashes with the same V8 fatal error mentioned above, use the
> documented workaround instead (needed because `--jitless` breaks the WASM Prisma's
> CLI relies on, so it can't be combined with the `npm install` workaround):
> ```bash
> node --no-turbofan node_modules/prisma/build/index.js migrate dev
> ```

### 4. Create the first account

The site has no public sign-up — accounts are seeded/invited only. Create the first
account as **`OWNER`** (only `OWNER` accounts can manage other user accounts later):

```bash
npm run create-admin -- you@example.com "a-strong-password" --role OWNER
```

### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, then `http://localhost:3000/login` to sign in. Once
logged in, an "Edit mode" toggle appears in the header — turn it on to edit any page's
content in place, manage pages/nav under `/admin/pages` and `/admin/nav`, and (as
`OWNER`) manage accounts under `/admin/users`.

## Available scripts

```bash
npm run dev              # dev server (Turbopack), http://localhost:3000
npm run build             # production build
npm run start              # run a production build
npm run lint                # eslint
npm run db:seed              # load placeholder content (safe to re-run — see note below)
npm run db:backup             # snapshot prisma/dev.db to backups/ (VACUUM INTO, keeps last 7)
npm run create-admin           # create/update a user; see below
```

**Re-running `npm run db:seed` against a database that already has real content**
(anything an admin has edited through the site) **will overwrite `ContentBlock`,
`Rule`, `Feature`, and `Post` rows back to placeholder text.** Pages/nav are safe to
re-run (`seedPagesAndNav()` skips itself if any `Page` already exists) — to get just
that safe part without touching live content, run:

```bash
npm run db:seed -- --pages-only
```

## Creating owner and admin accounts

Two roles: **`OWNER`** and **`ADMIN`**. Both can edit all site content, pages, and
navigation. Only `OWNER` can create, edit, or delete user accounts — an `ADMIN` cannot
view, edit, delete, or promote/demote an `OWNER`.

**Via the CLI** (works with no existing account, e.g. for the very first user, or for
scripted/ops use):

```bash
npm run create-admin -- <email> <password> --role OWNER
npm run create-admin -- <email> <password> --role ADMIN   # role defaults to ADMIN if omitted
```

Re-running it with the same email updates that user's password/role instead of
creating a duplicate.

**Via the UI**, once at least one `OWNER` exists: log in as that `OWNER` and go to
`/admin/users` to invite additional `OWNER`/`ADMIN` accounts, change roles, or remove
accounts. The last remaining `OWNER` can't be demoted or deleted (by themselves or
anyone else), so the site can never end up with zero account managers.

## Deploying to an OVH VPS

The app persists all content in a single SQLite file, so it's deployed as a normal
long-running Node process on a VPS (not a serverless platform — see `docs/DEPLOYMENT.md`
for the full reasoning). These steps assume a fresh OVH VPS running Debian 12 or
Ubuntu 22.04+, deployed via Docker + a host-level Caddy reverse proxy — the
`Dockerfile`, `docker-compose.yml`, and `Caddyfile` at the repo root are the reference
artifacts for this. A simpler PM2-based alternative (no Docker) is at the end.

### 1. Provision the VPS

From the OVH control panel, create the VPS and add your SSH public key at creation
time (or via the panel's "SSH Keys" section) rather than relying on a mailed root
password.

```bash
ssh root@<vps-ip>
adduser deploy && usermod -aG sudo deploy   # avoid running everything as root
```

### 2. Point DNS at the VPS

In OVH's **DNS Zone** editor for `justasimpleserver.net`, add/update:

| Type | Name | Target |
|---|---|---|
| A | `justasimpleserver.net` (`@`) | `<vps-ip>` |
| A | `www` | `<vps-ip>` |

DNS propagation can take a few minutes to a few hours — Caddy's automatic HTTPS (step
7) won't succeed until the domain actually resolves to this VPS.

### 3. Open the firewall

Two separate firewalls need to allow 80/443: OVH's own **network firewall** (in the
VPS's control-panel "Network Firewall" tab — off by default per-VPS, but if you enable
it, it must explicitly allow these ports or it silently drops traffic before it ever
reaches the box) and the OS-level firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** expose port 3000 (the app) publicly — Caddy is the only thing that should
face the internet; `docker-compose.yml` already binds the app to `127.0.0.1:3000` only.

### 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
```

(Log out/in for the group change to apply.)

### 5. Get the code onto the server

```bash
sudo mkdir -p /opt/jass && sudo chown deploy:deploy /opt/jass
git clone <repo-url> /opt/jass
cd /opt/jass
```

### 6. Configure production environment

```bash
cp .env.example .env.production
```

Fill in `.env.production` (this is what `docker-compose.yml` reads via `env_file`):

| Variable | Production value |
|---|---|
| `DATABASE_URL` | `file:./prisma/dev.db` (compose overrides this internally to the container path — leave as-is) |
| `AUTH_SECRET` | **Generate a fresh value — do not reuse the dev secret above.** `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` |
| `AUTH_URL` | `https://justasimpleserver.net` — required behind the Caddy reverse proxy (see `auth.ts`'s `trustHost: true`); wrong/missing values cause broken login redirects |
| `MC_SERVER_HOST` | `justasimpleserver.net` |
| `MC_SERVER_PORT` | `25565` |

### 7. Install and configure Caddy

Caddy runs on the host (not in Docker) so it can bind 80/443 directly and manage TLS:

```bash
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp /opt/jass/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

The repo's `Caddyfile` already targets `justasimpleserver.net`/`www.justasimpleserver.net`
and reverse-proxies to `127.0.0.1:3000` with HSTS — no edits needed unless the domain
changes.

### 8. Build and start the app

```bash
docker compose up -d --build
```

This builds the image (installing deps, running `prisma generate` and `next build`
inside the container per the `Dockerfile`) and starts it bound to `127.0.0.1:3000`,
with `./data/prisma` and `./data/backups` bind-mounted so the database survives
rebuilds.

### 9. Apply migrations and seed placeholder content

```bash
docker compose exec web node --no-turbofan node_modules/prisma/build/index.js migrate deploy
docker compose exec web npm run db:seed
```

(`migrate deploy`, not `migrate dev` — it applies existing migrations without
prompting or generating new ones, which is what production needs.)

### 10. Create the first OWNER account

```bash
docker compose exec web npm run create-admin -- you@example.com "a-strong-password" --role OWNER
```

### 11. Verify

- `https://justasimpleserver.net` loads over HTTPS with a valid Let's Encrypt cert.
- `curl -I https://justasimpleserver.net` shows `Content-Security-Policy`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security`, and `X-Frame-Options` headers (see `next.config.ts`).
- `/login` works with the account created in step 10, and edit mode appears.
- Run through the rest of `docs/DEPLOYMENT.md`'s **Pre-deploy security checklist**
  (rotating `AUTH_SECRET`, re-checking `npm audit`) before treating this as a real
  public launch rather than a first deploy.

### 12. Set up automatic backups

See `docs/DEPLOYMENT.md`'s "Backup story for the SQLite DB" section for the full
cron/systemd-timer setup around `npm run db:backup` — not optional for a real deploy,
since the SQLite file is the only copy of everything admins edit.

### Alternative: PM2 instead of Docker

If Docker feels like overkill for a single small app on the same box as the Minecraft
server, run the Node process directly with PM2 instead — Caddy's config is identical
either way:

```bash
sudo apt install -y nodejs npm  # or use nvm/n to install Node 20
npm install -g pm2
cd /opt/jass
npm ci
node --no-turbofan node_modules/prisma/build/index.js migrate deploy
npm run build
pm2 start npm --name jass -- run start
pm2 save
pm2 startup   # follow the printed instructions to start pm2 on boot
```

## Environment variables reference

| Variable | Used by | Notes |
|---|---|---|
| `DATABASE_URL` | Prisma (`prisma.config.ts`, `lib/prisma.ts`) | SQLite file path |
| `AUTH_SECRET` | Auth.js (`auth.ts`) | Session signing secret — must be unique per environment, never reused between dev and prod |
| `AUTH_URL` | Auth.js (`auth.ts`) | Public URL of the site; required in production behind a reverse proxy |
| `MC_SERVER_HOST` / `MC_SERVER_PORT` | `/api/status` (Phase 5 live status ping) | The actual Minecraft server to ping — `justasimpleserver.net` / `25565` |

## Further reading

- `PLAN.md` — the full phased implementation plan and what's been built so far
- `docs/DEPLOYMENT.md` — hosting decision rationale, backup internals, pre-deploy
  security checklist
- `CLAUDE.md` — stack details and this dev environment's known quirks
