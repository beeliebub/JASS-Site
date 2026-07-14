import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { getPages } from "@/lib/content";
import { getCustomThemes } from "@/lib/custom-themes";
import { PagesAdmin } from "@/components/admin/pages-admin";

export const metadata = { title: "Pages — Admin" };

export default async function AdminPagesPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [pages, customThemes] = await Promise.all([getPages(), getCustomThemes()]);

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Pages</h1>
        <p className="text-sm text-muted">
          Home/Rules/Features/News are protected — they can&apos;t be deleted or have their slug changed, but every
          block on them is still editable. New pages start empty; add blocks to them from the page itself in edit
          mode. Header content is optional and appears between the logo and desktop navigation.
        </p>
      </div>

      <PagesAdmin initialPages={pages} initialCustomThemes={customThemes} />
    </Container>
  );
}
