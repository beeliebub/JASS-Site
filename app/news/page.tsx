import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { formatPageTitle } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("news");
  return {
    title: page ? formatPageTitle(page.title) : "Page not found",
    description: "Updates, patch notes, and announcements from the JASS Minecraft server.",
  };
}

export default async function NewsPage() {
  const page = await getPageBySlug("news");
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  return (
    <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
