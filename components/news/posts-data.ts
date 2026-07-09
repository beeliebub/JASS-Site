export type NewsPost = {
  slug: string;
  /** ISO-ish date string, newest first. Kept as a literal (not `Date`) so the
   *  list order and rendered string can't drift apart. */
  date: string;
  tag: string;
  title: string;
  excerpt: string;
};

// Reverse-chronological — newest post first. Add new posts to the top.
export const newsPosts: NewsPost[] = [
  {
    slug: "telekinesis-enchant-live",
    date: "2026-07-06",
    tag: "Update",
    title: "New custom enchant: Telekinesis is live",
    excerpt:
      "Mined blocks now drop straight into your inventory instead of the void, the lava lake, or the bottom of a ravine. Telekinesis is enchantable at the usual enchanting table and stacks with Tunneller for the fastest strip-mining loadout on the server.",
  },
  {
    slug: "ashfall-reaches-open",
    date: "2026-06-28",
    tag: "World",
    title: "The Ashfall Reaches are open for claims",
    excerpt:
      "A new region has opened 4,000 blocks east of spawn — badlands, ash groves, and a buried stronghold nobody's cracked yet. Claim blocks work as normal out there; expect a nether highway extension to follow once the first outposts go up.",
  },
  {
    slug: "scheduled-maintenance-june",
    date: "2026-06-19",
    tag: "Maintenance",
    title: "Scheduled maintenance — Saturday 10 PM to midnight",
    excerpt:
      "The server will be offline this Saturday from 10 PM to roughly midnight server time for a hardware move and a Tweaks plugin update. Claims, balances, and enchants are unaffected — just log off cleanly beforehand so nothing gets stuck mid-save.",
  },
  {
    slug: "rules-update-claims-tnt",
    date: "2026-06-10",
    tag: "Rules",
    title: "Rules updated: claim griefing & TNT policy clarified",
    excerpt:
      "We've tightened the wording around claim-edge griefing (lava casting, water-bucket flooding across borders) and clarified that TNT use requires the claim owner's permission, full stop. See the Rules page for the exact language.",
  },
  {
    slug: "skyline-challenge-announced",
    date: "2026-05-29",
    tag: "Event",
    title: "Build contest: The Skyline Challenge",
    excerpt:
      "Tallest freestanding build within a 32x32 footprint, judged the last weekend of the month. Winner gets a permanent plot on Founder's Row plus first pick of the next custom enchant name. Sign-ups are open in #build-contest.",
  },
  {
    slug: "efficacy-stacking-hotfix",
    date: "2026-05-14",
    tag: "Patch Notes",
    title: "Hotfix: Efficacy no longer stacks past its cap",
    excerpt:
      "A bug let Efficacy combine with unrelated haste sources to break its intended speed ceiling on tools. That's fixed — existing enchanted tools keep their level, they just respect the cap again. No items were removed.",
  },
];
