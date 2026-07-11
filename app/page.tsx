import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug, getSiteContent } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { SiteChrome } from "@/components/pages/site-chrome";
import { resolvePageTheme } from "@/lib/custom-themes";
import { getSiteSettings } from "@/lib/site-settings";

// Dynamic rather than static so the title/description/OG copy always match
// whatever an admin has edited in place -- including the live server IP --
// instead of drifting from the hardcoded lib/site-config.ts defaults.
//
// Phase 17 (PLAN.md decision 4): SiteSettings.embedTitle/embedDescription is
// a link-share-only fallback that's only meant to apply when there's no
// custom embed image. app/layout.tsx's generateMetadata() implements this
// same fallback against the hardcoded siteConfig defaults, but Next's
// per-segment metadata resolution has every page-level generateMetadata
// (this one included) fully replace the parent layout's title/description/
// openGraph/twitter rather than merging with it -- confirmed live: PUT-ing
// embedTitle/embedDescription had zero visible effect on `/` without this,
// because this file's own title/description always won. Since `/` is the
// site's most commonly shared link, the fallback is reapplied here too, on
// top of (not instead of) the CMS hero content this page already prefers
// over the raw siteConfig defaults.
export async function generateMetadata(): Promise<Metadata> {
  const [{ heroName, heroTagline, serverIp }, settings] = await Promise.all([getSiteContent(), getSiteSettings()]);
  const defaultTitle = `${heroName} — Minecraft Server`;
  const defaultDescription = `${heroTagline} Join at ${serverIp}.`;

  const title = !settings.embedImageUrl && settings.embedTitle ? settings.embedTitle : defaultTitle;
  const description =
    !settings.embedImageUrl && settings.embedDescription ? settings.embedDescription : defaultDescription;

  return {
    title,
    description,
    openGraph: { title, description },
    twitter: { title, description },
  };
}

export default async function Home() {
  const page = await getPageBySlug("home");
  if (!page) notFound();
  const { theme, customThemeTokens } = await resolvePageTheme(page);

  return (
    <SiteChrome theme={theme} customThemeTokens={customThemeTokens}>
      <PageRenderer page={page} />
    </SiteChrome>
  );
}
