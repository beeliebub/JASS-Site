-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CustomTheme" (
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
    "showInPicker" BOOLEAN NOT NULL DEFAULT false,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CustomTheme" ("accent", "accentForeground", "background", "border", "borderStrong", "createdAt", "createdBy", "danger", "foreground", "id", "info", "muted", "name", "offline", "online", "primary", "primaryForeground", "primaryHover", "surface", "surface2", "updatedAt") SELECT "accent", "accentForeground", "background", "border", "borderStrong", "createdAt", "createdBy", "danger", "foreground", "id", "info", "muted", "name", "offline", "online", "primary", "primaryForeground", "primaryHover", "surface", "surface2", "updatedAt" FROM "CustomTheme";
DROP TABLE "CustomTheme";
ALTER TABLE "new_CustomTheme" RENAME TO "CustomTheme";
CREATE UNIQUE INDEX "CustomTheme_name_key" ON "CustomTheme"("name");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
