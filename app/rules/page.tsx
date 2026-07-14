import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";
import { parseHeaderContent } from "@/lib/validation/pages";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("rules");
  const settings = await getSiteSettings();
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Page not found",
    description: "The rules every player agrees to by joining JASS — conduct, claims, and fair play.",
  };
}

export default async function RulesPage() {
  const page = await getPageBySlug("rules");
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

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
