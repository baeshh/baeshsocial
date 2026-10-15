-- Manual rollback for 20261021000000_project_file_uploads. Not run by `prisma migrate`.
-- 1. Deploy the previous application release first.
-- 2. Back up: pg_dump -Fc -t '"ProjectFile"'
-- 3. Run this file in one transaction, then delete the migration row (last statement).
-- Stored objects stay in storage under projects/<projectId>/; the kept-aside rows below list their keys.

BEGIN;

-- Uploaded files have no URL and cannot satisfy NOT NULL again; keep them aside before removing them.
CREATE TABLE IF NOT EXISTS "_rollback_project_file_uploads" AS
  SELECT * FROM "ProjectFile" WHERE "url" IS NULL;
DELETE FROM "ProjectFile" WHERE "url" IS NULL;
ALTER TABLE "ProjectFile" ALTER COLUMN "url" SET NOT NULL;

DROP INDEX "ProjectFile_storageKey_key";
ALTER TABLE "ProjectFile" DROP COLUMN "mimeType",
DROP COLUMN "scanStatus",
DROP COLUMN "sha256",
DROP COLUMN "sizeBytes",
DROP COLUMN "storageKey";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261021000000_project_file_uploads';

COMMIT;
