-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'COMMENT_REPLY';

-- AlterTable
ALTER TABLE "Comment" ADD COLUMN "parentId" TEXT;

-- AddForeignKey
ALTER TABLE "Comment" ADD CONSTRAINT "Comment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Comment_parentId_idx" ON "Comment"("parentId");
