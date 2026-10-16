-- CreateTable
CREATE TABLE "ProjectDisplayPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "hiddenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectDisplayPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProjectDisplayPreference_projectId_idx" ON "ProjectDisplayPreference"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectDisplayPreference_userId_projectId_key" ON "ProjectDisplayPreference"("userId", "projectId");

-- AddForeignKey
ALTER TABLE "ProjectDisplayPreference" ADD CONSTRAINT "ProjectDisplayPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectDisplayPreference" ADD CONSTRAINT "ProjectDisplayPreference_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
