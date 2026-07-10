import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth } from "@/auth";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { siteConfig } from "@/lib/site-config";
import { EditModeProvider } from "@/components/admin/edit-mode-context";
import { ToastProvider } from "@/components/admin/toast";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { ThemeScript } from "@/components/theme/theme-script";
import { isAdminRole } from "@/lib/auth-guard";
import { getNavTree } from "@/lib/content";

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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: defaultTitle,
  description: siteConfig.tagline,
  openGraph: {
    title: defaultTitle,
    description: siteConfig.tagline,
    siteName: siteConfig.name,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: defaultTitle,
    description: siteConfig.tagline,
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const isAdmin = isAdminRole(session?.user?.role);
  const navTree = await getNavTree();

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      {/* Theme flash-prevention (Phase 9, PLAN.md): a blocking inline script
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
            <EditModeProvider isAdmin={isAdmin}>
              <SiteHeader isAdmin={isAdmin} navItems={navTree} />
              <main id="main-content" className="flex flex-1 flex-col">
                {children}
              </main>
              <SiteFooter navItems={navTree} />
            </EditModeProvider>
          </ToastProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
