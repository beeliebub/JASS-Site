-- Data migration: the `steps` block type is retired -- Rule List already
-- does everything Steps did (numbered items with an optional heading), so
-- Steps is folded into it rather than kept as a separate type. This
-- converts every existing `steps` Block into a `ruleList` Block, preserving
-- its content as a RuleSection (one per originating block) containing one
-- Rule per step item, in original order. No schema change is needed --
-- Block.type is a plain TEXT column, not an enum, and RuleSection/Rule
-- already exist -- so this is a pure data backfill.
--
-- The one steps block this project's own seed.ts has ever created (Home
-- page's "Getting started") gets the exact stable ids
-- (`home-getting-started`, `home-getting-started--0/1/2`) prisma/seed.ts's
-- updated seedRuleSections() now upserts by -- otherwise, re-running
-- `npm run db:seed` after this migration would create a *second*,
-- duplicate "Getting started" section next to the one this migration just
-- produced, since an upsert keyed on that stable id would never match a
-- freshly-random-generated one. Any *other* steps block (e.g. one an admin
-- added themselves via the page builder, unrelated to seeding) still gets a
-- fresh random id -- seed.ts has no stable id reserved for those, and never
-- will, so there's no future collision to guard against there.
INSERT INTO "RuleSection" ("id", "order", "title", "description", "blockId")
SELECT
  CASE WHEN "p"."slug" = 'home' THEN 'home-getting-started' ELSE lower(hex(randomblob(16))) END,
  0,
  COALESCE(json_extract("b"."data", '$.heading'), 'Getting started'),
  '',
  "b"."id"
FROM "Block" "b"
JOIN "Page" "p" ON "p"."id" = "b"."pageId"
WHERE "b"."type" = 'steps';

-- One Rule per step item, joined back to the RuleSection just inserted via
-- Block.id -> RuleSection.blockId -- unique per block since the insert
-- above creates exactly one section per originating `steps` Block. `je.key`
-- over a JSON array is its 0-based index, which doubles as each Rule's
-- `order` (steps' own `number` field is dropped -- Rule List always derives
-- its displayed numbering from position, never a stored custom string).
-- Same stable-id-on-Home-page-only rule as the RuleSection insert above, so
-- the seed script's `${section.id}--${ruleIndex}` upsert keys land on
-- exactly these rows rather than duplicating them.
INSERT INTO "Rule" ("id", "order", "title", "description", "sectionId")
SELECT
  CASE WHEN "p"."slug" = 'home' THEN 'home-getting-started--' || "je"."key" ELSE lower(hex(randomblob(16))) END,
  "je"."key",
  json_extract("je"."value", '$.title'),
  json_extract("je"."value", '$.description'),
  "rs"."id"
FROM "Block" "b"
JOIN "Page" "p" ON "p"."id" = "b"."pageId"
JOIN "RuleSection" "rs" ON "rs"."blockId" = "b"."id"
JOIN json_each("b"."data", '$.items') "je"
WHERE "b"."type" = 'steps';

-- Finally, flip the block itself over to `ruleList` with the standard empty
-- RuleListData -- must run last, since both inserts above still key off
-- type = 'steps'.
UPDATE "Block" SET "type" = 'ruleList', "data" = '{}' WHERE "type" = 'steps';
