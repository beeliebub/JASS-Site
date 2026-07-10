-- CreateTable
CREATE TABLE "ResourcePack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT
);

-- CreateIndex
CREATE UNIQUE INDEX "ResourcePack_sha1_key" ON "ResourcePack"("sha1");
