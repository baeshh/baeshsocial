-- CreateEnum
CREATE TYPE "OpportunityEnrollmentStatus" AS ENUM ('APPLIED', 'ENROLLED', 'COMPLETED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "CertificateSource" AS ENUM ('MANUAL', 'PROGRAM');

-- AlterTable
ALTER TABLE "Certificate" ADD COLUMN "source" "CertificateSource" NOT NULL DEFAULT 'MANUAL';
ALTER TABLE "Certificate" ADD COLUMN "opportunityId" TEXT;

-- CreateTable
CREATE TABLE "OpportunityEnrollment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "OpportunityEnrollmentStatus" NOT NULL DEFAULT 'APPLIED',
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enrolledAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "approvedById" TEXT,
    "certificateId" TEXT,

    CONSTRAINT "OpportunityEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityEnrollment_userId_opportunityId_key" ON "OpportunityEnrollment"("userId", "opportunityId");
CREATE UNIQUE INDEX "OpportunityEnrollment_certificateId_key" ON "OpportunityEnrollment"("certificateId");
CREATE UNIQUE INDEX "Certificate_opportunityId_key" ON "Certificate"("opportunityId");

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpportunityEnrollment" ADD CONSTRAINT "OpportunityEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityEnrollment" ADD CONSTRAINT "OpportunityEnrollment_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OpportunityEnrollment" ADD CONSTRAINT "OpportunityEnrollment_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OpportunityEnrollment" ADD CONSTRAINT "OpportunityEnrollment_certificateId_fkey" FOREIGN KEY ("certificateId") REFERENCES "Certificate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
