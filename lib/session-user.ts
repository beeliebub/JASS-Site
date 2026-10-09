import type { PrismaClient, Role } from "@/app/generated/prisma/client";

type LiveSessionUser = {
  role: Role;
  email: string;
  name: string | null;
};

export type SessionUserLookupResult =
  | { status: "ok"; user: LiveSessionUser }
  | { status: "gone" }
  | { status: "unknown"; error: unknown };

export async function lookupSessionUser(
  client: Pick<PrismaClient, "user">,
  id: string,
): Promise<SessionUserLookupResult> {
  try {
    const user = await client.user.findUnique({
      where: { id },
      select: { role: true, email: true, name: true },
    });

    return user ? { status: "ok", user } : { status: "gone" };
  } catch (error) {
    return { status: "unknown", error };
  }
}
