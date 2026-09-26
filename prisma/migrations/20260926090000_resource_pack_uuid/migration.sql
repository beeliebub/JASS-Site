ALTER TABLE "ResourcePack" ADD COLUMN "uuid" TEXT;

UPDATE "ResourcePack"
SET "uuid" = (
    lower(
        hex(randomblob(4)) || '-' ||
        hex(randomblob(2)) || '-4' ||
        substr(hex(randomblob(2)), 2) || '-' ||
        substr('89ab', 1 + (abs(random()) % 4), 1) ||
        substr(hex(randomblob(2)), 2) || '-' ||
        hex(randomblob(6))
    )
)
WHERE "uuid" IS NULL;

ALTER TABLE "ResourcePack" DROP COLUMN "active";
