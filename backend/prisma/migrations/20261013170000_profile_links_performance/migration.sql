-- Trigram indexes power case-insensitive substring search on names/headlines.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateEnum
CREATE TYPE "ProfileVisibility" AS ENUM ('PUBLIC', 'MEMBERS', 'FOLLOWERS');

-- CreateEnum
CREATE TYPE "ProjectLinkType" AS ENUM ('GITHUB', 'FIGMA', 'NOTION', 'GOOGLE_DRIVE', 'DEPLOYMENT', 'OTHER');

-- AlterTable
ALTER TABLE "Profile" ADD COLUMN     "featuredProjectIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "visibility" "ProfileVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateTable
CREATE TABLE "ProjectExternalLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "type" "ProjectLinkType" NOT NULL,
    "url" TEXT NOT NULL,
    "label" TEXT,
    "description" TEXT,
    "metadata" JSONB,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectExternalLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectExternalLink_projectId_sortOrder_idx" ON "ProjectExternalLink"("projectId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectExternalLink_projectId_url_key" ON "ProjectExternalLink"("projectId", "url");

-- CreateIndex
CREATE INDEX "Award_profileId_awardedAt_idx" ON "Award"("profileId", "awardedAt");

-- CreateIndex
CREATE INDEX "Career_profileId_startDate_idx" ON "Career"("profileId", "startDate");

-- CreateIndex
CREATE INDEX "Certificate_profileId_issuedAt_idx" ON "Certificate"("profileId", "issuedAt");

-- CreateIndex
CREATE INDEX "Comment_postId_createdAt_idx" ON "Comment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "Comment_authorId_idx" ON "Comment"("authorId");

-- CreateIndex
CREATE INDEX "OpportunityEnrollment_opportunityId_idx" ON "OpportunityEnrollment"("opportunityId");

-- CreateIndex
CREATE INDEX "Portfolio_profileId_idx" ON "Portfolio"("profileId");

-- CreateIndex
CREATE INDEX "Post_createdAt_id_idx" ON "Post"("createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Post_authorId_createdAt_id_idx" ON "Post"("authorId", "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "Post_repostOfId_idx" ON "Post"("repostOfId");

-- CreateIndex
CREATE INDEX "Post_linkedProjectId_idx" ON "Post"("linkedProjectId");

-- CreateIndex
CREATE INDEX "PostLike_userId_idx" ON "PostLike"("userId");

-- CreateIndex
CREATE INDEX "Profile_headline_trgm_idx" ON "Profile" USING GIN ("headline" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Profile_company_trgm_idx" ON "Profile" USING GIN ("company" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Profile_school_trgm_idx" ON "Profile" USING GIN ("school" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "Profile_skills_idx" ON "Profile" USING GIN ("skills");

-- CreateIndex
CREATE INDEX "Project_ownerId_updatedAt_idx" ON "Project"("ownerId", "updatedAt");

-- CreateIndex
CREATE INDEX "Project_visibility_updatedAt_idx" ON "Project"("visibility", "updatedAt");

-- CreateIndex
CREATE INDEX "ProjectActivity_projectId_createdAt_idx" ON "ProjectActivity"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectActivity_userId_createdAt_idx" ON "ProjectActivity"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectFile_projectId_createdAt_idx" ON "ProjectFile"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMember_userId_idx" ON "ProjectMember"("userId");

-- CreateIndex
CREATE INDEX "ProjectTask_projectId_createdAt_idx" ON "ProjectTask"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "User_name_trgm_idx" ON "User" USING GIN ("name" gin_trgm_ops);

-- CreateIndex
CREATE INDEX "VerifiedRecord_userId_issuedAt_idx" ON "VerifiedRecord"("userId", "issuedAt");

-- CreateIndex
CREATE INDEX "VerifiedRecord_projectId_idx" ON "VerifiedRecord"("projectId");

-- AddForeignKey
ALTER TABLE "ProjectExternalLink" ADD CONSTRAINT "ProjectExternalLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectExternalLink" ADD CONSTRAINT "ProjectExternalLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

