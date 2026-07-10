import Link from "next/link";
import { Container } from "@/components/container";
import { ThemePicker } from "@/components/theme/theme-picker";
import { siteConfig } from "@/lib/site-config";
import { navItemHref } from "@/lib/routes";
import type { CustomTheme } from "@/app/generated/prisma/client";

type NavPage = { slug: string } | null;
type NavTop = { id: string; label: string; href: string | null; page: NavPage };

export function SiteFooter({ navItems, customThemes }: { navItems: NavTop[]; customThemes: CustomTheme[] }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-border">
      <Container className="flex flex-col gap-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <p>
          &copy; {year} {siteConfig.name}. Not affiliated with Mojang, Microsoft, or Hypixel Studios.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {navItems.map((item) => (
              <Link key={item.id} href={navItemHref(item)} className="transition-colors hover:text-foreground">
                {item.label}
              </Link>
            ))}
          </nav>
          <ThemePicker customThemes={customThemes} />
        </div>
      </Container>
    </footer>
  );
}
