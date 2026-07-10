-- CreateTable
CREATE TABLE "CustomTheme" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "background" TEXT NOT NULL,
    "surface" TEXT NOT NULL,
    "surface2" TEXT NOT NULL,
    "border" TEXT NOT NULL,
    "borderStrong" TEXT NOT NULL,
    "foreground" TEXT NOT NULL,
    "muted" TEXT NOT NULL,
    "primary" TEXT NOT NULL,
    "primaryForeground" TEXT NOT NULL,
    "primaryHover" TEXT NOT NULL,
    "accent" TEXT NOT NULL,
    "accentForeground" TEXT NOT NULL,
    "danger" TEXT NOT NULL,
    "info" TEXT NOT NULL,
    "online" TEXT NOT NULL,
    "offline" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Page" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "metaDescription" TEXT,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "protected" BOOLEAN NOT NULL DEFAULT false,
    "theme" TEXT,
    "customThemeId" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "Page_customThemeId_fkey" FOREIGN KEY ("customThemeId") REFERENCES "CustomTheme" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Page" ("id", "metaDescription", "protected", "published", "slug", "theme", "title", "updatedAt", "updatedBy") SELECT "id", "metaDescription", "protected", "published", "slug", "theme", "title", "updatedAt", "updatedBy" FROM "Page";
DROP TABLE "Page";
ALTER TABLE "new_Page" RENAME TO "Page";
CREATE UNIQUE INDEX "Page_slug_key" ON "Page"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "CustomTheme_name_key" ON "CustomTheme"("name");
