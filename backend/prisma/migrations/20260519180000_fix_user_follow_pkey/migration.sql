-- UserFollow was out of sync: DB had NOT NULL "id" PK while Prisma uses (followerId, followingId).
ALTER TABLE "UserFollow" DROP CONSTRAINT "UserFollow_pkey";
ALTER TABLE "UserFollow" DROP COLUMN IF EXISTS "id";
ALTER TABLE "UserFollow" ADD CONSTRAINT "UserFollow_pkey" PRIMARY KEY ("followerId", "followingId");
