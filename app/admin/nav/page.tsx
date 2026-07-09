import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { getNavTree, getPages } from "@/lib/content";
import { NavAdmin } from "@/components/admin/nav-admin";

export const metadata = { title: "Navigation — Admin" };

export default async function AdminNavPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [navTree, pages] = await Promise.all([getNavTree(), getPages()]);

  const items = navTree.map((item) => ({
    id: item.id,
    label: item.label,
    href: item.href,
    pageId: item.pageId,
    order: item.order,
    children: item.children.map((child) => ({
      id: child.id,
      label: child.label,
      href: child.href,
      pageId: child.pageId,
      order: child.order,
    })),
  }));

  const pageOptions = pages.filter((p) => p.published).map((p) => ({ id: p.id, title: p.title, slug: p.slug }));

  return (
    <Container className="flex flex-1 flex-col gap-6 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Navigation</h1>
        <p className="text-sm text-muted">
          Header nav items, top to bottom. Dropdowns support one level of nesting -- a dropdown item can&apos;t have
          its own dropdown.
        </p>
      </div>

      <NavAdmin initialItems={items} pages={pageOptions} />
    </Container>
  );
}
