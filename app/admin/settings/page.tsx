import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { SiteSettingsAdmin } from "@/components/admin/site-settings-admin";

export const metadata = { title: "Settings — Admin" };

export default async function AdminSettingsPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="text-sm text-muted">
          Site-wide favicon and link-share (embed) defaults — what shows in the browser tab, and what a shared
          link previews as on Discord, Slack, iMessage, and similar.
        </p>
      </div>

      <SiteSettingsAdmin />
    </Container>
  );
}
