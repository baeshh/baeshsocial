-- schema.prisma declares @@index([followingId]) on UserFollow but no migration created it (follower lists scan the table).
CREATE INDEX IF NOT EXISTS "UserFollow_followingId_idx" ON "UserFollow"("followingId");
