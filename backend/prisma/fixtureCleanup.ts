import { prisma } from '../src/config/prisma.js'

/**
 * Removes local fixture organizations, their programs and the fixture users' projects. Official records and
 * the institution history around them are Restrict-protected, so they are deleted explicitly, children first.
 * Only for local seed scripts: production data is never deleted this way.
 */
export async function removeFixtures(input: { organizationNames: string[]; userIds: string[] }) {
  const orgs = await prisma.organization.findMany({ where: { name: { in: input.organizationNames } }, select: { id: true } })
  const orgIds = orgs.map((org) => org.id)
  const programs = await prisma.program.findMany({ where: { organizationId: { in: orgIds } }, select: { id: true } })
  const programIds = programs.map((program) => program.id)
  const projects = await prisma.project.findMany({
    where: { OR: [{ ownerId: { in: input.userIds } }, { programId: { in: programIds } }] },
    select: { id: true },
  })
  const projectIds = projects.map((project) => project.id)

  const recordWhere = {
    OR: [{ organizationId: { in: orgIds } }, { projectId: { in: projectIds } }, { programId: { in: programIds } }],
  }
  await prisma.programProjectRecordEvent.deleteMany({ where: { record: recordWhere } })
  await prisma.programProjectRecord.deleteMany({ where: recordWhere })
  await prisma.recordRetentionPolicy.deleteMany({ where: { organizationId: { in: orgIds } } })
  await prisma.evidenceReview.deleteMany({ where: { evidence: { projectId: { in: projectIds } } } })
  await prisma.verifiedRecord.deleteMany({
    where: { OR: [{ projectId: { in: projectIds } }, { organizationId: { in: orgIds } }] },
  })
  await prisma.projectVerification.deleteMany({
    where: { OR: [{ projectId: { in: projectIds } }, { programId: { in: programIds } }, { organizationId: { in: orgIds } }] },
  })
  await prisma.projectReview.deleteMany({ where: { OR: [{ projectId: { in: projectIds } }, { programId: { in: programIds } }] } })
  await prisma.programProjectRegistration.deleteMany({
    where: { OR: [{ projectId: { in: projectIds } }, { programId: { in: programIds } }] },
  })
  await prisma.programParticipant.deleteMany({ where: { programId: { in: programIds } } })
  await prisma.project.deleteMany({ where: { id: { in: projectIds } } })
  await prisma.program.deleteMany({ where: { id: { in: programIds } } })
  await prisma.organization.deleteMany({ where: { id: { in: orgIds } } })
}
