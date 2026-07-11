import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { AuditLogAdmin } from "@/components/admin/audit-log-admin";

export const metadata = { title: "Audit log — Admin" };

export default async function AdminAuditLogPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Audit log</h1>
        <p className="text-sm text-muted">
          Every admin mutation across the CMS, newest first. Expand a row to see the before/after snapshot, or undo
          it to revert that entity to its state just before this entry.
        </p>
      </div>

      <AuditLogAdmin isOwner={session.user.role === "OWNER"} />
    </Container>
  );
}
