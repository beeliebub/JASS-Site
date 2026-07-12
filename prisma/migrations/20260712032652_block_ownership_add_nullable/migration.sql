-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Feature" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL,
    "eyebrow" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "icon" TEXT NOT NULL,
    "accent" BOOLEAN NOT NULL DEFAULT false,
    "blockId" TEXT,
    CONSTRAINT "Feature_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Feature" ("accent", "description", "eyebrow", "icon", "id", "order", "title") SELECT "accent", "description", "eyebrow", "icon", "id", "order", "title" FROM "Feature";
DROP TABLE "Feature";
ALTER TABLE "new_Feature" RENAME TO "Feature";
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "tag" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "author" TEXT,
    "blockId" TEXT,
    CONSTRAINT "Post_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("author", "body", "excerpt", "id", "publishedAt", "slug", "tag", "title") SELECT "author", "body", "excerpt", "id", "publishedAt", "slug", "tag", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE TABLE "new_RuleSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "blockId" TEXT,
    CONSTRAINT "RuleSection_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RuleSection" ("description", "id", "order", "title") SELECT "description", "id", "order", "title" FROM "RuleSection";
DROP TABLE "RuleSection";
ALTER TABLE "new_RuleSection" RENAME TO "RuleSection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Backfill (PLAN.md Phases 25-27): assign every pre-existing row to the one
-- ruleList/featureGrid/postList block that owned the site-wide view of this
-- content before per-block ownership existed -- the block on that content
-- type's canonical page (/rules, /features, /news respectively). Looked up
-- by (Page.slug, Block.type) via a subquery, NOT a hardcoded literal id --
-- a hardcoded id is specific to whichever database it was read from and
-- fails the FK constraint on every other database (this is the fix for
-- exactly that bug: an earlier version of this migration shipped with ids
-- copied from one dev database and broke `migrate deploy` elsewhere with a
-- "FOREIGN KEY constraint failed" / SQLite error 787).
UPDATE "RuleSection" SET "blockId" = (
  SELECT "Block"."id" FROM "Block" JOIN "Page" ON "Block"."pageId" = "Page"."id"
  WHERE "Block"."type" = 'ruleList' AND "Page"."slug" = 'rules'
  LIMIT 1
) WHERE "blockId" IS NULL;
UPDATE "Feature" SET "blockId" = (
  SELECT "Block"."id" FROM "Block" JOIN "Page" ON "Block"."pageId" = "Page"."id"
  WHERE "Block"."type" = 'featureGrid' AND "Page"."slug" = 'features'
  LIMIT 1
) WHERE "blockId" IS NULL;
UPDATE "Post" SET "blockId" = (
  SELECT "Block"."id" FROM "Block" JOIN "Page" ON "Block"."pageId" = "Page"."id"
  WHERE "Block"."type" = 'postList' AND "Page"."slug" = 'news'
  LIMIT 1
) WHERE "blockId" IS NULL;
