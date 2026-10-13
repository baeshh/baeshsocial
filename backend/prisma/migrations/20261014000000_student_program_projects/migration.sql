-- Student-led program projects: program policy, registration requests, staff reviews,
-- project outcome verification and per-record disclosure. Expand-only.

-- CreateEnum
CREATE TYPE "ProgramProjectRegistrationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'WITHDRAWN', 'REMOVED');
CREATE TYPE "ProgramProjectRegistrationSource" AS ENUM ('NEW_PROJECT', 'EXISTING_PROJECT');
CREATE TYPE "ProjectReviewKind" AS ENUM ('FEEDBACK', 'REVISION_REQUEST', 'RESPONSE', 'REMOVAL_REQUEST');
CREATE TYPE "ProjectReviewStatus" AS ENUM ('OPEN', 'RESOLVED');
CREATE TYPE "ProjectVerificationStatus" AS ENUM ('VERIFIED', 'REVOKED');
CREATE TYPE "VerifiedRecordKind" AS ENUM ('EVIDENCE', 'CONTRIBUTION');
CREATE TYPE "RecordDisclosure" AS ENUM ('HIDDEN', 'SUMMARY', 'FULL');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN "allowMultipleProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowPublicProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowStudentProjects" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "allowStudentTeams" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "recordDisclosure" "RecordDisclosure" NOT NULL DEFAULT 'SUMMARY',
ADD COLUMN "requireProjectApproval" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "ProjectMember" ADD COLUMN "privateAccess" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "VerifiedRecord" ADD COLUMN "disclosure" "RecordDisclosure" NOT NULL DEFAULT 'SUMMARY',
ADD COLUMN "kind" "VerifiedRecordKind" NOT NULL DEFAULT 'EVIDENCE',
ADD COLUMN "projectVerificationId" TEXT;

-- Existing members keep seeing PRIVATE projects they already had access to.
UPDATE "ProjectMember" SET "privateAccess" = true;

-- CreateTable
CREATE TABLE "ProgramProjectRegistration" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requesterId" TEXT,
    "source" "ProgramProjectRegistrationSource" NOT NULL,
    "status" "ProgramProjectRegistrationStatus" NOT NULL DEFAULT 'PENDING',
    "message" TEXT,
    "reviewNote" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramProjectRegistration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectReview" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "authorId" TEXT,
    "kind" "ProjectReviewKind" NOT NULL,
    "status" "ProjectReviewStatus",
    "body" TEXT NOT NULL,
    "targetUserId" TEXT,
    "parentId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProjectVerification" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "ProjectVerificationStatus" NOT NULL DEFAULT 'VERIFIED',
    "outcomeSummary" TEXT NOT NULL,
    "verifiedById" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,
    "revokeReason" TEXT,
    "snapshot" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVerification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramProjectRegistration_programId_status_createdAt_idx" ON "ProgramProjectRegistration"("programId", "status", "createdAt");
CREATE INDEX "ProgramProjectRegistration_projectId_createdAt_idx" ON "ProgramProjectRegistration"("projectId", "createdAt");
CREATE INDEX "ProjectReview_projectId_createdAt_idx" ON "ProjectReview"("projectId", "createdAt");
CREATE INDEX "ProjectReview_programId_kind_status_idx" ON "ProjectReview"("programId", "kind", "status");
CREATE INDEX "ProjectVerification_projectId_status_idx" ON "ProjectVerification"("projectId", "status");
CREATE INDEX "ProjectVerification_programId_status_idx" ON "ProjectVerification"("programId", "status");
CREATE UNIQUE INDEX "VerifiedRecord_projectVerificationId_userId_key" ON "VerifiedRecord"("projectVerificationId", "userId");

-- Not expressible in the Prisma schema: at most one open request and one live verification per project.
CREATE UNIQUE INDEX "ProgramProjectRegistration_one_pending_per_project" ON "ProgramProjectRegistration"("projectId") WHERE "status" = 'PENDING';
CREATE UNIQUE INDEX "ProjectVerification_one_verified_per_project" ON "ProjectVerification"("projectId") WHERE "status" = 'VERIFIED';

-- AddForeignKey
ALTER TABLE "VerifiedRecord" ADD CONSTRAINT "VerifiedRecord_projectVerificationId_fkey" FOREIGN KEY ("projectVerificationId") REFERENCES "ProjectVerification"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProgramProjectRegistration" ADD CONSTRAINT "ProgramProjectRegistration_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectReview" ADD CONSTRAINT "ProjectReview_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "ProjectReview"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_verifiedById_fkey" FOREIGN KEY ("verifiedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectVerification" ADD CONSTRAINT "ProjectVerification_revokedById_fkey" FOREIGN KEY ("revokedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
