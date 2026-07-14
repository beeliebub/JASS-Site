ALTER TABLE "BlockDefinition" ADD COLUMN "renderMode" TEXT NOT NULL DEFAULT 'fields';
ALTER TABLE "BlockDefinition" ADD COLUMN "htmlTemplate" TEXT;
ALTER TABLE "BlockDefinition" ADD COLUMN "remapThemeColors" BOOLEAN NOT NULL DEFAULT false;
