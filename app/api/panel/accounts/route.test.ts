import { afterAll, afterEach, describe, expect, it, vi, type Mock } from "vitest";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

// Releases better-sqlite3's file handle on the test database so the global
// teardown (test/global-setup.ts) can delete it without a Windows file lock.
afterAll(() => prisma.$disconnect());

// Only the session is replaced. The caller's live role, the account list and
// the response shape are read from the test database, as in production.
vi.mock("@/auth", () => ({ auth: vi.fn() }));
// Auth.js types its helper with overloads; the mock is typed as the one signature this test drives.
const authMock = auth as unknown as Mock<() => Promise<{ user: { id: string } } | null>>;

const LOOPBACK_HOST = "127.0.0.1:3000";
const PUBLIC_HOST = "justasimpleserver.net";

let createdUserIds: string[] = [];

afterEach(async () => {
  authMock.mockReset();
  if (createdUserIds.length > 0) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds = [];
  }
});

async function createUser(role: "OWNER" | "ADMIN", label: string) {
  const user = await prisma.user.create({
    data: {
      email: `panel-accounts-${label}-${crypto.randomUUID()}@dev.invalid`,
      passwordHash: "not-a-real-hash",
      name: label,
      role,
    },
    select: { id: true, email: true, role: true },
  });
  createdUserIds.push(user.id);
  return user;
}

function signedInAs(id: string | null) {
  authMock.mockResolvedValue(id === null ? null : { user: { id } });
}

function get(host: string) {
  return GET(new Request(`http://${LOOPBACK_HOST}/api/panel/accounts`, { method: "GET", headers: { host } }));
}

describe("GET /api/panel/accounts", () => {
  it("answers an empty 404 to a non-loopback Host without reading the session", async () => {
    const res = await get(PUBLIC_HOST);
    expect(res.status).toBe(404);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(authMock).not.toHaveBeenCalled();
  });

  it("answers 401 with no session", async () => {
    signedInAs(null);
    const res = await get(LOOPBACK_HOST);
    expect(res.status).toBe(401);
  });

  it("answers 401 when the session names an account that no longer exists", async () => {
    signedInAs("cdoesnotexist0000000000000");
    const res = await get(LOOPBACK_HOST);
    expect(res.status).toBe(401);
  });

  it("lists every OWNER and ADMIN, by email, with no password hash, to an admin session", async () => {
    const owner = await createUser("OWNER", "owner");
    const admin = await createUser("ADMIN", "admin");
    signedInAs(admin.id);

    const res = await get(LOOPBACK_HOST);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as { data: { accounts: { id: string; email: string; name: string | null; role: string }[] } };
    expect(Object.keys(body)).toEqual(["data"]);
    expect(Object.keys(body.data)).toEqual(["accounts"]);

    const byId = new Map(body.data.accounts.map((account) => [account.id, account]));
    expect(byId.get(owner.id)).toEqual({ id: owner.id, email: owner.email, name: "owner", role: "OWNER" });
    expect(byId.get(admin.id)).toEqual({ id: admin.id, email: admin.email, name: "admin", role: "ADMIN" });
    for (const account of body.data.accounts) {
      expect(Object.keys(account).sort()).toEqual(["email", "id", "name", "role"]);
      expect(["OWNER", "ADMIN"]).toContain(account.role);
    }
    const emails = body.data.accounts.map((account) => account.email);
    expect([...emails].sort()).toEqual(emails);
  });
});
