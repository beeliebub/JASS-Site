import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { requireAdmin } from "@/lib/auth-guard";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";

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
  const settings = await getSiteSettings();

  return {
    title: formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name),
    description: page.metaDescription ?? undefined,
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = await getPageBySlug(slug);
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  const gateBanner = !page.published ? "Unpublished draft — only visible to admins" : null;

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
