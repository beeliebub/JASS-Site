ALTER TABLE "ResourcePack" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "ResourcePack_uuid_key";
