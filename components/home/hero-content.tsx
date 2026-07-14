"use client";

import Link from "next/link";
import { Container } from "@/components/container";
import { LiveStatusBadge } from "@/components/home/live-status-badge";
import { CopyIpButton } from "@/components/home/copy-ip-button";
import { EditableContent } from "@/components/admin/editable-content";
import { TONE_STYLES } from "@/components/blocks/tones";
import type { Tone } from "@/lib/themes";

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

/** One admin-configurable hero CTA button -- label/href/tone, `tone`
 * reusing the shared `TONES` enum (see lib/themes.ts) rather than a new
 * color system. Mirrors `heroButtonSchema` in lib/validation/pages.ts. */
export type HeroButton = { label: string; href: string; tone: Tone };

/** Today's exact two hardcoded CTA buttons, used as a fallback whenever a
 * hero block's `data.buttons` is unset or empty -- see heroDataSchema's doc
 * comment in lib/validation/pages.ts. Keeps existing pages rendering
 * identically until an admin actually edits the buttons for that instance. */
const DEFAULT_HERO_BUTTONS: HeroButton[] = [
  { label: "Explore Features", href: "/features", tone: "primary" },
  { label: "Read the Rules", href: "/rules", tone: "neutral" },
];

/** Maps a button's `tone` to Tailwind classes. `primary` and `neutral`
 * reproduce today's original two button styles exactly (filled primary /
 * outlined neutral) so the fallback above renders pixel-identical to
 * before. The other `TONES` values reuse the shared `TONE_STYLES` tint
 * (components/blocks/tones.tsx, already backing CalloutBlock/
 * CtaBannerBlock/LinkGridBlock) as an outlined treatment, matching
 * CtaBannerBlock's non-neutral button styling. */
function heroButtonToneClasses(tone: Tone): string {
  if (tone === "primary") return "bg-primary text-primary-foreground hover:bg-primary-hover";
  if (tone === "neutral") return "border border-border-strong text-foreground hover:bg-surface-2";
  const styles = TONE_STYLES[tone];
  return `border ${styles.container} ${styles.title} hover:bg-current/20`;
}

export type HeroContentProps = HeroContentData & {
  /** Per-instance override -- read live off `block.data` by
   * registry.tsx's `hero` entry on every render, so editing it via
   * HeroOverrideControls updates the visible heading immediately. */
  headingOverride?: string | null;
  taglineOverride?: string | null;
  /** Per-instance CTA button list, same live-read-off-`block.data`
   * convention as the overrides above. Unset/empty falls back to
   * `DEFAULT_HERO_BUTTONS`. */
  buttons?: HeroButton[] | null;
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
  buttons,
}: HeroContentProps) {
  const activeButtons = buttons && buttons.length > 0 ? buttons : DEFAULT_HERO_BUTTONS;
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
          {activeButtons.map((button, i) => (
            <Link
              key={i}
              href={button.href}
              className={`flex h-11 items-center justify-center rounded-md px-5 text-sm font-medium transition motion-safe:active:scale-[0.97] ${heroButtonToneClasses(button.tone)}`}
            >
              {button.label}
            </Link>
          ))}
        </div>
      </Container>
    </section>
  );
}
