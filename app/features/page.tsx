import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Features — ${siteConfig.name}`,
  description:
    "Custom enchantments, land claims, and minigames built into JASS's Tweaks plugin — the systems that make survival worth logging back into.",
};

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
