import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getPageBySlug } from "@/lib/content";
import { PageRenderer } from "@/components/pages/page-renderer";

export const metadata: Metadata = {
  title: "Rules — JASS",
  description: "The rules every player agrees to by joining JASS — conduct, claims, and fair play.",
};

export default async function RulesPage() {
  const page = await getPageBySlug("rules");
  if (!page) notFound();

  return <PageRenderer page={page} />;
}
