-- CreateEnum
CREATE TYPE "AIUsageStatus" AS ENUM ('SUCCESS', 'INVALID_OUTPUT', 'PROVIDER_ERROR', 'TIMEOUT', 'RATE_LIMITED', 'BUDGET_EXCEEDED');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MatchFeedback" AS ENUM ('SHORTLISTED', 'CONTACTED', 'NOT_A_FIT');

-- CreateEnum
CREATE TYPE "VerifiedRecordEventAction" AS ENUM ('ISSUED', 'REVOKED', 'REISSUED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AIAnalysisType" ADD VALUE 'REPORT_NARRATIVE';
ALTER TYPE "AIAnalysisType" ADD VALUE 'TALENT_MATCH_EXPLANATION';

-- AlterEnum
ALTER TYPE "EvidenceReviewAction" ADD VALUE 'REVOKED';

-- AlterEnum
ALTER TYPE "VerifiedRecordStatus" ADD VALUE 'REVOKED';

-- AlterTable
ALTER TABLE "AIAnalysis" ADD COLUMN     "costUsd" DECIMAL(12,6),
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "latencyMs" INTEGER,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "promptVersion" TEXT,
ADD COLUMN     "validation" JSONB;

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "talentSearchOptIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "talentSearchOptInAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "kpiTargets" JSONB;

-- AlterTable
ALTER TABLE "VerifiedRecord" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "organizationId" TEXT,
ADD COLUMN     "programId" TEXT,
ADD COLUMN     "revokeReason" TEXT,
ADD COLUMN     "revokedAt" TIMESTAMP(3),
ADD COLUMN     "revokedById" TEXT,
ADD COLUMN     "snapshot" JSONB,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ADD COLUMN     "verifiedById" TEXT;

-- CreateTable
CREATE TABLE "VerifiedRecordEvent" (
    "id" TEXT NOT NULL,
    "recordId" TEXT NOT NULL,
    "action" "VerifiedRecordEventAction" NOT NULL,
    "actorId" TEXT,
    "reason" TEXT,
    "contentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerifiedRecordEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "organizationId" TEXT,
    "feature" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" "AIUsageStatus" NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(12,6) NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "validationIssues" INTEGER NOT NULL DEFAULT 0,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "analysisId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReportTemplate" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "sections" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReportTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedReport" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "templateId" TEXT,
    "templateVersion" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "programIds" TEXT[],
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "dataSnapshot" JSONB,
    "narrative" JSONB,
    "narrativeSource" TEXT,
    "aiAnalysisId" TEXT,
    "storageKey" TEXT,
    "sha256" TEXT,
    "sizeBytes" INTEGER,
    "error" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GeneratedReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TalentSearch" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "createdById" TEXT,
    "title" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "scoringVersion" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TalentSearch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchResult" (
    "id" TEXT NOT NULL,
    "searchId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "breakdown" JSONB NOT NULL,
    "evidence" JSONB NOT NULL,
    "explanation" TEXT,
    "explanationSource" TEXT,
    "explanationModel" TEXT,
    "scoringVersion" TEXT NOT NULL,
    "feedback" "MatchFeedback",
    "feedbackAt" TIMESTAMP(3),
    "feedbackById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MatchResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VerifiedRecordEvent_recordId_createdAt_idx" ON "VerifiedRecordEvent"("recordId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_createdAt_idx" ON "AIUsageLog"("createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_userId_createdAt_idx" ON "AIUsageLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AIUsageLog_feature_createdAt_idx" ON "AIUsageLog"("feature", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReportTemplate_organizationId_key_version_key" ON "ReportTemplate"("organizationId", "key", "version");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedReport_storageKey_key" ON "GeneratedReport"("storageKey");

-- CreateIndex
CREATE INDEX "GeneratedReport_organizationId_createdAt_idx" ON "GeneratedReport"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "TalentSearch_organizationId_createdAt_idx" ON "TalentSearch"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "MatchResult_candidateId_idx" ON "MatchResult"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchResult_searchId_candidateId_key" ON "MatchResult"("searchId", "candidateId");

-- CreateIndex
CREATE INDEX "AIAnalysis_userId_type_createdAt_idx" ON "AIAnalysis"("userId", "type", "createdAt");

-- CreateIndex
CREATE INDEX "VerifiedRecord_userId_status_idx" ON "VerifiedRecord"("userId", "status");

-- CreateIndex
CREATE INDEX "VerifiedRecord_organizationId_status_idx" ON "VerifiedRecord"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecordEvent" ADD CONSTRAINT "VerifiedRecordEvent_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "VerifiedRecord"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecordEvent" ADD CONSTRAINT "VerifiedRecordEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageLog" ADD CONSTRAINT "AIUsageLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReportTemplate" ADD CONSTRAINT "ReportTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "ReportTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedReport" ADD CONSTRAINT "GeneratedReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentSearch" ADD CONSTRAINT "TalentSearch_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TalentSearch" ADD CONSTRAINT "TalentSearch_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "TalentSearch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchResult" ADD CONSTRAINT "MatchResult_feedbackById_fkey" FOREIGN KEY ("feedbackById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Backfill verifier details for records issued before this migration.
UPDATE "VerifiedRecord" vr
SET "organizationId" = pg."organizationId",
    "programId" = p."programId",
    "verifiedById" = e."reviewedById",
    "verifiedAt" = COALESCE(e."reviewedAt", vr."issuedAt")
FROM "ProjectEvidence" e
JOIN "Project" p ON p."id" = e."projectId"
LEFT JOIN "Program" pg ON pg."id" = p."programId"
WHERE vr."evidenceId" = e."id" AND vr."verifiedAt" IS NULL;
