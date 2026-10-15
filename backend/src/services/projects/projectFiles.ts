import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/prisma.js'
import { HttpError } from '../../utils/httpError.js'
import { assertOrgCapacity, bytesToGb } from '../billing/entitlements.js'
import { PROJECT_FILE_LIMITS, validateProjectUpload, type ValidatedProjectFile } from '../storage/projectFileValidation.js'
import { buildStorageKey, storage } from '../storage/storage.js'

type Db = typeof prisma | Prisma.TransactionClient

/** Everything the API returns about a file; the storage key, hash and scan result stay internal. */
export const projectFileSelect = {
  id: true,
  projectId: true,
  name: true,
  url: true,
  fileType: true,
  uploadedBy: true,
  mimeType: true,
  sizeBytes: true,
  createdAt: true,
  uploader: { select: { id: true, name: true, email: true, avatarUrl: true } },
} as const

const GB = 1024 * 1024 * 1024

async function assertPersonalQuota(db: Db, projectId: string, files: number, bytes: number) {
  const usage = await db.projectFile.aggregate({
    where: { projectId, storageKey: { not: null } },
    _count: { _all: true },
    _sum: { sizeBytes: true },
  })
  if (usage._count._all + files > PROJECT_FILE_LIMITS.maxFilesPerProject) {
    throw new HttpError(409, `프로젝트에는 파일을 최대 ${PROJECT_FILE_LIMITS.maxFilesPerProject}개까지 올릴 수 있습니다.`)
  }
  if ((usage._sum.sizeBytes ?? 0) + bytes > PROJECT_FILE_LIMITS.maxBytesPerProject) {
    throw new HttpError(409, `프로젝트 저장 용량(${PROJECT_FILE_LIMITS.maxBytesPerProject / GB}GB)을 초과합니다. 사용하지 않는 파일을 삭제해 주세요.`)
  }
}

/**
 * Validates, stores and records uploaded files. Objects are written before the rows; if the rows cannot be
 * created (quota race, database error) the objects are removed again.
 */
export async function storeProjectFiles(
  projectId: string,
  uploaderId: string,
  uploads: Express.Multer.File[],
  fileType: string | undefined,
) {
  if (uploads.length === 0) throw new HttpError(400, '업로드할 파일을 선택해 주세요.')
  if (uploads.length > PROJECT_FILE_LIMITS.maxFilesPerRequest) {
    throw new HttpError(400, `한 번에 최대 ${PROJECT_FILE_LIMITS.maxFilesPerRequest}개까지 올릴 수 있습니다.`)
  }
  const project = await prisma.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { program: { select: { organizationId: true } } },
  })
  const organizationId = project.program?.organizationId ?? null
  const bytes = uploads.reduce((sum, file) => sum + file.size, 0)
  if (organizationId) await assertOrgCapacity(organizationId, 'storageGb', bytesToGb(bytes))
  else await assertPersonalQuota(prisma, projectId, uploads.length, bytes)

  const validated: ValidatedProjectFile[] = []
  for (const upload of uploads) validated.push(await validateProjectUpload(upload))

  const stored: string[] = []
  try {
    const rows: { file: ValidatedProjectFile; storageKey: string }[] = []
    for (const file of validated) {
      const storageKey = buildStorageKey(`projects/${projectId}`, file.extension)
      await storage.put(storageKey, file.buffer, file.mimeType)
      stored.push(storageKey)
      rows.push({ file, storageKey })
    }
    return await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`
      if (!organizationId) await assertPersonalQuota(tx, projectId, rows.length, bytes)
      const created = []
      for (const { file, storageKey } of rows) {
        created.push(
          await tx.projectFile.create({
            data: {
              projectId,
              uploadedBy: uploaderId,
              name: file.originalName,
              fileType: fileType ?? file.defaultType,
              storageKey,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              sha256: file.sha256,
              scanStatus: file.scanStatus,
            },
            select: projectFileSelect,
          }),
        )
      }
      return created
    })
  } catch (error) {
    await Promise.allSettled(stored.map((key) => storage.remove(key)))
    throw error
  }
}

export async function removeStoredObjects(keys: (string | null)[]) {
  const results = await Promise.allSettled(keys.filter((key): key is string => Boolean(key)).map((key) => storage.remove(key)))
  for (const result of results) {
    if (result.status === 'rejected') console.error('Project file removal failed:', result.reason)
  }
}
