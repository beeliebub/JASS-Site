import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Tests run against a dedicated SQLite file, never prisma/dev.db -- a test
 * run creates and deletes User rows (including raw-SQL role writes outside
 * the Role enum), and that must never touch real development data.
 */
const TEST_DB_PATH = path.join(process.cwd(), "prisma", "test.db");
const TEST_DATABASE_URL = `file:${TEST_DB_PATH}`;

function removeTestDbFiles() {
  for (const suffix of ["", "-journal", "-wal", "-shm"]) {
    const candidate = `${TEST_DB_PATH}${suffix}`;
    if (!fs.existsSync(candidate)) continue;
    try {
      fs.rmSync(candidate);
    } catch (error) {
      // Windows keeps the file locked briefly after better-sqlite3's
      // connection closes. A leftover file is harmless -- the next run's
      // setup() recreates it from migrations before any test reads it.
      console.warn(`Could not remove ${candidate} (will be recreated next run):`, error);
    }
  }
}

export async function setup() {
  removeTestDbFiles();
  // --no-turbofan runs WASM-dependent Prisma correctly on this machine's
  // Node install -- see CLAUDE.md's "Known environment issue" section. It
  // must be passed directly to this node invocation, not via npx/npm.
  execFileSync(
    process.execPath,
    ["--no-turbofan", "node_modules/prisma/build/index.js", "migrate", "deploy"],
    {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      stdio: "inherit",
    },
  );
}

export async function teardown() {
  removeTestDbFiles();
}
