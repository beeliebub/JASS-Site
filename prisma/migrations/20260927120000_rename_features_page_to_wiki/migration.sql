-- Move the protected page to its canonical Wiki slug without replacing the
-- row, so its blocks, feature ownership, and page-linked nav items survive.
UPDATE "Page"
SET "slug" = 'wiki'
WHERE "slug" = 'features';

-- Repair the old default title only; preserve any title an admin already chose.
UPDATE "Page"
SET "title" = 'Wiki'
WHERE "slug" = 'wiki' AND "title" = 'Features';

-- Page-linked nav items keep their pageId, while the label follows the rename.
UPDATE "NavItem"
SET "label" = 'Wiki'
WHERE "pageId" = (SELECT "id" FROM "Page" WHERE "slug" = 'wiki')
  AND "label" = 'Features';

-- Also repair any manually-created nav item that used the old exact URL.
UPDATE "NavItem"
SET "href" = '/wiki'
WHERE "href" = '/features';

-- Update stored internal links in editable blocks, including the home hero and
-- link grid, without changing prose that merely mentions the old URL.
UPDATE "Block"
SET "data" = REPLACE("data", '"/features"', '"/wiki"')
WHERE instr("data", '"/features"') > 0;

-- A custom redirect targeting the old exact route should follow the canonical
-- route after the rename.
UPDATE "Page"
SET "redirectUrl" = '/wiki'
WHERE "redirectUrl" = '/features';
