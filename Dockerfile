# Illustrative production Dockerfile for the VPS hosting route described in
# docs/DEPLOYMENT.md. Not built or run as part of this change — review and
# adapt (especially the base image / native-module story for better-sqlite3)
# before using it on the real host.

# syntax=docker/dockerfile:1

FROM node:20-bookworm-slim AS base
WORKDIR /app
# better-sqlite3 (used by the Prisma driver adapter, see lib/prisma.ts) ships
# prebuilt binaries for common glibc platforms, but these build tools are
# kept around as a fallback in case npm has to compile it from source for
# this host's architecture.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ openssl \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Regenerates app/generated/prisma (gitignored) from prisma/schema.prisma.
# On the machine this repo was developed on, `npx prisma ...` can hit a
# Node/V8 crash — see CLAUDE.md's "--no-turbofan" workaround. That is a
# local dev-machine issue, not expected inside a fresh Linux container, but
# keep the workaround in mind if this build step ever fails the same way.
RUN npx prisma generate
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/app/generated ./app/generated
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/scripts ./scripts

# prisma/ (the SQLite DB) and backups/ are bind-mounted from the host via
# docker-compose.yml so data survives image rebuilds/redeploys — never bake
# prisma/dev.db into the image itself.
RUN mkdir -p /app/prisma /app/backups

EXPOSE 3000
CMD ["npm", "run", "start"]
