import path from "node:path";

/**
 * Must run before any test file imports lib/prisma.ts, which reads
 * DATABASE_URL at module-evaluation time to build the driver adapter.
 * Vitest guarantees setupFiles finish before a test file's own imports
 * execute, which is what makes this override effective.
 */
process.env.DATABASE_URL = `file:${path.join(process.cwd(), "prisma", "test.db")}`;

// auth.ts constructs its NextAuth() instance at module load time, and
// lib/auth-guard.ts (which the identity route imports for isAdminRole)
// pulls that module in transitively, even though this route never calls
// auth(). A placeholder keeps that construction from failing in a test
// process that never reads a real .env.
process.env.AUTH_SECRET ??= "test-only-placeholder-not-a-real-secret";
