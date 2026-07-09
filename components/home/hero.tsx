import Link from "next/link";
import { Container } from "@/components/container";
import { CONTENT_KEYS, getSiteContent } from "@/lib/content";
import { LiveStatusBadge } from "@/components/home/live-status-badge";
import { CopyIpButton } from "@/components/home/copy-ip-button";
import { EditableContent } from "@/components/admin/editable-content";

export async function Hero() {
  const { heroName, heroTagline, serverIp } = await getSiteContent();

  return (
    <section className="relative overflow-hidden border-b border-border bg-grid">
      {/* Fade the grid texture out toward the bottom so it reads as a
          backdrop rather than a repeating pattern competing with content. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background"
      />
      <Container className="relative flex flex-col gap-8 py-16 sm:py-24 lg:py-28">
        <LiveStatusBadge />

        <div className="flex flex-col gap-4">
          <EditableContent
            contentKey={CONTENT_KEYS.heroName}
            initialValue={heroName}
            as="h1"
            label="server name"
            className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl"
          />
          <EditableContent
            contentKey={CONTENT_KEYS.heroTagline}
            initialValue={heroTagline}
            as="p"
            label="tagline"
            className="max-w-lg text-lg text-muted text-pretty"
          />
        </div>

        <div className="flex h-12 w-full items-center gap-3 rounded-md border border-border bg-surface pl-4 pr-1.5 sm:w-auto">
          <EditableContent
            contentKey={CONTENT_KEYS.serverIp}
            initialValue={serverIp}
            as="span"
            label="server IP"
            className="select-all break-all font-mono text-sm text-foreground sm:text-base"
          />
          <div className="ml-auto">
            <CopyIpButton ip={serverIp} />
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/features"
            className="flex h-11 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover motion-safe:active:scale-[0.97]"
          >
            Explore Features
          </Link>
          <Link
            href="/rules"
            className="flex h-11 items-center justify-center rounded-md border border-border-strong px-5 text-sm font-medium text-foreground transition hover:bg-surface-2 motion-safe:active:scale-[0.97]"
          >
            Read the Rules
          </Link>
        </div>
      </Container>
    </section>
  );
}
