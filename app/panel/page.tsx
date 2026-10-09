import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { Container } from "@/components/container";
import { SiteChrome } from "@/components/pages/site-chrome";
import { getPageBySlug } from "@/lib/content";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";

export async function generateMetadata(): Promise<Metadata> {
  const [page, settings] = await Promise.all([getPageBySlug("panel"), getSiteSettings()]);
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Panel",
    robots: { index: false, follow: false },
  };
}

export default async function PanelFallbackPage() {
  const session = await auth();
  if (!session?.user) redirect("/login?next=%2Fpanel");

  return (
    <SiteChrome theme={null} customThemeTokens={null}>
      <Container className="flex flex-1 flex-col items-start gap-4 py-16">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Server panel</h1>
        <p className="max-w-prose text-sm text-pretty text-muted">
          Production panel requests are served by the separate JASS Panel daemon. This fallback appears when the website receives
          the request instead.
        </p>
        {/* Keep the fallback navigation as a full document request. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/admin" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
          Return to site administration
        </a>
      </Container>
    </SiteChrome>
  );
}
