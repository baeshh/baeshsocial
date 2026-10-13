-- AlterTable
ALTER TABLE "Notification" ADD COLUMN "fromPlatform" BOOLEAN NOT NULL DEFAULT false;

-- Backfill notifications that were sent from the platform admin console or by scheduled notices.
UPDATE "Notification"
SET "fromPlatform" = true
WHERE "type" = 'SYSTEM'
  AND (
    "title" IN (
      '조직 인증 승인',
      '조직 인증 반려',
      '요금제가 적용되었습니다',
      '청구서가 발행되었습니다',
      '지원 문의에 답변이 등록되었습니다'
    )
    OR ("actorId" IS NULL AND "link" LIKE '/org/%?tab=billing')
  );
