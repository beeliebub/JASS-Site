import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { getPageBySlug } from "@/lib/content";
import { formatPageTitle } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("admin");
  return {
    title: page ? formatPageTitle(page.title) : "Admin",
  };
}

const managementLinks = [
  { href: "/admin/pages", title: "Pages", description: "Create custom pages, publish/unpublish, delete." },
  { href: "/admin/nav", title: "Navigation", description: "Header nav items and one level of dropdowns." },
  { href: "/admin/post-slugs", title: "Post slugs", description: "Every post's slug, grouped by page and block." },
  { href: "/admin/tags", title: "Tags", description: "Rename, recolor, and clean up post tags." },
  { href: "/admin/images", title: "Images", description: "Every uploaded image, used/unused, delete the orphans." },
  { href: "/admin/themes", title: "Themes", description: "Create and manage custom color themes." },
  { href: "/admin/settings", title: "Settings", description: "Favicon and link-share (embed) defaults." },
  { href: "/admin/audit-log", title: "Audit log", description: "Every admin change, with one-step undo." },
];

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <Container className="flex flex-1 flex-col gap-8 py-16">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Admin
        </h1>
        <p className="text-sm text-muted">
          Signed in as <span className="text-foreground">{session.user.email}</span>.
        </p>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-accent/30 bg-accent/10 px-4 py-3 text-sm">
        <p className="text-pretty text-foreground/90">
          <span className="font-medium text-accent">Editing happens on the site itself.</span>{" "}
          Flip on <span className="font-medium text-foreground">Edit mode</span> in the header, then browse to
          any page below — content gets a dashed outline you can click to edit in place.
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Site management</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {managementLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/20"
            >
              <span className="text-sm font-semibold text-foreground">{link.title}</span>
              <span className="text-sm text-pretty text-muted">{link.description}</span>
            </Link>
          ))}
          {session.user.role === "OWNER" && (
            <Link
              href="/admin/users"
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/20"
            >
              <span className="text-sm font-semibold text-foreground">Users</span>
              <span className="text-sm text-pretty text-muted">
                Create accounts, change roles, remove access. OWNER-only.
              </span>
            </Link>
          )}
        </div>
      </div>
    </Container>
  );
}
