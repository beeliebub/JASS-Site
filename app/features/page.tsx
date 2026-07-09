import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";
import { siteConfig } from "@/lib/site-config";

export const metadata: Metadata = {
  title: `Features — ${siteConfig.name}`,
  description:
    "Custom enchantments, land claims, and minigames built into Embervale's Tweaks plugin — the systems that make survival worth logging back into.",
};

export default async function FeaturesPage() {
  const page = await getPageBySlug("features");
  if (!page) notFound();

  return <PageRenderer page={page} />;
}
