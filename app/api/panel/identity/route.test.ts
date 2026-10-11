import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { DELETE, GET, PATCH, POST, PUT } from "./route";

// Releases better-sqlite3's file handle on the test database so the global
// teardown (test/global-setup.ts) can delete it without a Windows file lock.
afterAll(() => prisma.$disconnect());

const URL_UNDER_TEST = "http://127.0.0.1:3000/api/panel/identity";
const LOOPBACK_HOST = "127.0.0.1:3000";
const PUBLIC_HOST = "justasimpleserver.net";

function post(body: BodyInit | undefined, headers: Record<string, string> = {}) {
  return POST(
    new Request(URL_UNDER_TEST, {
      method: "POST",
      headers: { host: LOOPBACK_HOST, "content-type": "application/json", ...headers },
      body,
    }),
  );
}

function postJson(value: unknown, headers?: Record<string, string>) {
  return post(JSON.stringify(value), headers);
}

let createdUserIds: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  }
});

async function createUser(role: "OWNER" | "ADMIN") {
  const user = await prisma.user.create({
    data: {
      email: `panel-identity-test-${role.toLowerCase()}-${crypto.randomUUID()}@dev.invalid`,
      passwordHash: "not-a-real-hash",
      role,
    },
    select: { id: true, role: true },
  });
  createdUserIds.push(user.id);
  return user;
}

/**
 * role is a plain TEXT column with no CHECK constraint (see
 * prisma/migrations/20260708235607_content_and_auth/migration.sql), but the
 * Role enum in schema.prisma only has OWNER and ADMIN -- nothing in the app
 * can produce a third value through Prisma's own types, and (as the tests
 * below confirm) the generated client itself refuses to read a row back
 * once its stored value falls outside that enum. This writes one directly,
 * bypassing the client, to exercise that boundary.
 */
async function setRawRole(userId: string, role: string) {
  await prisma.$executeRaw`UPDATE "User" SET "role" = ${role} WHERE "id" = ${userId}`;
}

describe("POST /api/panel/identity", () => {
  it("returns the OWNER for an eligible OWNER id", async () => {
    const owner = await createUser("OWNER");
    const res = await postJson({ userId: owner.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { user: { id: owner.id, role: "OWNER" } } });
  });

  it("returns the ADMIN for an eligible ADMIN id", async () => {
    const admin = await createUser("ADMIN");
    const res = await postJson({ userId: admin.id });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ data: { user: { id: admin.id, role: "ADMIN" } } });
  });

  it("returns user: null for an id that never existed", async () => {
    const res = await postJson({ userId: "cdoesnotexist0000000000000" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { user: null } });
  });

  it("returns user: null for a deleted user", async () => {
    const admin = await createUser("ADMIN");
    await prisma.user.delete({ where: { id: admin.id } });
    createdUserIds = createdUserIds.filter((id) => id !== admin.id);

    const res = await postJson({ userId: admin.id });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: { user: null } });
  });

  it("fails closed (5xx) rather than guessing 'ineligible' for a role outside the known enum", async () => {
    // This schema has no third role an admin UI or API can ever assign, so
    // there is no reachable "valid but non-eligible role" state to return
    // user: null for -- a role value outside OWNER/ADMIN can only mean the
    // stored data itself is corrupt, which belongs in the error path (see
    // the "database failure" suite below), never silently treated as a
    // normal ineligible user.
    const user = await createUser("ADMIN");
    await setRawRole(user.id, "EDITOR");

    const res = await postJson({ userId: user.id });
    expect(res.status).toBeGreaterThanOrEqual(500);
    const body = await res.json();
    expect(body).not.toEqual({ data: { user: null } });
  });

  it("reflects an account's deletion on the very next call -- no caching", async () => {
    const admin = await createUser("ADMIN");

    const before = await postJson({ userId: admin.id });
    expect(await before.json()).toEqual({ data: { user: { id: admin.id, role: "ADMIN" } } });

    await prisma.user.delete({ where: { id: admin.id } });
    createdUserIds = createdUserIds.filter((id) => id !== admin.id);

    const after = await postJson({ userId: admin.id });
    expect(await after.json()).toEqual({ data: { user: null } });
  });

  it("responds with Cache-Control: no-store", async () => {
    const owner = await createUser("OWNER");
    const res = await postJson({ userId: owner.id });
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("responds with only the data.user.{id,role} keys for an eligible user", async () => {
    const owner = await createUser("OWNER");
    const res = await postJson({ userId: owner.id });
    const body = await res.json();
    expect(Object.keys(body)).toEqual(["data"]);
    expect(Object.keys(body.data)).toEqual(["user"]);
    expect(Object.keys(body.data.user).sort()).toEqual(["id", "role"]);
  });

  describe("malformed bodies -> 400", () => {
    it("rejects unparseable JSON", async () => {
      const res = await post("{not json");
      expect(res.status).toBe(400);
    });

    it("rejects an empty body", async () => {
      const res = await post(undefined);
      expect(res.status).toBe(400);
    });

    it("rejects extra keys", async () => {
      const res = await postJson({ userId: "abc123", extra: "nope" });
      expect(res.status).toBe(400);
    });

    it("rejects a missing userId", async () => {
      const res = await postJson({});
      expect(res.status).toBe(400);
    });

    it("rejects a non-string userId", async () => {
      const res = await postJson({ userId: 123 });
      expect(res.status).toBe(400);
    });

    it("rejects characters outside [A-Za-z0-9_-]", async () => {
      const res = await postJson({ userId: "abc 123!" });
      expect(res.status).toBe(400);
    });

    it("rejects a userId longer than 64 characters", async () => {
      const res = await postJson({ userId: "a".repeat(65) });
      expect(res.status).toBe(400);
    });

    it("rejects a body larger than ~1 KiB", async () => {
      const res = await postJson({ userId: "a".repeat(10), padding: "x".repeat(2000) });
      expect(res.status).toBe(400);
    });
  });

  describe("method handling", () => {
    it("rejects GET with 405 and Allow: POST", async () => {
      const res = await GET(new Request(URL_UNDER_TEST, { method: "GET", headers: { host: LOOPBACK_HOST } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    });

    it("rejects PUT with 405 and Allow: POST", async () => {
      const res = await PUT(new Request(URL_UNDER_TEST, { method: "PUT", headers: { host: LOOPBACK_HOST } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    });

    it("rejects DELETE with 405 and Allow: POST", async () => {
      const res = await DELETE(new Request(URL_UNDER_TEST, { method: "DELETE", headers: { host: LOOPBACK_HOST } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    });

    it("rejects PATCH with 405 and Allow: POST", async () => {
      const res = await PATCH(new Request(URL_UNDER_TEST, { method: "PATCH", headers: { host: LOOPBACK_HOST } }));
      expect(res.status).toBe(405);
      expect(res.headers.get("allow")).toBe("POST");
    });
  });

  describe("loopback-only", () => {
    it("returns an empty 404 for a non-loopback Host", async () => {
      const res = await postJson({ userId: "whatever" }, { host: PUBLIC_HOST });
      expect(res.status).toBe(404);
      expect(res.headers.get("cache-control")).toBe("no-store");
      expect(await res.text()).toBe("");
    });

    it("returns an empty 404 for a spoofed X-Forwarded-Host, ignoring it entirely", async () => {
      const res = await postJson({ userId: "whatever" }, { host: PUBLIC_HOST, "x-forwarded-host": "127.0.0.1" });
      expect(res.status).toBe(404);
      expect(await res.text()).toBe("");
    });

    it("prefers the empty 404 over 405 for a non-loopback Host on a disallowed method", async () => {
      // A non-loopback caller must never learn this route exists or that it
      // only accepts POST -- the Host check runs before method dispatch.
      const res = await GET(new Request(URL_UNDER_TEST, { method: "GET", headers: { host: PUBLIC_HOST } }));
      expect(res.status).toBe(404);
      expect(res.headers.get("allow")).toBeNull();
    });

    it("accepts localhost and [::1] as loopback hostnames", async () => {
      const owner = await createUser("OWNER");
      for (const host of ["localhost:3000", "[::1]:3000"]) {
        const res = await postJson({ userId: owner.id }, { host });
        expect(res.status).toBe(200);
      }
    });
  });

  describe("database failure", () => {
    it("responds 5xx, never { user: null }, when the lookup throws", async () => {
      vi.spyOn(prisma.user, "findUnique").mockRejectedValueOnce(new Error("simulated database failure"));
      const res = await postJson({ userId: "irrelevant-for-this-test" });
      expect(res.status).toBeGreaterThanOrEqual(500);
      expect(res.status).toBeLessThan(600);
      const body = await res.json();
      expect(body).not.toEqual({ data: { user: null } });
    });
  });
});

describe("public exposure of /api/panel/*", () => {
  // Caddy, not this repo's JS, is what a request to a case/percent-encoding/
  // slash variant actually hits in production -- Caddy's `handle` matcher
  // normalizes the request path (decoding percent-escapes, collapsing `//`,
  // resolving `.`/`..` segments) and matches case-insensitively by default,
  // so one `/api/panel/*` entry already covers /API/PANEL/identity,
  // /api/%70anel/identity, //api//panel//identity, and dot-segment variants
  // without an enumerated list. That normalization isn't something this
  // repo's test process can exercise without a running Caddy instance, so
  // this only guards the config itself: that the blanket refusal block
  // exists, covers every nested path (not just /api/panel/session), and is
  // placed before the block that proxies everything else to Next.js.
  const caddyfile = fs.readFileSync(path.join(process.cwd(), "Caddyfile"), "utf8");

  it("refuses /api/panel and every nested path before anything is proxied", () => {
    const refusalIndex = caddyfile.indexOf("handle /api/panel /api/panel/*");
    const proxyIndex = caddyfile.indexOf("reverse_proxy 127.0.0.1:3000");
    expect(refusalIndex).toBeGreaterThan(-1);
    expect(proxyIndex).toBeGreaterThan(-1);
    expect(refusalIndex).toBeLessThan(proxyIndex);
  });

  it("the refusal block responds with a bare 404, not a proxied response", () => {
    const block = caddyfile.slice(caddyfile.indexOf("handle /api/panel /api/panel/*"));
    const blockEnd = block.indexOf("}");
    expect(block.slice(0, blockEnd)).toContain("respond 404");
  });
});
