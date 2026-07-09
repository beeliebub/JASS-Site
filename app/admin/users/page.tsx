import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { prisma } from "@/lib/prisma";
import { UsersAdmin } from "@/components/admin/users-admin";

export const metadata = { title: "Users — Admin" };

export default async function AdminUsersPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  // OWNER-only, same defense-in-depth posture as every other gate in this
  // app: the route itself enforces this independently of the /api/users/**
  // handlers (which also each start with requireOwner()) and of
  // app/admin/page.tsx only showing this card to OWNERs.
  if (session.user.role !== "OWNER") redirect("/admin");

  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Users</h1>
        <p className="text-sm text-muted">
          OWNER and ADMIN accounts both get full site-editing rights. Only an OWNER can manage accounts here -- and
          can&apos;t demote/delete themselves or the last remaining OWNER.
        </p>
      </div>

      <UsersAdmin
        initialUsers={users.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }))}
        currentUserId={session.user.id}
      />
    </Container>
  );
}
