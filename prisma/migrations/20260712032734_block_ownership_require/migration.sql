/*
  Warnings:

  - Made the column `blockId` on table `Feature` required. This step will fail if there are existing NULL values in that column.
  - Made the column `blockId` on table `Post` required. This step will fail if there are existing NULL values in that column.
  - Made the column `blockId` on table `RuleSection` required. This step will fail if there are existing NULL values in that column.

*/
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
    "blockId" TEXT NOT NULL,
    CONSTRAINT "Feature_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Feature" ("accent", "blockId", "description", "eyebrow", "icon", "id", "order", "title") SELECT "accent", "blockId", "description", "eyebrow", "icon", "id", "order", "title" FROM "Feature";
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
    "blockId" TEXT NOT NULL,
    CONSTRAINT "Post_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("author", "blockId", "body", "excerpt", "id", "publishedAt", "slug", "tag", "title") SELECT "author", "blockId", "body", "excerpt", "id", "publishedAt", "slug", "tag", "title" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
CREATE TABLE "new_RuleSection" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "order" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "blockId" TEXT NOT NULL,
    CONSTRAINT "RuleSection_blockId_fkey" FOREIGN KEY ("blockId") REFERENCES "Block" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_RuleSection" ("blockId", "description", "id", "order", "title") SELECT "blockId", "description", "id", "order", "title" FROM "RuleSection";
DROP TABLE "RuleSection";
ALTER TABLE "new_RuleSection" RENAME TO "RuleSection";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
