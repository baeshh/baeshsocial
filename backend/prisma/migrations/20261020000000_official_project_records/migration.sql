-- CreateEnum
CREATE TYPE "ProgramProjectRecordStatus" AS ENUM ('ACTIVE', 'FINAL');

-- CreateEnum
CREATE TYPE "ProgramProjectRecordEventAction" AS ENUM ('CAPTURED', 'UPDATED', 'FINALIZED', 'REOPENED', 'CORRECTED', 'REDACTED');

-- CreateEnum
CREATE TYPE "RetentionBasis" AS ENUM ('LAW', 'CONTRACT', 'SERVICE_POLICY');

-- DropForeignKey
ALTER TABLE "VerifiedRecord" DROP CONSTRAINT "VerifiedRecord_projectId_fkey";

-- DropForeignKey
ALTER TABLE "Program" DROP CONSTRAINT "Program_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramProjectRegistration" DROP CONSTRAINT "ProgramProjectRegistration_programId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramProjectRegistration" DROP CONSTRAINT "ProgramProjectRegistration_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectReview" DROP CONSTRAINT "ProjectReview_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectReview" DROP CONSTRAINT "ProjectReview_programId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_projectId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_programId_fkey";

-- DropForeignKey
ALTER TABLE "ProjectVerification" DROP CONSTRAINT "ProjectVerification_organizationId_fkey";

-- DropForeignKey
ALTER TABLE "ProgramParticipant" DROP CONSTRAINT "ProgramParticipant_programId_fkey";

-- DropForeignKey
ALTER TABLE "EvidenceReview" DROP CONSTRAINT "EvidenceReview_evidenceId_fkey";

-- AlterTable
ALTER TABLE "ProgramProjectRegistration" ALTER COLUMN "projectId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "ProgramProjectRecord" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "programId" TEXT,
    "projectId" TEXT,
    "organizationName" TEXT NOT NULL,
    "programTitle" TEXT NOT NULL,
    "programTerm" TEXT,
    "projectTitle" TEXT NOT NULL,
    "status" "ProgramProjectRecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMP(3),
    "retainUntil" TIMESTAMP(3),
    "retentionPolicyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramProjectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramProjectRecordEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "action" "ProgramProjectRecordEventAction" NOT NULL,
    "trigger" TEXT NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "previousHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramProjectRecordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordRetentionPolicy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "basis" "RetentionBasis" NOT NULL,
    "reference" TEXT NOT NULL,
    "retentionMonths" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),

    CONSTRAINT "RecordRetentionPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramProjectRecord_organizationId_status_idx" ON "ProgramProjectRecord"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ProgramProjectRecord_projectId_idx" ON "ProgramProjectRecord"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramProjectRecord_programId_projectId_key" ON "ProgramProjectRecord"("programId", "projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramProjectRecordEvent_recordId_version_key" ON "ProgramProjectRecordEvent"("recordId", "version");

-- CreateIndex
CREATE INDEX "RecordRetentionPolicy_organizationId_retiredAt_idx" ON "RecordRetentionPolicy"("organizationId", "retiredAt");

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProjectEvidence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecord" ADD CONSTRAINT "ProgramProjectRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecord" ADD CONSTRAINT "ProgramProjectRecord_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecord" ADD CONSTRAINT "ProgramProjectRecord_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecord" ADD CONSTRAINT "ProgramProjectRecord_retentionPolicyId_fkey" FOREIGN KEY ("retentionPolicyId") REFERENCES "RecordRetentionPolicy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecordEvent" ADD CONSTRAINT "ProgramProjectRecordEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "ProgramProjectRecord"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramProjectRecordEvent" ADD CONSTRAINT "ProgramProjectRecordEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRetentionPolicy" ADD CONSTRAINT "RecordRetentionPolicy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordRetentionPolicy" ADD CONSTRAINT "RecordRetentionPolicy_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
