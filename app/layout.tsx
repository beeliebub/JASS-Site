import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { siteConfig } from "@/lib/site-config";
import { EditModeProvider } from "@/components/admin/edit-mode-context";
import { ToastProvider } from "@/components/admin/toast";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { isAdminRole } from "@/lib/auth-guard";
import { getSiteSettings } from "@/lib/site-settings";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Public production URL for this site (distinct from `MC_SERVER_HOST`, which
// is the Minecraft server the status badge pings). Falls back to the real
// server's domain since a dedicated website domain hasn't been decided yet —
// see docs/DEPLOYMENT.md. Override with NEXT_PUBLIC_SITE_URL once one is.
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://justasimpleserver.net";

const defaultTitle = `${siteConfig.name} — Minecraft Server`;

/**
 * Reads `SiteSettings` for the link-share (embed) image
 * and fallback title/description text. Converted from a static `export const
 * metadata` to `generateMetadata()` so this can read the DB at request time
 * -- per the installed Next docs (generate-metadata.md: "Resolving
 * generateMetadata is part of rendering the page... [if it] doesn't
 * introduce dynamic behavior, the resulting metadata is included in the
 * page's initial HTML"), metadata resolution and a route's own
 * prerendering/dynamic strategy are independent, so this does not force
 * every page in the tree into fully dynamic rendering by itself.
 *
 * `embedTitle`/`embedDescription` are ONLY used as a
 * fallback when there's no custom embed image -- if `embedImageUrl` is set,
 * title/description always stay the default `siteConfig` text (the custom
 * text fields are an "in the absence of an image" fallback, not a general
 * override). Each falls back independently. When `SiteSettings` is entirely
 * unset (today's default state), this object is identical to the static one
 * it replaces -- zero visible change until an admin opts in.
 */
export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  const title = !settings.embedImageUrl && settings.embedTitle ? settings.embedTitle : defaultTitle;
  const description =
    !settings.embedImageUrl && settings.embedDescription ? settings.embedDescription : siteConfig.tagline;
  const images = settings.embedImageUrl ? [settings.embedImageUrl] : undefined;

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      siteName: siteConfig.name,
      type: "website",
      locale: "en_US",
      ...(images ? { images } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(images ? { images } : {}),
    },
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const isAdmin = isAdminRole(session?.user?.role);

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Theme flash-prevention: a blocking inline script
          in <head> corrects data-theme/accent on <html> before first paint
          (see components/theme/theme-script.tsx and
          node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md,
          "Themes" section, for why this lives in an explicit <head> rather
          than next/script). suppressHydrationWarning above is required
          because that mutation happens before React hydrates. */}
      <head>
        <ThemeScript />
      </head>
      <body className="flex min-h-full flex-col bg-background font-sans text-foreground">
        {/* Visually hidden until focused -- lets keyboard/screen-reader users
            jump past the header nav straight to page content. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus-visible:fixed focus-visible:top-4 focus-visible:left-4 focus-visible:z-50 focus-visible:rounded-md focus-visible:bg-primary focus-visible:px-4 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-primary-foreground"
        >
          Skip to content
        </a>
        <ThemeProvider>
          <ToastProvider>
            <EditModeProvider isAdmin={isAdmin}>{children}</EditModeProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
