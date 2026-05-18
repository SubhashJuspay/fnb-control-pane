-- Add a URL-safe slug to Table, unique per location. Backfill from `label`
-- using a Postgres regex transform; if any rows collide on the derived slug
-- they get a numeric suffix so the NOT NULL + unique constraint can land
-- cleanly afterwards.

ALTER TABLE "tables" ADD COLUMN "slug" TEXT;

UPDATE "tables"
SET "slug" = trim(
  BOTH '-' FROM regexp_replace(lower("label"), '[^a-z0-9]+', '-', 'g')
);

UPDATE "tables" SET "slug" = substring("id"::text from 1 for 8)
WHERE "slug" IS NULL OR "slug" = '';

WITH ranked AS (
  SELECT
    "id",
    "location_id",
    "slug",
    ROW_NUMBER() OVER (
      PARTITION BY "location_id", "slug"
      ORDER BY "created_at"
    ) AS rn
  FROM "tables"
)
UPDATE "tables" t
SET "slug" = t."slug" || '-' || (r.rn - 1)
FROM ranked r
WHERE t."id" = r."id" AND r.rn > 1;

ALTER TABLE "tables" ALTER COLUMN "slug" SET NOT NULL;

CREATE UNIQUE INDEX "tables_location_id_slug_key"
  ON "tables"("location_id", "slug");
