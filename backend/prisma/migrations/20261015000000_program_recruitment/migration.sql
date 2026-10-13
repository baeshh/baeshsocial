-- Program visibility, recruitment details and applications.
-- Existing programs keep PRIVATE + SELECTED, so they stay visible only to staff and participants.

CREATE TYPE "ProgramVisibility" AS ENUM ('PRIVATE', 'ORGANIZATION', 'PUBLIC');
CREATE TYPE "ProgramRecruitmentMode" AS ENUM ('SELECTED', 'RECRUITING');
CREATE TYPE "ProgramDeliveryMode" AS ENUM ('ONLINE', 'OFFLINE', 'HYBRID');
CREATE TYPE "ProgramApplicationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN');

ALTER TABLE "Program" ADD COLUMN "announceAt" TIMESTAMP(3),
ADD COLUMN "applyEndAt" TIMESTAMP(3),
ADD COLUMN "applyStartAt" TIMESTAMP(3),
ADD COLUMN "capacity" INTEGER,
ADD COLUMN "deliveryMode" "ProgramDeliveryMode",
ADD COLUMN "location" TEXT,
ADD COLUMN "recruitmentMode" "ProgramRecruitmentMode" NOT NULL DEFAULT 'SELECTED',
ADD COLUMN "selectionProcess" TEXT,
ADD COLUMN "targetAudience" TEXT,
ADD COLUMN "visibility" "ProgramVisibility" NOT NULL DEFAULT 'PRIVATE';

ALTER TABLE "Program" ADD CONSTRAINT "Program_capacity_positive" CHECK ("capacity" IS NULL OR "capacity" > 0);

CREATE INDEX "Program_visibility_status_idx" ON "Program"("visibility", "status");

CREATE TABLE "ProgramApplication" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "ProgramApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramApplication_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProgramApplication_programId_status_createdAt_idx" ON "ProgramApplication"("programId", "status", "createdAt");
CREATE INDEX "ProgramApplication_userId_idx" ON "ProgramApplication"("userId");
CREATE UNIQUE INDEX "ProgramApplication_programId_userId_key" ON "ProgramApplication"("programId", "userId");

ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplication" ADD CONSTRAINT "ProgramApplication_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
