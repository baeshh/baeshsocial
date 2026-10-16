-- Selection becomes an offer the applicant confirms or declines; waitlisted applicants fill freed seats.
ALTER TYPE "ProgramApplicationStatus" ADD VALUE IF NOT EXISTS 'WAITLISTED';
ALTER TYPE "ProgramApplicationStatus" ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE "ProgramApplicationStatus" ADD VALUE IF NOT EXISTS 'DECLINED';

ALTER TABLE "ProgramApplication"
  ADD COLUMN "waitlistedAt" TIMESTAMP(3),
  ADD COLUMN "offerExpiresAt" TIMESTAMP(3),
  ADD COLUMN "respondedAt" TIMESTAMP(3);

CREATE INDEX "ProgramApplication_status_offerExpiresAt_idx" ON "ProgramApplication"("status", "offerExpiresAt");
