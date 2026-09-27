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
  const page = await getPageBySlug("wiki");
  const settings = await getSiteSettings();
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Page not found",
    description:
      "Custom enchantments, land claims, and minigames built into JASS's Tweaks plugin — the systems that make survival worth logging back into.",
  };
}

export default async function WikiPage() {
  const page = await getPageBySlug("wiki");
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
