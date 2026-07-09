import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug, getSiteContent } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";

// Dynamic rather than static so the title/description/OG copy always match
// whatever an admin has edited in place -- including the live server IP --
// instead of drifting from the hardcoded lib/site-config.ts defaults.
export async function generateMetadata(): Promise<Metadata> {
  const { heroName, heroTagline, serverIp } = await getSiteContent();
  const title = `${heroName} — Minecraft Server`;
  const description = `${heroTagline} Join at ${serverIp}.`;

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

  return <PageRenderer page={page} />;
}
