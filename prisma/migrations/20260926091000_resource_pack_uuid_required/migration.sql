PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_ResourcePack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "filename" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "sha1" TEXT NOT NULL,
    "uuid" TEXT NOT NULL,
    "uploadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "uploadedBy" TEXT
);

INSERT INTO "new_ResourcePack" ("filename", "id", "sha1", "size", "uploadedAt", "uploadedBy", "uuid")
SELECT "filename", "id", "sha1", "size", "uploadedAt", "uploadedBy", "uuid"
FROM "ResourcePack";

DROP TABLE "ResourcePack";
ALTER TABLE "new_ResourcePack" RENAME TO "ResourcePack";

CREATE UNIQUE INDEX "ResourcePack_sha1_key" ON "ResourcePack"("sha1");
CREATE UNIQUE INDEX "ResourcePack_uuid_key" ON "ResourcePack"("uuid");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
