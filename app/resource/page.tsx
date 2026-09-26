import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPageBySlug } from "@/lib/content";
import { ResourcePackView } from "@/components/resource/resource-pack-view";
import { ResourcePackAdmin } from "@/components/resource/resource-pack-admin";
import { SiteChrome } from "@/components/pages/site-chrome";
import { formatPageTitle, siteConfig } from "@/lib/site-config";
import { getSiteSettings } from "@/lib/site-settings";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("resource");
  const settings = await getSiteSettings();
  return {
    title: page ? formatPageTitle(page.title, settings.pageTitleSuffix ?? siteConfig.name) : "Resource",
    description: "Download JASS resource packs and get server.properties snippets to auto-apply them.",
  };
}

// Same fallback pattern as app/layout.tsx's siteUrl -- see that file for why
// the real MC server's domain is used as a placeholder until a dedicated
// website domain exists.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://justasimpleserver.net";

export default async function ResourcePackPage() {
  const packs = await prisma.resourcePack.findMany({ orderBy: { uploadedAt: "desc" } });
  const packSummaries = packs.map((pack) => ({
    id: pack.id,
    filename: pack.filename,
    size: pack.size,
    sha1: pack.sha1,
    uuid: pack.uuid,
    uploadedAt: pack.uploadedAt.toISOString(),
    downloadUrl: `${siteUrl}/api/resource-pack/${pack.id}`,
  }));

  return (
    <SiteChrome theme={null} customThemeTokens={null}>
      <ResourcePackView packs={packSummaries} />
      <ResourcePackAdmin siteUrl={siteUrl} />
    </SiteChrome>
  );
}
