import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { requireAdmin } from "@/lib/auth-guard";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";

// Next resolves more-specific static segments (app/admin, app/login, app/api,
// app/news/[slug]) before falling through to this catch-all, so those routes
// are safe by construction -- this only ever matches admin-created custom
// pages (and, incidentally, the 4 protected pages' slugs would match here
// too, but they each have their own static route file at a more specific
// path, so this file never actually renders them).
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) return { title: "Page not found" };

  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  // Both gates share the same "hidden from the public, visible to
  // signed-in admins with a banner" shape -- published takes priority when
  // a page happens to be both unpublished and adminOnly, since that's the
  // more restrictive/actionable state to surface to the admin viewing it.
  const gateBanner = !page.published
    ? "Unpublished draft — only visible to admins"
    : page.adminOnly
      ? "Admin+ only — not visible to the public"
      : null;

  if (gateBanner) {
    const isAdmin = await requireAdmin();
    if (!isAdmin) notFound();

    return (
      <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
        <div className="border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-accent">
          {gateBanner}
        </div>
        <PageRenderer page={page} />
      </SiteChrome>
    );
  }

  return (
    <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
