-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PostToTag" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,
    CONSTRAINT "_PostToTag_A_fkey" FOREIGN KEY ("A") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "_PostToTag_B_fkey" FOREIGN KEY ("B") REFERENCES "Tag" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Backfill: one Tag row per distinct existing Post.tag value. Ids are
-- generated fresh at migration-run-time (never copied from this dev
-- database) so this produces valid, non-colliding ids on any database this
-- migration runs against. Default color approximates the obsidian theme's
-- --accent token (#e8a94a, see lib/themes.ts / app/globals.css) so existing
-- tags don't visually jump the moment this ships.
INSERT INTO "Tag" ("id", "name", "color")
SELECT lower(hex(randomblob(16))), "tag", '#e8a94a'
FROM (SELECT DISTINCT "tag" FROM "Post") AS "distinct_tags";

-- Backfill: attach every existing post to the Tag row matching its old
-- `tag` string. Keyed entirely on the name match (stable, schema-level),
-- never on a literal id -- correct regardless of what rows/ids happen to
-- already exist on the database this runs against.
INSERT INTO "_PostToTag" ("A", "B")
SELECT "Post"."id", "Tag"."id" FROM "Post" JOIN "Tag" ON "Tag"."name" = "Post"."tag";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "body" TEXT,
    "publishedAt" DATETIME NOT NULL,
    "author" TEXT,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "Post_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("author", "blockId", "body", "excerpt", "id", "publishedAt", "slug", "title") SELECT "author", "blockId", "body", "excerpt", "id", "publishedAt", "slug", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE UNIQUE INDEX "_PostToTag_AB_unique" ON "_PostToTag"("A", "B");

-- CreateIndex
CREATE INDEX "_PostToTag_B_index" ON "_PostToTag"("B");
