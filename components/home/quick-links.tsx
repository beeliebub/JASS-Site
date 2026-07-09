import Link from "next/link";
import { Container } from "@/components/container";

type QuickLink = {
  href: string;
  title: string;
  description: string;
};

const links: QuickLink[] = [
  {
    href: "/rules",
    title: "Rules",
    description: "What keeps the server fair and the community worth sticking around for.",
  },
  {
    href: "/features",
    title: "Features",
    description: "Custom enchants, land claims, and minigames layered on top of vanilla survival.",
  },
  {
    href: "/news",
    title: "News",
    description: "Patch notes, event announcements, and updates from the team.",
  },
];

export function QuickLinks() {
  return (
    <section className="border-b border-border">
      <Container className="py-16 sm:py-20">
        <h2 className="text-sm font-medium tracking-wide text-muted uppercase">Get oriented</h2>
        <div className="mt-6 grid grid-cols-1 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-3">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="group flex flex-col gap-2 bg-surface p-6 transition-colors hover:bg-surface-2"
            >
              <span className="flex items-center justify-between text-base font-semibold text-foreground">
                {link.title}
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  aria-hidden
                  className="text-muted transition group-hover:translate-x-0.5 group-hover:text-primary"
                >
                  <path
                    d="M3 8h9.5M8.5 3.5L13 8l-4.5 4.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <span className="text-sm text-pretty text-muted">{link.description}</span>
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
