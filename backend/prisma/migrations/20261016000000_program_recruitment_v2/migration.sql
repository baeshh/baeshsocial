-- Recruitment wizard: category, audiences, eligibility, benefits, publishing, share links and
-- per-program application forms with answers and private attachments.

-- CreateEnum
CREATE TYPE "ProgramCategory" AS ENUM ('EDUCATION', 'STARTUP', 'CAPSTONE', 'INTERNSHIP', 'COMPETITION', 'MENTORING', 'RESEARCH', 'OTHER');
CREATE TYPE "ProgramAudience" AS ENUM ('HIGH_SCHOOL', 'UNDERGRADUATE', 'GRADUATE', 'ALUMNI', 'JOB_SEEKER', 'EMPLOYEE', 'GENERAL');
CREATE TYPE "ProgramBenefit" AS ENUM ('CERTIFICATE', 'TRAINING', 'MENTORING', 'FUNDING', 'NETWORKING', 'WORKSPACE');
CREATE TYPE "ApplicationFieldType" AS ENUM ('SHORT_TEXT', 'LONG_TEXT', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'URL', 'FILE', 'CONSENT');

-- AlterTable
ALTER TABLE "Program" ADD COLUMN     "audiences" "ProgramAudience"[] DEFAULT ARRAY[]::"ProgramAudience"[],
ADD COLUMN     "benefits" "ProgramBenefit"[] DEFAULT ARRAY[]::"ProgramBenefit"[],
ADD COLUMN     "benefitsNote" TEXT,
ADD COLUMN     "category" "ProgramCategory",
ADD COLUMN     "coverImageUrl" TEXT,
ADD COLUMN     "eligibility" JSONB,
ADD COLUMN     "publishedAt" TIMESTAMP(3),
ADD COLUMN     "recruitmentClosedAt" TIMESTAMP(3),
ADD COLUMN     "shareToken" TEXT;

-- Programs that were already opened up stay visible; everything else stays private and unpublished.
UPDATE "Program" SET "publishedAt" = "updatedAt" WHERE "visibility" <> 'PRIVATE';

-- AlterTable
ALTER TABLE "ProgramApplication" ADD COLUMN     "submittedAt" TIMESTAMP(3);
UPDATE "ProgramApplication" SET "submittedAt" = "createdAt";

-- CreateTable
CREATE TABLE "ProgramApplicationField" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "type" "ApplicationFieldType" NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramApplicationField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramApplicationFile" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProgramApplicationFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramApplicationField_programId_archivedAt_position_idx" ON "ProgramApplicationField"("programId", "archivedAt", "position");
CREATE UNIQUE INDEX "ProgramApplicationAnswer_applicationId_fieldId_key" ON "ProgramApplicationAnswer"("applicationId", "fieldId");
CREATE UNIQUE INDEX "ProgramApplicationFile_storageKey_key" ON "ProgramApplicationFile"("storageKey");
CREATE INDEX "ProgramApplicationFile_applicationId_idx" ON "ProgramApplicationFile"("applicationId");
CREATE UNIQUE INDEX "Program_shareToken_key" ON "Program"("shareToken");

-- AddForeignKey
ALTER TABLE "ProgramApplicationField" ADD CONSTRAINT "ProgramApplicationField_programId_fkey" FOREIGN KEY ("programId") REFERENCES "Program"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplicationAnswer" ADD CONSTRAINT "ProgramApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplicationAnswer" ADD CONSTRAINT "ProgramApplicationAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProgramApplicationField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplicationFile" ADD CONSTRAINT "ProgramApplicationFile_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProgramApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProgramApplicationFile" ADD CONSTRAINT "ProgramApplicationFile_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "ProgramApplicationField"("id") ON DELETE CASCADE ON UPDATE CASCADE;
