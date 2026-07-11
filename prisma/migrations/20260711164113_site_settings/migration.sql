-- CreateTable
CREATE TABLE "SiteSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "faviconImageId" TEXT,
    "embedImageId" TEXT,
    "embedTitle" TEXT,
    "embedDescription" TEXT,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "SiteSettings_faviconImageId_fkey" FOREIGN KEY ("faviconImageId") REFERENCES "UploadedImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SiteSettings_embedImageId_fkey" FOREIGN KEY ("embedImageId") REFERENCES "UploadedImage" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
