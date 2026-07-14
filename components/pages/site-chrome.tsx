import type { CSSProperties, ReactNode } from "react";
import { auth } from "@/auth";
import { isAdminRole } from "@/lib/auth-guard";
import { getNavTree } from "@/lib/content";
import { getVisibleCustomThemes } from "@/lib/custom-themes";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { THEME_IDS, type ThemeId } from "@/lib/themes";
import type { CustomThemeTokens } from "@/lib/custom-themes";
import type { HeaderContent } from "@/lib/validation/pages";

function isThemeId(value: string): value is ThemeId {
  return (THEME_IDS as readonly string[]).includes(value);
}

/**
 * Single per-route integration point for header + content + footer, and
 * the ONE place a page-level theme override is applied. Every
 * route file (the 5 CMS-driven pages via PageRenderer, plus the 4 static
 * account/admin/login/resource routes) renders its content as this
 * component's `children` instead of relying on app/layout.tsx to supply
 * chrome -- that's what lets the override wrap the header and footer too,
 * not just the content: RootLayout can't see a specific route's Page row
 * (and deliberately avoids `headers()`/`cookies()` to stay static-render
 * friendly), so the wrapping div has to live
 * here, one level below <body>, wrapping everything Header/Footer-shaped.
 *
 * `theme` and `customThemeTokens` are mutually exclusive (enforced in
 * lib/validation/pages.ts); at most one wins here too. Neither set means
 * "follow the visitor's own theme/accent" -- no wrapper div at all in that
 * case, same DOM shape as before this override existed.
 */
export async function SiteChrome({
  theme,
  customThemeTokens,
  headerContent,
  children,
}: {
  theme?: string | null;
  customThemeTokens?: CustomThemeTokens | null;
  headerContent?: HeaderContent | null;
  children: ReactNode;
}) {
  const [session, navItems, customThemes] = await Promise.all([auth(), getNavTree(), getVisibleCustomThemes()]);
  const isAdmin = isAdminRole(session?.user?.role);

  const chrome = (
    <>
      <SiteHeader isAdmin={isAdmin} navItems={navItems} headerContent={headerContent} />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
      <SiteFooter navItems={navItems} customThemes={customThemes} />
    </>
  );

  // Re-asserts bg/text classes so the wrapper actually repaints with the
  // overridden tokens instead of only affecting descendants (same note as
  // the original PageRenderer wrapper, now living one level higher).
  if (theme && isThemeId(theme)) {
    return (
      <div data-theme={theme} className="flex min-h-full flex-1 flex-col bg-background text-foreground">
        {chrome}
      </div>
    );
  }

  if (customThemeTokens) {
    return (
      <div
        style={customThemeTokens as CSSProperties}
        className="flex min-h-full flex-1 flex-col bg-background text-foreground"
      >
        {chrome}
      </div>
    );
  }

  return chrome;
}
