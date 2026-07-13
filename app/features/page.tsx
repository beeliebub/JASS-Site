import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { formatPageTitle } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("features");
  return {
    title: page ? formatPageTitle(page.title) : "Page not found",
    description:
      "Custom enchantments, land claims, and minigames built into JASS's Tweaks plugin — the systems that make survival worth logging back into.",
  };
}

export default async function FeaturesPage() {
  const page = await getPageBySlug("features");
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  return (
    <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
