import type { Prisma } from "@/app/generated/prisma/client";

type RedirectClient = Pick<Prisma.TransactionClient, "page">;

export class RedirectCycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RedirectCycleError";
  }
}

function redirectTargetSlug(value: string): string | null {
  if (!value.startsWith("/") || value.startsWith("//")) return null;

  try {
    const pathname = new URL(value, "https://redirect.invalid").pathname;
    const withoutSlashes = pathname.replace(/^\/+|\/+$/g, "");
    if (!withoutSlashes) return "home";
    return decodeURIComponent(withoutSlashes);
  } catch {
    return null;
  }
}

/**
 * Follows root-relative page redirects through the transaction client and
 * reports a cycle or an overlong redirect chain. Absolute URLs do not point
 * back into this page table, so they need no cycle lookup.
 */
export async function findRedirectCycle(
  client: RedirectClient,
  {
    pageId,
    pageSlug,
    redirectUrl,
  }: { pageId: string; pageSlug?: string; redirectUrl: string | null | undefined },
): Promise<string | null> {
  if (!redirectUrl) return null;

  const visited = new Map<string, string>([[pageId, pageSlug ?? "current page"]]);
  let nextUrl: string | null = redirectUrl;

  for (let hop = 0; hop < 10; hop += 1) {
    const targetSlug = redirectTargetSlug(nextUrl);
    if (!targetSlug) return null;

    // During a create, rename, or undo, the candidate page's new slug is not
    // necessarily present in the transaction's pre-write lookup state.
    if (pageSlug && targetSlug === pageSlug) {
      const path = [...visited.values(), targetSlug].join(" → ");
      return `Redirect cycle detected (${path}).`;
    }

    const target = await client.page.findUnique({
      where: { slug: targetSlug },
      select: { id: true, slug: true, redirectUrl: true },
    });
    if (!target) return null;

    if (visited.has(target.id)) {
      const path = [...visited.values(), target.slug].join(" → ");
      return `Redirect cycle detected (${path}).`;
    }

    visited.set(target.id, target.slug);
    if (!target.redirectUrl) return null;
    nextUrl = target.redirectUrl;
  }

  return "Redirect chain exceeds the 10-page limit.";
}
