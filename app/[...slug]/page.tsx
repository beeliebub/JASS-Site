import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { requireAdmin } from "@/lib/auth-guard";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";
import { parseHeaderContent } from "@/lib/validation/pages";

// Next resolves more-specific static segments (app/admin, app/login, app/api,
// app/news/[slug]) before falling through to this catch-all. This route also
// receives deeper paths for admin-created custom pages, while the protected
// pages continue to use their own static route files.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (slug.length > 3) return { title: "Page not found" };

  const page = await getPageBySlug(slug.join("/"));
  if (!page) return { title: "Page not found" };
  const settings = await getSiteSettings();

  return {
    title: formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name),
    description: page.metaDescription ?? undefined,
  };
}

export default async function CustomPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  if (slug.length > 3) notFound();

  const page = await getPageBySlug(slug.join("/"));
  if (!page) notFound();

  // Published redirect pages never render their blocks. `redirect()` throws
  // the framework response internally, so keep it outside application error
  // handling and do not bypass it for admins visiting the public URL.
  if (page.redirectUrl && page.published) redirect(page.redirectUrl);

  const { theme, customThemeTokens } = await resolvePageTheme(page);

  const gateBanner = !page.published ? "Unpublished draft — only visible to admins" : null;

  if (gateBanner) {
    const isAdmin = await requireAdmin();
    if (!isAdmin) notFound();

    return (
      <SiteChrome
        theme={theme}
        customThemeTokens={customThemeTokens}
        headerContent={parseHeaderContent(page.headerContent)}
      >
        <div className="border-b border-accent/30 bg-accent/10 px-4 py-2 text-center text-xs font-medium uppercase tracking-wide text-accent">
          {gateBanner}
        </div>
        {page.redirectUrl && (
          <div className="border-b border-border bg-surface-2 px-4 py-3 text-center text-sm text-muted">
            Redirect target: <code className="font-mono text-foreground">{page.redirectUrl}</code>
          </div>
        )}
        <PageRenderer page={page} />
      </SiteChrome>
    );
  }

  return (
    <SiteChrome
      theme={theme}
      customThemeTokens={customThemeTokens}
      headerContent={parseHeaderContent(page.headerContent)}
    >
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
