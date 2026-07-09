"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Container } from "@/components/container";
import { siteConfig } from "@/lib/site-config";
import { EditModeToggle } from "@/components/admin/edit-mode-toggle";
import { navItemHref } from "@/lib/routes";

type NavPage = { slug: string } | null;
type NavChild = { id: string; label: string; href: string | null; page: NavPage };
type NavTop = NavChild & { children: NavChild[] };

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 10 10"
      fill="none"
      aria-hidden
      className={`shrink-0 transition duration-150 ${open ? "-rotate-180" : "rotate-0"}`}
    >
      <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function SiteHeader({ isAdmin = false, navItems }: { isAdmin?: boolean; navItems: NavTop[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [mobileExpanded, setMobileExpanded] = useState<string | null>(null);

  const linkClass = (active: boolean) =>
    `rounded-md px-3 py-2 text-sm font-medium transition-colors ${active ? "text-foreground" : "text-muted hover:text-foreground"}`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground"
          onClick={() => setOpen(false)}
        >
          <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-primary" />
          {siteConfig.name}
        </Link>

        {/* Desktop nav: dropdowns open on hover or focus (aria-haspopup/
            aria-expanded), not a strict ARIA `role="menu"` widget -- simpler
            to get right and equally accessible for a marketing nav. One
            level of nesting only, enforced server-side. */}
        <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
          {navItems.map((item) => {
            const hasChildren = item.children.length > 0;
            const href = navItemHref(item);
            const active = pathname === href;

            if (!hasChildren) {
              return (
                <Link key={item.id} href={href} aria-current={active ? "page" : undefined} className={linkClass(active)}>
                  {item.label}
                </Link>
              );
            }

            const expanded = openDropdown === item.id;
            return (
              <div
                key={item.id}
                className="relative"
                onMouseEnter={() => setOpenDropdown(item.id)}
                onMouseLeave={() => setOpenDropdown((cur) => (cur === item.id ? null : cur))}
              >
                <button
                  type="button"
                  aria-haspopup="true"
                  aria-expanded={expanded}
                  onClick={() => setOpenDropdown((cur) => (cur === item.id ? null : item.id))}
                  onFocus={() => setOpenDropdown(item.id)}
                  className={`flex items-center gap-1 ${linkClass(active)}`}
                >
                  {item.label}
                  <ChevronIcon open={expanded} />
                </button>
                {expanded && (
                  <div
                    role="menu"
                    aria-label={item.label}
                    onFocus={() => setOpenDropdown(item.id)}
                    onBlur={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenDropdown(null);
                    }}
                    className="nav-drop-enter absolute left-0 top-full z-10 mt-1 min-w-40 rounded-md border border-border bg-surface py-1 shadow-lg shadow-black/20"
                  >
                    {item.children.map((child) => {
                      const childHref = navItemHref(child);
                      const childActive = pathname === childHref;
                      return (
                        <Link
                          key={child.id}
                          href={childHref}
                          role="menuitem"
                          aria-current={childActive ? "page" : undefined}
                          onClick={() => setOpenDropdown(null)}
                          className={`block px-3 py-2 text-sm transition-colors ${
                            childActive ? "text-foreground" : "text-muted hover:bg-surface-2 hover:text-foreground"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {isAdmin && (
            <Link href="/admin" aria-current={pathname === "/admin" ? "page" : undefined} className={linkClass(pathname === "/admin")}>
              Admin
            </Link>
          )}
          {isAdmin && (
            <div className="ml-2">
              <EditModeToggle />
            </div>
          )}
        </nav>

        <div className="flex items-center gap-2 sm:hidden">
          {isAdmin && <EditModeToggle />}
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-md text-foreground transition-colors hover:bg-surface-2 motion-safe:active:scale-90"
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            onClick={() => setOpen((v) => !v)}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 20 20"
              fill="none"
              aria-hidden
              className={
                open
                  ? "transition duration-200 ease-out motion-safe:rotate-90"
                  : "transition duration-200 ease-out motion-safe:rotate-0"
              }
            >
              {open ? (
                <path d="M4 4l12 12M16 4L4 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              ) : (
                <path
                  d="M2.5 5h15M2.5 10h15M2.5 15h15"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>
        </div>
      </Container>

      {open && (
        <nav id="mobile-nav" aria-label="Mobile" className="nav-drop-enter border-t border-border sm:hidden">
          <Container className="flex flex-col py-2">
            {navItems.map((item) => {
              const hasChildren = item.children.length > 0;
              const href = navItemHref(item);
              const active = pathname === href;

              if (!hasChildren) {
                return (
                  <Link
                    key={item.id}
                    href={href}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={`rounded-md px-3 py-3 text-base font-medium transition-colors ${
                      active ? "text-foreground" : "text-muted hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              }

              const expanded = mobileExpanded === item.id;
              return (
                <div key={item.id}>
                  <button
                    type="button"
                    aria-expanded={expanded}
                    onClick={() => setMobileExpanded((cur) => (cur === item.id ? null : item.id))}
                    className="flex w-full items-center justify-between rounded-md px-3 py-3 text-base font-medium text-muted transition-colors hover:text-foreground"
                  >
                    {item.label}
                    <ChevronIcon open={expanded} />
                  </button>
                  {expanded && (
                    <div className="flex flex-col pl-4">
                      {item.children.map((child) => {
                        const childHref = navItemHref(child);
                        const childActive = pathname === childHref;
                        return (
                          <Link
                            key={child.id}
                            href={childHref}
                            aria-current={childActive ? "page" : undefined}
                            onClick={() => setOpen(false)}
                            className={`rounded-md px-3 py-2.5 text-sm transition-colors ${
                              childActive ? "text-foreground" : "text-muted hover:text-foreground"
                            }`}
                          >
                            {child.label}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {isAdmin && (
              <Link
                href="/admin"
                aria-current={pathname === "/admin" ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`rounded-md px-3 py-3 text-base font-medium transition-colors ${
                  pathname === "/admin" ? "text-foreground" : "text-muted hover:text-foreground"
                }`}
              >
                Admin
              </Link>
            )}
          </Container>
        </nav>
      )}
    </header>
  );
}
