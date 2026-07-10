import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";

export const metadata: Metadata = {
  title: "Rules — JASS",
  description: "The rules every player agrees to by joining JASS — conduct, claims, and fair play.",
};

export default async function RulesPage() {
  const page = await getPageBySlug("rules");
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  return (
    <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
