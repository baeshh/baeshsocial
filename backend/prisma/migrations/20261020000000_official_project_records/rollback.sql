-- Manual rollback for 20261020000000_official_project_records. Not run by `prisma migrate`.
-- 1. Deploy the previous application release first.
-- 2. Back up: pg_dump -Fc -t '"ProgramProjectRecord"' -t '"ProgramProjectRecordEvent"' -t '"RecordRetentionPolicy"' -t '"ProgramProjectRegistration"'
-- 3. Run this file in one transaction, then delete the migration row (last statement).

BEGIN;

-- Review logs whose project was deleted cannot satisfy NOT NULL again; keep them aside before removing them.
CREATE TABLE IF NOT EXISTS "_rollback_orphan_registrations" AS
  SELECT * FROM "ProgramProjectRegistration" WHERE "projectId" IS NULL;
DELETE FROM "ProgramProjectRegistration" WHERE "projectId" IS NULL;
ALTER TABLE "ProgramProjectRegistration" ALTER COLUMN "projectId" SET NOT NULL;

DROP TABLE "ProgramProjectRecordEvent";
DROP TABLE "ProgramProjectRecord";
DROP TABLE "RecordRetentionPolicy";
DROP TYPE "ProgramProjectRecordEventAction";
DROP TYPE "ProgramProjectRecordStatus";
DROP TYPE "RetentionBasis";

ALTER TABLE "VerifiedRecord" DROP CONSTRAINT "VerifiedRecord_projectId_fkey";
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Program" DROP CONSTRAINT "Program_organizationId_fkey";
ALTER TABLE "Program" ADD CONSTRAINT "Program_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" DROP CONSTRAINT "ProgramProjectRegistration_programId_fkey";
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" DROP CONSTRAINT "ProgramProjectRegistration_projectId_fkey";
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" DROP CONSTRAINT "ProjectReview_projectId_fkey";
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" DROP CONSTRAINT "ProjectReview_programId_fkey";
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_projectId_fkey";
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_programId_fkey";
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_organizationId_fkey";
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramParticipant" DROP CONSTRAINT "ProgramParticipant_programId_fkey";
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EvidenceReview" DROP CONSTRAINT "EvidenceReview_evidenceId_fkey";
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProjectEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261020000000_official_project_records';

COMMIT;
