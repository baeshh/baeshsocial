-- New enum values cannot be used in the migration that adds them, so this runs separately.
-- Before offers existed, selection registered the participant immediately: those selections are confirmed.
UPDATE "ProgramApplication" AS a
SET "status" = 'CONFIRMED', "respondedAt" = COALESCE(a."reviewedAt", a."updatedAt")
WHERE a."status" = 'ACCEPTED'
  AND EXISTS (
    SELECT 1 FROM "ProgramParticipant" AS p
    WHERE p."programId" = a."programId" AND p."userId" = a."userId"
  );
