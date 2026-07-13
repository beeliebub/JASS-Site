import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPageBySlug } from "@/lib/content";
import { ResourcePackView } from "@/components/resource/resource-pack-view";
import { ResourcePackAdmin } from "@/components/resource/resource-pack-admin";
import { SiteChrome } from "@/components/pages/site-chrome";
import { formatPageTitle } from "@/lib/site-config";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPageBySlug("resource");
  return {
    title: page ? formatPageTitle(page.title) : "Resource",
    description: "Download the official JASS resource pack and get the server.properties snippet to auto-apply it.",
  };
}

// Same fallback pattern as app/layout.tsx's siteUrl -- see that file for why
// the real MC server's domain is used as a placeholder until a dedicated
// website domain exists.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://justasimpleserver.net";

export default async function ResourcePackPage() {
  const pack = await prisma.resourcePack.findFirst({ where: { active: true } });
  const downloadUrl = `${siteUrl}/api/resource-pack`;
  const packSummary = pack
    ? { filename: pack.filename, sha1: pack.sha1, uploadedAt: pack.uploadedAt.toISOString() }
    : null;

  return (
    <SiteChrome theme={null} customThemeTokens={null}>
      <ResourcePackView pack={packSummary} downloadUrl={downloadUrl} />
      <ResourcePackAdmin />
    </SiteChrome>
  );
}
