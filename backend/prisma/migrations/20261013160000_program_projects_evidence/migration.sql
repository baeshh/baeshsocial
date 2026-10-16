
-- CreateEnum
CREATE TYPE "ProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'COMPLETED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "EvidenceCategory" AS ENUM ('DEVELOPMENT', 'MEETING', 'PRESENTATION', 'RESEARCH', 'FIELDWORK', 'REPORT', 'OTHER');

-- CreateEnum
CREATE TYPE "EvidenceFileKind" AS ENUM ('IMAGE', 'VIDEO', 'PDF');

-- CreateEnum
CREATE TYPE "EvidenceReviewAction" AS ENUM ('SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "createdById" TEXT,
ADD COLUMN     "status" "ProgramStatus" NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN     "term" TEXT;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "programId" TEXT,
ADD COLUMN     "startDate" TIMESTAMP(3),
ADD COLUMN     "teamName" TEXT;

-- AlterTable
ALTER TABLE "VerifiedRecord" ADD COLUMN     "evidenceId" TEXT;

-- CreateTable
CREATE TABLE "ProgramManager" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramManager_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramParticipant" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "studentNo" TEXT,
    "department" TEXT,
    "addedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectEvidence" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" "EvidenceCategory" NOT NULL DEFAULT 'OTHER',
    "activityDate" TIMESTAMP(3) NOT NULL,
    "status" "EvidenceStatus" NOT NULL DEFAULT 'DRAFT',
    "submittedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceFile" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "uploaderId" TEXT,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "kind" "EvidenceFileKind" NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EvidenceReview" (
    "id" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "EvidenceReviewAction" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EvidenceReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramManager_userId_idx" ON "ProgramManager"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramManager_programId_userId_key" ON "ProgramManager"("programId", "userId");

-- CreateIndex
CREATE INDEX "ProgramParticipant_userId_idx" ON "ProgramParticipant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramParticipant_programId_userId_key" ON "ProgramParticipant"("programId", "userId");

-- CreateIndex
CREATE INDEX "ProjectEvidence_projectId_status_idx" ON "ProjectEvidence"("projectId", "status");

-- CreateIndex
CREATE INDEX "ProjectEvidence_authorId_idx" ON "ProjectEvidence"("authorId");

-- CreateIndex
CREATE UNIQUE INDEX "EvidenceFile_storageKey_key" ON "EvidenceFile"("storageKey");

-- CreateIndex
CREATE INDEX "EvidenceFile_evidenceId_idx" ON "EvidenceFile"("evidenceId");

-- CreateIndex
CREATE INDEX "EvidenceReview_evidenceId_createdAt_idx" ON "EvidenceReview"("evidenceId", "createdAt");

-- CreateIndex
CREATE INDEX "Program_organizationId_idx" ON "Program"("organizationId");

-- CreateIndex
CREATE INDEX "Project_programId_idx" ON "Project"("programId");

-- CreateIndex
CREATE UNIQUE INDEX "VerifiedRecord_evidenceId_key" ON "VerifiedRecord"("evidenceId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProjectEvidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Program" ADD CONSTRAINT "Program_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramManager" ADD CONSTRAINT "ProgramManager_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramManager" ADD CONSTRAINT "ProgramManager_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramParticipant" ADD CONSTRAINT "ProgramParticipant_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectEvidence" ADD CONSTRAINT "ProjectEvidence_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProjectEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceFile" ADD CONSTRAINT "EvidenceFile_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "ProjectEvidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EvidenceReview" ADD CONSTRAINT "EvidenceReview_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

