import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/auth";
import { Container } from "@/components/container";

export const metadata = {
  title: "Admin",
};

const editablePages = [
  { href: "/", title: "Home", description: "Server name, tagline, and IP." },
  { href: "/rules", title: "Rules", description: "Rule sections and individual rules." },
  { href: "/features", title: "Features", description: "Feature cards, icons, and ordering." },
  { href: "/news", title: "News", description: "Create, edit, and delete announcements." },
];

const managementLinks = [
  { href: "/admin/pages", title: "Pages", description: "Create custom pages, publish/unpublish, delete." },
  { href: "/admin/nav", title: "Navigation", description: "Header nav items and one level of dropdowns." },
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
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Editable pages</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {editablePages.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-4 transition motion-safe:hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg hover:shadow-black/20"
            >
              <span className="text-sm font-semibold text-foreground">{page.title}</span>
              <span className="text-sm text-pretty text-muted">{page.description}</span>
            </Link>
          ))}
        </div>
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

      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/login" });
        }}
      >
        <button
          type="submit"
          className="flex h-10 items-center justify-center rounded-md border border-border-strong px-4 text-sm font-medium text-foreground transition hover:bg-surface-2 motion-safe:active:scale-[0.97]"
        >
          Sign out
        </button>
      </form>
    </Container>
  );
}
