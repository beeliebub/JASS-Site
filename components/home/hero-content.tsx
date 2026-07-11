"use client";

import Link from "next/link";
import { Container } from "@/components/container";
import { LiveStatusBadge } from "@/components/home/live-status-badge";
import { CopyIpButton } from "@/components/home/copy-ip-button";
import { EditableContent } from "@/components/admin/editable-content";

/** The site-wide hero fields, fetched server-side once per page render in
 * page-renderer.tsx (see its `getSiteContent()` call) and threaded through
 * as plain serializable data on `ClientBlock.heroContent` -- deliberately
 * *not* a pre-rendered element, since a Server-Component-rendered ReactNode
 * crossing into a Client Component as a prop arrives as an opaque RSC
 * reference that can't be introspected/cloned from userland code. Passing
 * plain strings instead lets registry.tsx's `hero` entry construct a fresh
 * `<HeroContent>` element itself on every render. */
export type HeroContentData = {
  heroName: string;
  heroTagline: string;
  serverIp: string;
  heroNameKey: string;
  heroTaglineKey: string;
  serverIpKey: string;
};

export type HeroContentProps = HeroContentData & {
  /** Per-instance Phase 18 override -- read live off `block.data` by
   * registry.tsx's `hero` entry on every render, so editing it via
   * HeroOverrideControls updates the visible heading immediately. */
  headingOverride?: string | null;
  taglineOverride?: string | null;
};

export function HeroContent({
  heroName,
  heroTagline,
  serverIp,
  heroNameKey,
  heroTaglineKey,
  serverIpKey,
  headingOverride,
  taglineOverride,
}: HeroContentProps) {
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
          {headingOverride ? (
            <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl">
              {headingOverride}
            </h1>
          ) : (
            <EditableContent
              contentKey={heroNameKey}
              initialValue={heroName}
              as="h1"
              label="server name"
              className="max-w-2xl text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl lg:text-6xl"
            />
          )}
          {taglineOverride ? (
            <p className="max-w-lg text-lg text-muted text-pretty">{taglineOverride}</p>
          ) : (
            <EditableContent
              contentKey={heroTaglineKey}
              initialValue={heroTagline}
              as="p"
              label="tagline"
              className="max-w-lg text-lg text-muted text-pretty"
            />
          )}
        </div>

        <div className="flex h-12 w-full items-center gap-3 rounded-md border border-border bg-surface pl-4 pr-1.5 sm:w-auto">
          <EditableContent
            contentKey={serverIpKey}
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
