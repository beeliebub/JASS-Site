-- CreateTable
CREATE TABLE "BlockDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "layout" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "createdBy" TEXT
);

-- CreateTable
CREATE TABLE "BlockFieldDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "blockDefinitionId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "fieldType" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "helpText" TEXT,
    "config" TEXT NOT NULL,
    CONSTRAINT "BlockFieldDefinition_blockDefinitionId_fkey" FOREIGN KEY ("blockDefinitionId") REFERENCES "BlockDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Block" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pageId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "data" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    "updatedBy" TEXT,
    "blockDefinitionId" TEXT,
    CONSTRAINT "Block_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Block_blockDefinitionId_fkey" FOREIGN KEY ("blockDefinitionId") REFERENCES "BlockDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Block" ("data", "id", "order", "pageId", "type", "updatedAt", "updatedBy") SELECT "data", "id", "order", "pageId", "type", "updatedAt", "updatedBy" FROM "Block";
DROP TABLE "Block";
ALTER TABLE "new_Block" RENAME TO "Block";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "BlockDefinition_key_key" ON "BlockDefinition"("key");
