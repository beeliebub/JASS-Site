export type Rule = {
  title: string;
  description: string;
};

export type RuleSection = {
  id: string;
  title: string;
  description: string;
  rules: Rule[];
};

export const ruleSections: RuleSection[] = [
  {
    id: "conduct",
    title: "Conduct",
    description: "How we expect people to treat each other, in-game and on Discord.",
    rules: [
      {
        title: "Be respectful",
        description:
          "No harassment, hate speech, or targeted insults in any chat channel, in-game or on Discord. Disagreements happen — keep them civil.",
      },
      {
        title: "Keep chat clean",
        description:
          "No spam, excessive caps, unsolicited pings, or flooding the chat. If people are asking you to stop, that's your cue to stop.",
      },
      {
        title: "No unsolicited advertising",
        description:
          "Don't promote other servers, Discords, or external links without staff permission. This includes DMing other players to advertise.",
      },
      {
        title: "Keep it appropriate",
        description:
          "Usernames, skins, and builds should be suitable for a general audience. Staff may ask you to change anything that isn't.",
      },
    ],
  },
  {
    id: "building-claims",
    title: "Building & Claims",
    description: "The claims and protection system exists so your work is safe — use it.",
    rules: [
      {
        title: "Claim what matters to you",
        description:
          "Use the Tweaks claim tools to protect your builds and storage. Anything left unclaimed in the wild is treated as fair game for other players.",
      },
      {
        title: "Respect claim boundaries",
        description:
          "Don't attempt to bypass, glitch, or dig around another player's protection to reach blocks or chests inside it. Ask the owner first.",
      },
      {
        title: "No griefing or stealing in unclaimed areas",
        description:
          "Fair game doesn't mean free-for-all destruction. Don't tear down or loot builds that are clearly in progress just because they aren't claimed yet.",
      },
      {
        title: "Report protection bugs, don't abuse them",
        description:
          "Found a way around someone's claim? Tell staff. Using a protection exploit to access another player's base is treated the same as griefing.",
      },
    ],
  },
  {
    id: "fair-play",
    title: "Fair Play",
    description: "Everyone is playing on the same version of the world — keep it that way.",
    rules: [
      {
        title: "No cheat clients or X-ray",
        description:
          "Hacked clients, X-ray texture packs, autoclickers, and any other client-side advantage are bannable on first offense, no warning.",
      },
      {
        title: "No exploiting bugs or dupes",
        description:
          "If you find a duplication glitch or a way to break the economy or custom enchants, report it privately to staff instead of using or sharing it.",
      },
      {
        title: "PvP requires consent",
        description:
          "Outside designated combat areas, don't attack players who haven't opted into PvP. A simple check in chat before swinging goes a long way.",
      },
      {
        title: "Staff decisions are final",
        description:
          "If you disagree with a punishment or ruling, don't argue it out in public chat — open a ticket in #appeals on Discord and we'll review it.",
      },
    ],
  },
];
