import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/site-config";
import { ruleSections, type RuleSection } from "@/components/rules/rules-data";
import { newsPosts } from "@/components/news/posts-data";
import { DEFAULT_TAG_COLOR } from "@/lib/validation/content";

/**
 * Loads placeholder content into the DB. Every write is an
 * upsert so this is safe to re-run (e.g. after editing this file, or in CI).
 */

const CONTENT_BLOCKS: { key: string; value: string }[] = [
  { key: "hero.name", value: siteConfig.name },
  { key: "hero.tagline", value: siteConfig.tagline },
  { key: "server.ip", value: siteConfig.ip },
];

// Feature.icon keys map to the components in components/features/icons.tsx
// (see components/features/icon-registry.ts for the reverse lookup).
const FEATURES: {
  order: number;
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
  accent: boolean;
}[] = [
  {
    order: 0,
    eyebrow: "Enchantment",
    title: "Tunneller",
    description:
      "Mines a full 3x3 tunnel in whatever direction you're digging. No more crouching in a one-block doorway swinging a pickaxe.",
    icon: "tunneller",
    accent: false,
  },
  {
    order: 1,
    eyebrow: "Enchantment",
    title: "Efficacy",
    description:
      "Pushes your tools past vanilla's efficiency ceiling. Your best pickaxe just keeps getting faster, tier after tier.",
    icon: "efficacy",
    accent: false,
  },
  {
    order: 2,
    eyebrow: "Enchantment",
    title: "Telekinesis",
    description:
      "Blocks and drops fly straight into your inventory the moment you mine them. Nothing lost down a ravine, ever again.",
    icon: "telekinesis",
    accent: false,
  },
  {
    order: 3,
    eyebrow: "Claims",
    title: "Land Claims & Protection",
    description:
      "Claim your build and it's yours — griefers get stopped at the border. Trust specific friends with fine-grained access whenever you want.",
    icon: "shield",
    accent: false,
  },
  {
    order: 4,
    eyebrow: "Interface",
    title: "Permissions GUI",
    description:
      "Manage who can build, open chests, or flip switches on your claim from a simple in-game menu. No commands to memorize, ever.",
    icon: "sliders",
    accent: false,
  },
  {
    order: 5,
    eyebrow: "Minigame",
    title: "Whack-a-Mole",
    description:
      "A fast, arcade-style break from survival. Quick reflexes and a quicker hammer are the only skills required.",
    icon: "hammer",
    accent: true,
  },
  {
    order: 6,
    eyebrow: "Minigame",
    title: "Mannequin Combat Trials",
    description:
      "Spar against AI-controlled mannequins in a dedicated arena to sharpen your PvP timing before taking it out into the wild.",
    icon: "target",
    accent: true,
  },
  {
    order: 7,
    eyebrow: "Quality of Life",
    title: "In-Game Help System",
    description:
      "Stuck on a command, an enchantment, or a claim permission? Pull up a reference in-game without ever alt-tabbing to a wiki.",
    icon: "help",
    accent: false,
  },
];

async function seedContentBlocks() {
  for (const block of CONTENT_BLOCKS) {
    await prisma.contentBlock.upsert({
      where: { key: block.key },
      create: block,
      update: { value: block.value },
    });
  }
  console.log(`Seeded ${CONTENT_BLOCKS.length} content blocks.`);
}

async function seedRuleSections(blockId: string, sections: RuleSection[]) {
  let sectionCount = 0;
  let ruleCount = 0;

  for (const [sectionIndex, section] of sections.entries()) {
    const dbSection = await prisma.ruleSection.upsert({
      where: { id: section.id },
      create: {
        id: section.id,
        order: sectionIndex,
        title: section.title,
        description: section.description,
        blockId,
      },
      update: {
        order: sectionIndex,
        title: section.title,
        description: section.description,
      },
    });
    sectionCount += 1;

    for (const [ruleIndex, rule] of section.rules.entries()) {
      const ruleId = `${section.id}--${ruleIndex}`;
      await prisma.rule.upsert({
        where: { id: ruleId },
        create: {
          id: ruleId,
          order: ruleIndex,
          title: rule.title,
          description: rule.description,
          sectionId: dbSection.id,
        },
        update: {
          order: ruleIndex,
          title: rule.title,
          description: rule.description,
          sectionId: dbSection.id,
        },
      });
      ruleCount += 1;
    }
  }

  console.log(`Seeded ${sectionCount} rule sections with ${ruleCount} rules.`);
}

async function seedFeatures(blockId: string) {
  for (const feature of FEATURES) {
    await prisma.feature.upsert({
      where: { id: `feature-${feature.icon}` },
      create: { id: `feature-${feature.icon}`, ...feature, blockId },
      update: feature,
    });
  }
  console.log(`Seeded ${FEATURES.length} features.`);
}

async function seedPosts(blockId: string) {
  // Tags upsert-by-name first, same as every other content-seeding function
  // here -- re-running never duplicates a tag or clobbers a color an admin
  // has since changed from /admin/tags (the `update: {}` is a no-op on an
  // existing row).
  const tagNames = [...new Set(newsPosts.map((post) => post.tag))];
  const tagsByName = new Map<string, string>();
  for (const name of tagNames) {
    const tag = await prisma.tag.upsert({
      where: { name },
      create: { name, color: DEFAULT_TAG_COLOR },
      update: {},
    });
    tagsByName.set(name, tag.id);
  }

  for (const post of newsPosts) {
    const tagId = tagsByName.get(post.tag)!;
    await prisma.post.upsert({
      where: { slug: post.slug },
      create: {
        slug: post.slug,
        title: post.title,
        excerpt: post.excerpt,
        publishedAt: new Date(post.date),
        blockId,
        tags: { connect: { id: tagId } },
      },
      update: {
        title: post.title,
        excerpt: post.excerpt,
        publishedAt: new Date(post.date),
        // `set` (not `connect`) so re-running the seed after an admin
        // manually added extra tags to a placeholder post doesn't silently
        // leave them there forever -- matches this function's existing
        // "reset to placeholder values" contract for every other field.
        tags: { set: [{ id: tagId }] },
      },
    });
  }
  console.log(`Seeded ${tagNames.length} tags and ${newsPosts.length} posts.`);
}

// Exact copy lifted from the current hardcoded components
// ("don't invent new copy") -- components/home/quick-links.tsx and
// components/home/getting-started.tsx respectively.
const HOME_LINKS = [
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

// Home's "Getting started" content used to be its own `steps` block type;
// that type was folded into Rule List (which already does everything Steps
// did -- numbered items with a section heading), so this is now a single
// RuleSection with 3 Rules, seeded into a `ruleList` block just like the
// Rules page's sections are below.
const HOME_GETTING_STARTED_SECTION: RuleSection = {
  id: "home-getting-started",
  title: "Getting started",
  description: "",
  rules: [
    {
      title: "Copy the server address",
      description: `Grab ${siteConfig.ip} from the box above.`,
    },
    {
      title: "Open Minecraft: Java Edition",
      description: "Head to Multiplayer, then Add Server.",
    },
    {
      title: "Paste the address and join",
      description: "You'll land in spawn — no whitelist, no waiting.",
    },
  ],
};

const RULES_INTRO =
  "Short version: don't ruin the game for anyone else. These rules keep the world fair for everyone building, exploring, and fighting on the server. They apply in-game and on Discord.";

const RULES_CALLOUT_BODY =
  "Read carefully. Not knowing a rule doesn't excuse breaking it. Punishments for cheating or griefing are usually immediate and permanent — there's no warning shot for those.";

const RULES_CLOSING_MARKDOWN =
  "Staff decisions are final at the time they're made. If you think a punishment was a mistake, open a ticket in **#appeals** on our Discord and a staff member will review it.";

const FEATURES_INTRO = `${siteConfig.name} runs on Tweaks, our custom plugin — a set of enchantments, claim protections, and minigames layered on top of vanilla Paper so the world holds up under a real community, not just one player.`;

const NEWS_INTRO = `What's new on ${siteConfig.name} — plugin updates, world changes, maintenance windows, and events, newest first.`;

/**
 * Creates the 4 protected Page rows (home/rules/features/news) with their
 * Blocks, plus default top-level NavItems matching the current
 * siteConfig.nav. Guarded to skip entirely if any Page row already exists,
 * so re-running this never clobbers an admin's custom pages, reordering, or
 * nav edits made after the initial backfill.
 */
async function seedPagesAndNav() {
  const existingPageCount = await prisma.page.count();
  if (existingPageCount > 0) {
    console.log("Pages already exist — skipping seedPagesAndNav().");
    return;
  }

  const homePage = await prisma.page.create({
    data: {
      slug: "home",
      title: "Home",
      published: true,
      protected: true,
      blocks: {
        create: [
          { order: 0, type: "hero", data: "{}" },
          { order: 1, type: "linkGrid", data: JSON.stringify({ links: HOME_LINKS }) },
          { order: 2, type: "ruleList", data: "{}" },
        ],
      },
    },
  });

  const rulesPage = await prisma.page.create({
    data: {
      slug: "rules",
      title: "Rules",
      published: true,
      protected: true,
      blocks: {
        create: [
          {
            order: 0,
            type: "pageHeader",
            data: JSON.stringify({
              eyebrow: "Server Rules",
              heading: `Playing on ${siteConfig.name}`,
              description: RULES_INTRO,
            }),
          },
          { order: 1, type: "callout", data: JSON.stringify({ variant: "warning", body: RULES_CALLOUT_BODY }) },
          { order: 2, type: "ruleList", data: "{}" },
          { order: 3, type: "richText", data: JSON.stringify({ markdown: RULES_CLOSING_MARKDOWN }) },
        ],
      },
    },
  });

  const featuresPage = await prisma.page.create({
    data: {
      slug: "features",
      title: "Features",
      published: true,
      protected: true,
      blocks: {
        create: [
          {
            order: 0,
            type: "pageHeader",
            data: JSON.stringify({
              eyebrow: "What's different here",
              heading: "Built for people who actually play survival",
              description: FEATURES_INTRO,
            }),
          },
          { order: 1, type: "featureGrid", data: "{}" },
        ],
      },
    },
  });

  const newsPage = await prisma.page.create({
    data: {
      slug: "news",
      title: "News",
      published: true,
      protected: true,
      blocks: {
        create: [
          {
            order: 0,
            type: "pageHeader",
            data: JSON.stringify({
              eyebrow: "Dispatch log",
              heading: "News & Announcements",
              description: NEWS_INTRO,
            }),
          },
          { order: 1, type: "postList", data: "{}" },
        ],
      },
    },
  });

  const navEntries = [
    { label: "Home", pageId: homePage.id, order: 0 },
    { label: "Rules", pageId: rulesPage.id, order: 1 },
    { label: "Features", pageId: featuresPage.id, order: 2 },
    { label: "News", pageId: newsPage.id, order: 3 },
    // Static route (app/resource/page.tsx), not a builder Page row, hence
    // `href` instead of `pageId` -- see navItemHref() in lib/routes.ts.
    { label: "Resource Pack", href: "/resource", order: 4 },
  ];
  for (const entry of navEntries) {
    await prisma.navItem.create({ data: entry });
  }

  console.log(`Seeded 4 protected pages with blocks, and ${navEntries.length} default top-level nav items.`);
}

/**
 * RuleSection/Feature/Post each require an owning
 * `blockId` now, so the content-seeding functions below need the real ids of
 * the ruleList/featureGrid/postList blocks on the rules/features/news pages
 * -- looked up fresh by (page slug, block type) rather than threaded through
 * return values, so this works identically whether seedPagesAndNav() just
 * created those pages or they already existed (it's guarded to skip on a
 * non-empty DB, but the blocks it *would have* created are already there).
 */
async function getCanonicalBlockIds() {
  const [homeRuleListBlock, ruleListBlock, featureGridBlock, postListBlock] = await Promise.all([
    prisma.block.findFirst({ where: { type: "ruleList", page: { slug: "home" } } }),
    prisma.block.findFirst({ where: { type: "ruleList", page: { slug: "rules" } } }),
    prisma.block.findFirst({ where: { type: "featureGrid", page: { slug: "features" } } }),
    prisma.block.findFirst({ where: { type: "postList", page: { slug: "news" } } }),
  ]);
  if (!homeRuleListBlock || !ruleListBlock || !featureGridBlock || !postListBlock) {
    throw new Error(
      "Expected a ruleList block on /home, a ruleList block on /rules, a featureGrid block on /features, " +
        "and a postList block on /news to exist before seeding rule sections/features/posts -- run without " +
        "--pages-only first, or check that those blocks weren't deleted from an existing page.",
    );
  }
  return {
    homeRuleListBlockId: homeRuleListBlock.id,
    ruleListBlockId: ruleListBlock.id,
    featureGridBlockId: featureGridBlock.id,
    postListBlockId: postListBlock.id,
  };
}

/**
 * Upserts the 4 metadata-only protected Page rows for routes that render
 * their own hand-built layout rather than PageRenderer/Block content --
 * title-only, no blocks. Each row exists solely so its browser-tab title is
 * editable from /admin/pages and so it's covered by the same
 * delete-protection every other protected row gets. Per-row upsert (not
 * gated on seedPagesAndNav()'s "any page exists" check) so this safely
 * backfills onto a database that already has pages in it.
 */
async function seedStaticRoutePages() {
  const rows = [
    { slug: "resource", title: "Resource" },
    { slug: "login", title: "Login" },
    { slug: "account", title: "Account" },
    { slug: "admin", title: "Admin" },
  ];
  for (const row of rows) {
    await prisma.page.upsert({
      where: { slug: row.slug },
      create: { slug: row.slug, title: row.title, published: true, protected: true },
      update: {},
    });
  }
  console.log(`Seeded ${rows.length} static-route page rows.`);
}

async function main() {
  // `--pages-only` skips the content-overwriting seed functions below (which
  // unconditionally reset ContentBlock/Rule/Feature/Post to placeholder
  // values on every run) and only runs the guarded, safe-to-rerun
  // seedPagesAndNav(). Use this against a DB with live admin edits.
  const pagesOnly = process.argv.includes("--pages-only");

  // Pages/blocks must exist first -- the content seed functions below now
  // need real blockIds to seed against.
  await seedPagesAndNav();

  // Pure page-metadata, same bar --pages-only exists to satisfy -- runs
  // unconditionally regardless of --pages-only.
  await seedStaticRoutePages();

  if (!pagesOnly) {
    const { homeRuleListBlockId, ruleListBlockId, featureGridBlockId, postListBlockId } = await getCanonicalBlockIds();
    await seedContentBlocks();
    await seedRuleSections(homeRuleListBlockId, [HOME_GETTING_STARTED_SECTION]);
    await seedRuleSections(ruleListBlockId, ruleSections);
    await seedFeatures(featureGridBlockId);
    await seedPosts(postListBlockId);
  }
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
