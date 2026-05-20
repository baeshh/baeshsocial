-- CreateTable
CREATE TABLE "ProfileView" (
    "viewerId" TEXT NOT NULL,
    "profileUserId" TEXT NOT NULL,
    "viewCount" INTEGER NOT NULL DEFAULT 1,
    "firstViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProfileView_pkey" PRIMARY KEY ("viewerId","profileUserId")
);

-- CreateIndex
CREATE INDEX "ProfileView_viewerId_lastViewedAt_idx" ON "ProfileView"("viewerId", "lastViewedAt" DESC);

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_viewerId_fkey" FOREIGN KEY ("viewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProfileView" ADD CONSTRAINT "ProfileView_profileUserId_fkey" FOREIGN KEY ("profileUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
