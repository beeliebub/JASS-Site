-- Data migration: the `cardGrid` block type is retired -- its block-level
-- `heading`/`tone` fields are absorbed onto Feature Grid (see
-- featureGridDataSchema in lib/validation/pages.ts) and its per-card content
-- becomes owned `Feature` rows, the same ownership model ruleList/postList
-- already use. No schema change is needed -- Block.type is a plain TEXT
-- column, not an enum, and Feature already exists -- so this is a pure data
-- backfill, keyed entirely on each Block's own id.
--
-- Unlike the steps -> ruleList migration in this same pass, there's no
-- stable-id collision to guard against here: prisma/seed.ts has never
-- seeded a `cardGrid` block or referenced any of its rows by a fixed id, so
-- every migrated Feature row can safely get a fresh random id, same as an
-- admin manually adding a feature through the UI already does.

-- One Feature row per Card Grid `cards` array entry, owned by the same
-- Block (Block.id itself never changes -- only its `type`/`data`, via the
-- UPDATE below -- so Feature.blockId can reference it immediately).
-- `eyebrow` is '' since Card Grid cards never had one (this migration ships
-- alongside making Feature.eyebrow optional -- see
-- lib/validation/content.ts); `icon` falls back to 'help', matching
-- CardGridBlock's own rendering fallback for a card whose icon was never
-- set; `accent` defaults to false, since Card Grid had no per-card
-- equivalent of that field.
INSERT INTO "Feature" ("id", "order", "eyebrow", "title", "description", "icon", "accent", "blockId")
SELECT
  lower(hex(randomblob(16))),
  "je"."key",
  '',
  json_extract("je"."value", '$.title'),
  json_extract("je"."value", '$.description'),
  COALESCE(json_extract("je"."value", '$.icon'), 'help'),
  0,
  "b"."id"
FROM "Block" "b"
JOIN json_each("b"."data", '$.cards') "je"
WHERE "b"."type" = 'cardGrid';

-- Flip the block itself over to `featureGrid`, keeping only the
-- block-level `heading`/`tone` pair -- must run last, since the insert
-- above still keys off type = 'cardGrid'.
UPDATE "Block"
SET
  "type" = 'featureGrid',
  "data" = json_object('heading', json_extract("data", '$.heading'), 'tone', json_extract("data", '$.tone'))
WHERE "type" = 'cardGrid';
