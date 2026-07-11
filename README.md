# JASS — Just A Simple Server

The website for **JASS** ("Just A Simple Server"), a Minecraft survival server at
`justasimpleserver.net`. Public pages (Home, Rules, Features, News, plus any custom
pages an admin creates) are built from an admin-editable, block-based page builder —
content lives in the database, and logged-in admins edit it in place, in real time.

## Tech stack

Next.js (App Router, TypeScript) + Tailwind CSS + Prisma 7 (SQLite) + Auth.js v5. See
`CLAUDE.md` for version details and this dev environment's known quirks.

## Getting started: `./setup.sh`

`./setup.sh` is the single front door for everything — local development, first-time VPS
provisioning, and redeploys. Run it with no arguments for an interactive menu, or pass
`--mode` to jump straight to a task:

```bash
./setup.sh                                                   # interactive menu
./setup.sh --mode local                                     # local dev environment
./setup.sh --mode provision --domain justasimpleserver.net  # one-time VPS setup
./setup.sh --mode deploy                                    # start / redeploy a provisioned VPS
```

`./setup.sh --help` lists every mode and flag. It's idempotent — safe to re-run at any
time — and never overwrites an existing `.env` / `.env.production`. Everything under
[Manual setup](#manual-setup-without-the-wizard) at the bottom is only needed if you'd
rather run the individual steps by hand.

### Local development

Prerequisites: **Node.js 20+ and npm**. No external database — SQLite is a single file,
created by Prisma migrations.

From a fresh clone, one command takes you all the way to a running dev server:

```bash
git clone <repo-url> jass
cd jass
./setup.sh --mode local     # ...or run ./setup.sh and pick "1) Local dev"
```

`local` mode is idempotent (re-run it any time — already-satisfied steps print `SKIP`)
and it never touches an existing `.env`. It runs, in order:

1. **Node ≥ 20 check** — with install guidance if Node is missing or too old.
2. **`npm install`** — automatically retries under this machine's `--jitless`
   V8-crash workaround (see `CLAUDE.md`) if the plain install crashes.
3. **`.env`** — created from `.env.example` with a freshly generated `AUTH_SECRET`;
   prompts for `MC_SERVER_HOST` / `MC_SERVER_PORT` (with defaults). Skipped, untouched,
   if `.env` already exists.
4. **Prisma** — `generate` + `migrate dev`, with the `--no-turbofan` fallback for the
   V8 crash.
5. **`npm run db:seed`** — placeholder content on a fresh database (guarded with a
   prompt if the DB already holds content).
6. **First `OWNER` account** — optional; hidden password prompt with confirmation.
7. **`uploads/`** — resource-pack storage directory.
8. **`npm run dev`** — offered at the end, then visit `http://localhost:3000`.

**Starting the site later:** `npm run dev` (`http://localhost:3000`). Visit
`http://localhost:3000/login` to sign in; once logged in, an "Edit mode" toggle appears
in the header — turn it on to edit any page's content in place, manage pages/nav under
`/admin/pages` and `/admin/nav`, and (as `OWNER`) manage accounts under `/admin/users`.

### Deploying to an OVH VPS

The app persists all content in a single SQLite file, so it runs as a normal
long-running Node process on a VPS — not a serverless platform. See `docs/DEPLOYMENT.md`
for the reasoning and the `Dockerfile`, `docker-compose.yml`, and `Caddyfile` at the
repo root for the reference setup (Docker + a host-level Caddy reverse proxy). A simpler
PM2-based alternative (no Docker) is in the manual section.

Two prerequisites can't be scripted — creating the non-root `deploy` user and pointing
DNS at the VPS (`setup.sh` offers guided walkthroughs for the DNS records and OVH's
network firewall). After those, and after cloning the repo onto the box
(`git clone <repo-url> /opt/jass && cd /opt/jass`):

**One-time provisioning** — as the non-root `deploy` user, with sudo access:

```bash
./setup.sh --mode provision --domain justasimpleserver.net
```

It's idempotent — safe to re-run if it fails partway through — and never overwrites an
existing `.env.production`. It runs the firewall, Docker, Caddy, env-file, build,
migrate + seed, first `OWNER` account, and automatic-backup steps in order.

**Starting or redeploying the site** — any time you need to bring the site up (e.g.
after a reboot) or ship new code:

```bash
./setup.sh --mode deploy              # rebuild + start, migrate, health-check, reload Caddy
./setup.sh --mode deploy --pull       # git pull first (fails loudly on conflicts, never force-pulls)
./setup.sh --mode deploy --no-build   # fast restart without rebuilding the image
```

Deploy mode never runs `db:seed` (re-seeding can overwrite live admin-edited content —
see the [`db:seed` note](#available-scripts) below), so it's safe to run after every
deploy, and it finishes by offering a walkthrough for pointing the Minecraft server's
`server.properties` at the hosted resource pack.

> `scripts/vps-setup.sh` and `scripts/vps-start.sh` still work as thin back-compat
> wrappers over the same code (provision and deploy respectively), with their original
> flags and `--help` output.

## Available scripts

```bash
npm run dev              # dev server (Turbopack), http://localhost:3000
npm run build             # production build
npm run start              # run a production build
npm run lint                # eslint
npm run db:seed              # load placeholder content (see note below before re-running)
npm run db:backup             # snapshot prisma/dev.db to backups/ (VACUUM INTO, keeps last 7)
npm run create-admin           # create/update a user; see below
```

Plus the setup wizard and two Ubuntu VPS ops scripts:

```bash
./setup.sh               # interactive setup wizard: local dev, VPS provisioning, or redeploy
./scripts/vps-setup.sh   # one-time provisioning: firewall, Docker, Caddy, env, first deploy
./scripts/vps-start.sh   # start/redeploy: build, migrate, health-check, reload Caddy
```

> **Re-running `npm run db:seed` against a database that already has real content**
> (anything an admin has edited through the site) overwrites `ContentBlock`, `Rule`,
> `Feature`, and `Post` rows back to placeholder text. Pages/nav are always safe to
> re-run (`seedPagesAndNav()` skips itself if any `Page` already exists) — to get just
> that safe part without touching live content, run `npm run db:seed -- --pages-only`.

## Creating owner and admin accounts

Two roles: **`OWNER`** and **`ADMIN`**. Both can edit all site content, pages, and
navigation. Only `OWNER` can create, edit, or delete user accounts — an `ADMIN` cannot
view, edit, delete, or promote/demote an `OWNER`. The last remaining `OWNER` can't be
demoted or deleted (by themselves or anyone else), so the site can never end up with
zero account managers.

**Via the CLI** (works with no existing account — e.g. the very first user):

```bash
npm run create-admin -- <email> <password> --role OWNER
npm run create-admin -- <email> <password> --role ADMIN   # role defaults to ADMIN if omitted
```

Re-running it with the same email updates that user's password/role instead of
creating a duplicate.

**Via the UI**, once at least one `OWNER` exists: log in as that `OWNER` and go to
`/admin/users` to invite additional accounts, change roles, or remove accounts.

## Manual setup (without the wizard)

Everything above is automated by `./setup.sh`. The steps below are the equivalent work
by hand — for when you'd rather run each step yourself, or want to understand exactly
what the wizard does.

### Local dev, step by step

#### 1. Clone and install

```bash
git clone <repo-url> jass
cd jass
npm install
```

> **This dev machine's Node install has a known V8 crash** on plain `npm install`. If
> you hit a `Fatal error ... InductionVariablePhiTypeIsPrefixedPoint` crash, retry with
> `NODE_OPTIONS="--jitless" npm install` (see `CLAUDE.md`'s "Known environment issue"
> for why). This is specific to this machine — it shouldn't happen elsewhere.

#### 2. Configure environment variables

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

#### 3. Set up the database

```bash
npx prisma migrate dev
npm run db:seed
```

This creates `prisma/dev.db`, applies all migrations, and loads placeholder content
(Home/Rules/Features/News pages, sample rules/features/posts) so the site isn't blank.

> If `npx prisma ...` hits the same V8 crash as step 1, use the Prisma-specific
> workaround instead — `--jitless` breaks the WASM Prisma's CLI needs, so it can't be
> reused here:
> ```bash
> node --no-turbofan node_modules/prisma/build/index.js migrate dev
> ```

#### 4. Create the first account

The site has no public sign-up — accounts are created via CLI or invited by an existing
`OWNER`. Create the first one as `OWNER` (see "Creating owner and admin accounts" above
for what that role can do):

```bash
npm run create-admin -- you@example.com "a-strong-password" --role OWNER
```

#### 5. Run it

```bash
npm run dev
```

Visit `http://localhost:3000`, then `http://localhost:3000/login` to sign in. Once
logged in, an "Edit mode" toggle appears in the header — turn it on to edit any page's
content in place, manage pages/nav under `/admin/pages` and `/admin/nav`, and (as
`OWNER`) manage accounts under `/admin/users`.

### VPS deploy, step by step

These are the individual steps that `./setup.sh --mode provision` automates (steps 3–12
below); steps 1–2 are the external prerequisites the wizard can only walk you through.

#### 1. Provision the VPS

From the OVH control panel, create the VPS and add your SSH public key at creation
time (or via the panel's "SSH Keys" section) rather than relying on a mailed root
password.

```bash
ssh root@<vps-ip>
adduser deploy && usermod -aG sudo deploy   # avoid running everything as root
```

#### 2. Point DNS at the VPS

In OVH's **DNS Zone** editor for `justasimpleserver.net`, add/update:

| Type | Name | Target |
|---|---|---|
| A | `justasimpleserver.net` (`@`) | `<vps-ip>` |
| A | `www` | `<vps-ip>` |

DNS propagation can take a few minutes to a few hours — Caddy's automatic HTTPS (step
7) won't succeed until the domain actually resolves to this VPS.

#### 3. Open the firewall

Two separate firewalls need to allow 80/443: OVH's own **network firewall** (in the
VPS's control-panel "Network Firewall" tab — off by default, but if enabled it must
explicitly allow these ports) and the OS-level firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

Do **not** expose port 3000 (the app) publicly — Caddy is the only thing that should
face the internet; `docker-compose.yml` already binds the app to `127.0.0.1:3000` only.

#### 4. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker deploy
```

(Log out/in for the group change to apply.)

#### 5. Get the code onto the server

```bash
sudo mkdir -p /opt/jass && sudo chown deploy:deploy /opt/jass
git clone <repo-url> /opt/jass
cd /opt/jass
```

#### 6. Configure production environment

```bash
cp .env.example .env.production
```

Fill in `.env.production` (this is what `docker-compose.yml` reads via `env_file`):
same variables as local dev step 2, plus `AUTH_URL`. Two must differ from dev:

| Variable | Production value |
|---|---|
| `AUTH_SECRET` | **Generate a fresh value — do not reuse the dev secret.** Same command as step 2. |
| `AUTH_URL` | `https://justasimpleserver.net` — required behind the Caddy reverse proxy. Wrong/missing values cause broken login redirects. |

`DATABASE_URL`, `MC_SERVER_HOST`, and `MC_SERVER_PORT` keep the same values as dev. See
`docs/DEPLOYMENT.md`'s environment variables table for the full rationale on each.

#### 7. Install and configure Caddy

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

#### 8. Build and start the app

```bash
docker compose up -d --build
```

This builds the image (installing deps, running `prisma generate` and `next build`
inside the container per the `Dockerfile`) and starts it bound to `127.0.0.1:3000`,
with `./data/db` and `./data/backups` bind-mounted so the database survives
rebuilds.

#### 9. Apply migrations and seed placeholder content

```bash
docker compose exec web node --no-turbofan node_modules/prisma/build/index.js migrate deploy
docker compose exec web npm run db:seed
```

(`migrate deploy`, not `migrate dev` — it applies existing migrations without
prompting or generating new ones, which is what production needs.)

#### 10. Create the first OWNER account

```bash
docker compose exec web npm run create-admin -- you@example.com "a-strong-password" --role OWNER
```

#### 11. Verify

- `https://justasimpleserver.net` loads over HTTPS with a valid Let's Encrypt cert.
- `curl -I https://justasimpleserver.net` shows `Content-Security-Policy`,
  `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`,
  `Strict-Transport-Security`, and `X-Frame-Options` headers (see `next.config.ts`).
- `/login` works with the account created in step 10, and edit mode appears.
- Run through the rest of `docs/DEPLOYMENT.md`'s **Pre-deploy security checklist**
  (rotating `AUTH_SECRET`, re-checking `npm audit`) before treating this as a real
  public launch rather than a first deploy.

#### 12. Set up automatic backups

See `docs/DEPLOYMENT.md`'s "Backup story for the SQLite DB" section for the full
cron/systemd-timer setup around `npm run db:backup` — not optional for a real deploy,
since the SQLite file is the only copy of everything admins edit.

#### Alternative: PM2 instead of Docker

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

## Further reading

- `docs/DEPLOYMENT.md` — hosting decision rationale, full environment variable
  reference, backup internals, pre-deploy security checklist
- `CLAUDE.md` — stack details and this dev environment's known quirks
- `setup.sh` — the unified setup wizard (local dev, VPS provisioning, redeploy);
  `scripts/vps-setup.sh` / `scripts/vps-start.sh` remain as thin wrappers for the
  Ubuntu VPS provisioning and start/redeploy flows (each supports `--help`)
