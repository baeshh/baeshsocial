-- CreateTable
CREATE TABLE "ProjectRole" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectRole_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "ProjectMember" ADD COLUMN "roleId" TEXT;

-- AlterTable
ALTER TABLE "ProjectInvite" ADD COLUMN "roleId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "ProjectRole_projectId_slug_key" ON "ProjectRole"("projectId", "slug");

-- AddForeignKey
ALTER TABLE "ProjectRole" ADD CONSTRAINT "ProjectRole_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProjectMember" ADD CONSTRAINT "ProjectMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ProjectInvite" ADD CONSTRAINT "ProjectInvite_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default roles for existing projects and link members
DO $$
DECLARE
  proj RECORD;
  owner_role_id TEXT;
  admin_role_id TEXT;
  editor_role_id TEXT;
  viewer_role_id TEXT;
  member_rec RECORD;
BEGIN
  FOR proj IN SELECT id, "ownerId" FROM "Project" LOOP
    owner_role_id := proj.id || '_role_owner';
    admin_role_id := proj.id || '_role_admin';
    editor_role_id := proj.id || '_role_editor';
    viewer_role_id := proj.id || '_role_viewer';

    INSERT INTO "ProjectRole" ("id", "projectId", "name", "slug", "description", "permissions", "isSystem", "sortOrder", "updatedAt")
    VALUES
      (owner_role_id, proj.id, '소유자', 'owner', '프로젝트의 모든 권한', ARRAY[
        'project.view','project.edit','project.delete','project.settings',
        'roles.manage','members.invite','members.remove','members.assign_role',
        'tasks.view','tasks.create','tasks.edit','tasks.delete',
        'files.view','files.upload','files.delete','activities.create'
      ], true, 0, NOW()),
      (admin_role_id, proj.id, '관리자', 'admin', '프로젝트 설정·팀·콘텐츠 관리', ARRAY[
        'project.view','project.edit','project.settings',
        'roles.manage','members.invite','members.remove','members.assign_role',
        'tasks.view','tasks.create','tasks.edit','tasks.delete',
        'files.view','files.upload','files.delete','activities.create'
      ], true, 1, NOW()),
      (editor_role_id, proj.id, '편집자', 'editor', '태스크·파일·활동 편집', ARRAY[
        'project.view','tasks.view','tasks.create','tasks.edit',
        'files.view','files.upload','activities.create'
      ], true, 2, NOW()),
      (viewer_role_id, proj.id, '뷰어', 'viewer', '읽기 전용', ARRAY[
        'project.view','tasks.view','files.view'
      ], true, 3, NOW());

    FOR member_rec IN SELECT id, "userId", role FROM "ProjectMember" WHERE "projectId" = proj.id LOOP
      IF member_rec."userId" = proj."ownerId" OR LOWER(member_rec.role) = 'owner' THEN
        UPDATE "ProjectMember" SET "roleId" = owner_role_id, role = '소유자' WHERE id = member_rec.id;
      ELSIF LOWER(member_rec.role) LIKE '%admin%' OR LOWER(member_rec.role) = 'member' THEN
        UPDATE "ProjectMember" SET "roleId" = editor_role_id, role = '편집자' WHERE id = member_rec.id;
      ELSE
        UPDATE "ProjectMember" SET "roleId" = editor_role_id, role = COALESCE(NULLIF(member_rec.role, ''), '편집자') WHERE id = member_rec.id;
      END IF;
    END LOOP;

    UPDATE "ProjectInvite" SET "roleId" = editor_role_id WHERE "projectId" = proj.id AND "roleId" IS NULL;
  END LOOP;
END $$;
