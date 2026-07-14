-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "faviconImageId" TEXT,
    "embedImageId" TEXT,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "pageTitleSuffix" TEXT,
    "editingEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "SiteSettings_faviconImageId_fkey" FOREIGN KEY ("faviconImageId") REFERENCES "UploadedImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteSettings_embedImageId_fkey" FOREIGN KEY ("embedImageId") REFERENCES "UploadedImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SiteSettings" ("embedDescription", "embedImageId", "embedTitle", "faviconImageId", "id", "pageTitleSuffix", "updatedAt", "updatedBy") SELECT "embedDescription", "embedImageId", "embedTitle", "faviconImageId", "id", "pageTitleSuffix", "updatedAt", "updatedBy" FROM "SiteSettings";
DROP TABLE "SiteSettings";
ALTER TABLE "new_SiteSettings" RENAME TO "SiteSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
