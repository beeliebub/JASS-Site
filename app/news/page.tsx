import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";

export const metadata: Metadata = {
  title: "News — Embervale",
  description:
    "Updates, patch notes, and announcements from the Embervale Minecraft server.",
};

export default async function NewsPage() {
  const page = await getPageBySlug("news");
  if (!page) notFound();

  return <PageRenderer page={page} />;
}
