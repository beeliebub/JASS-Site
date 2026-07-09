import "dotenv/config";
import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import path from "node:path";
import { prisma } from "@/lib/prisma";

/**
 * Produces a timestamped, consistent snapshot of the SQLite database into
 * `backups/`. Uses SQLite's `VACUUM INTO`, which — unlike a raw file copy of
 * prisma/dev.db — always writes a complete, uncorrupted snapshot even if a
 * request is mid-write when this runs. Run via `npm run db:backup`.
 *
 * See docs/DEPLOYMENT.md for how to schedule this (cron/systemd timer) and
 * the retention policy.
 */

const BACKUP_DIR = path.join(process.cwd(), "backups");
const RETENTION_COUNT = 7;

function timestamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`
  );
}

function pruneOldBackups() {
  const files = readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("dev-") && name.endsWith(".db"))
    .map((name) => {
      const fullPath = path.join(BACKUP_DIR, name);
      return { name, fullPath, mtime: statSync(fullPath).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  const stale = files.slice(RETENTION_COUNT);
  for (const file of stale) {
    unlinkSync(file.fullPath);
    console.log(`Pruned old backup: ${file.name}`);
  }
}

async function main() {
  mkdirSync(BACKUP_DIR, { recursive: true });
  const destination = path.join(BACKUP_DIR, `dev-${timestamp()}.db`);

  // VACUUM INTO requires the destination not to already exist and takes a
  // plain SQL string literal — escape any embedded single quotes just in
  // case the resolved path ever contains one.
  const escapedDestination = destination.replace(/'/g, "''");
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escapedDestination}'`);

  console.log(`Backup written to ${destination}`);

  pruneOldBackups();
}

main()
  .catch((error) => {
    console.error("Backup failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
