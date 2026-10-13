import { createHash } from 'node:crypto'
import { OrganizationRole, Prisma, ReportStatus } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate } from '../../middlewares/auth.middleware.js'
import { requireOrgAccess, type OrgAccess } from '../../middlewares/organization.middleware.js'
import { runAiTask } from '../../services/ai/runner.js'
import { buildNarrativeInput, fallbackNarrative, reportNarrativeTask, type ReportNarrative } from '../../services/ai/tasks/reportNarrative.js'
import { renderPdf } from '../../services/pdf/renderPdf.js'
import { storage } from '../../services/storage/storage.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { listManagedPrograms } from '../../utils/programAccess.js'
import { resolvePeriod } from '../programs/programKpis.js'
import { buildReportSnapshot, type ReportSnapshot } from './reportData.js'
import { DEFAULT_REPORT_SECTIONS, reportHtml } from './reportTemplate.js'

export const organizationReportsRouter = Router({ mergeParams: true })

const TEMPLATE_KEY = 'program-result'
const TEMPLATE_VERSION = 1
const DAILY_REPORT_LIMIT = 20
const inFlight = new Set<string>()

const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '날짜는 YYYY-MM-DD 형식이어야 합니다.')
const createReportSchema = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  programIds: z.array(z.string().min(1).max(64)).min(1, '프로그램을 1개 이상 선택하세요.').max(30),
  from: dateString,
  to: dateString,
})

const staffAccess = requireOrgAccess({ minRole: OrganizationRole.MANAGER, requireApproved: true })

async function managedProgramIds(access: OrgAccess, userId: string) {
  const { isOrgAdmin, programs } = await listManagedPrograms(access.organization, access.membership, userId)
  return { isOrgAdmin, ids: new Set(programs.map((p) => p.id)), programs }
}

async function defaultTemplate() {
  const existing = await prisma.reportTemplate.findFirst({ where: { organizationId: null, key: TEMPLATE_KEY, version: TEMPLATE_VERSION } })
  if (existing) return existing
  return prisma.reportTemplate.create({
    data: {
      key: TEMPLATE_KEY,
      name: '프로그램 운영 결과보고서',
      version: TEMPLATE_VERSION,
      isDefault: true,
      sections: DEFAULT_REPORT_SECTIONS.map((s) => ({ ...s })) as Prisma.InputJsonValue,
    },
  })
}

/** Inlines approved evidence photos; a file whose bytes no longer match its recorded hash is skipped. */
async function loadPhotos(snapshot: ReportSnapshot) {
  const photos = new Map<string, string>()
  if (!snapshot.photoFileIds.length) return photos
  const files = await prisma.evidenceFile.findMany({
    where: { id: { in: snapshot.photoFileIds } },
    select: { id: true, storageKey: true, mimeType: true, sha256: true },
  })
  await Promise.all(
    files.map(async (file) => {
      try {
        const body = await storage.get(file.storageKey)
        if (createHash('sha256').update(body).digest('hex') !== file.sha256) return
        photos.set(file.id, `data:${file.mimeType};base64,${body.toString('base64')}`)
      } catch (error) {
        console.error('[reports] photo load failed', file.id, error instanceof Error ? error.message : error)
      }
    }),
  )
  return photos
}

function serializeReport(report: {
  id: string
  title: string
  programIds: string[]
  periodStart: Date
  periodEnd: Date
  version: number
  templateVersion: number
  status: ReportStatus
  narrativeSource: string | null
  sizeBytes: number | null
  sha256: string | null
  error: string | null
  createdAt: Date
  completedAt: Date | null
  createdBy?: { id: string; name: string } | null
}) {
  return {
    id: report.id,
    title: report.title,
    programIds: report.programIds,
    period: { from: report.periodStart.toISOString(), to: report.periodEnd.toISOString() },
    version: report.version,
    templateVersion: report.templateVersion,
    status: report.status.toLowerCase(),
    narrativeSource: report.narrativeSource,
    sizeBytes: report.sizeBytes,
    sha256: report.sha256,
    error: report.error,
    createdAt: report.createdAt,
    completedAt: report.completedAt,
    createdBy: report.createdBy ?? null,
  }
}

const reportSelect = {
  id: true,
  title: true,
  programIds: true,
  periodStart: true,
  periodEnd: true,
  version: true,
  templateVersion: true,
  status: true,
  narrativeSource: true,
  sizeBytes: true,
  sha256: true,
  error: true,
  createdAt: true,
  completedAt: true,
  createdBy: { select: { id: true, name: true } },
} satisfies Prisma.GeneratedReportSelect

organizationReportsRouter.get('/', authenticate, staffAccess, async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const access = res.locals.orgAccess as OrgAccess
    const { isOrgAdmin, ids, programs } = await managedProgramIds(access, authUser.id)
    const reports = await prisma.generatedReport.findMany({
      where: { organizationId: access.organization.id },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: reportSelect,
    })
    res.status(200).json({
      reports: reports.filter((r) => isOrgAdmin || r.programIds.every((id) => ids.has(id))).map(serializeReport),
      programs: programs.map((p) => ({ id: p.id, title: p.title, term: p.term, status: p.status.toLowerCase(), startDate: p.startDate, endDate: p.endDate })),
      isOrgAdmin,
    })
  } catch (error) {
    next(error)
  }
})

organizationReportsRouter.post('/', authenticate, staffAccess, async (req, res, next) => {
  const access = res.locals.orgAccess as OrgAccess
  const lockKey = access.organization.id
  let locked = false
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const body = createReportSchema.parse(req.body)
    const period = resolvePeriod({ from: body.from, to: body.to }, { from: new Date(), to: new Date() })
    const programIds = [...new Set(body.programIds)].sort()
    const { ids } = await managedProgramIds(access, authUser.id)
    if (!programIds.every((id) => ids.has(id))) {
      throw new HttpError(403, '관리 권한이 있는 이 기관의 프로그램만 보고서에 포함할 수 있습니다.')
    }
    if (inFlight.has(lockKey)) throw new HttpError(409, '이 기관의 다른 보고서를 생성 중입니다. 잠시 후 다시 시도해 주세요.')
    const recent = await prisma.generatedReport.count({
      where: { organizationId: access.organization.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    })
    if (recent >= DAILY_REPORT_LIMIT) throw new HttpError(429, `보고서는 기관별로 24시간에 ${DAILY_REPORT_LIMIT}건까지 생성할 수 있습니다.`)

    inFlight.add(lockKey)
    locked = true
    const template = await defaultTemplate()
    const previous = await prisma.generatedReport.count({
      where: { organizationId: access.organization.id, programIds: { equals: programIds }, periodStart: period.from, periodEnd: period.to },
    })
    const organization = { id: access.organization.id, name: access.organization.name, type: access.organization.type }
    const programTitles = await prisma.program.findMany({ where: { id: { in: programIds } }, select: { title: true } })
    const title =
      body.title ??
      `${programTitles.length === 1 ? programTitles[0].title : `${organization.name} 프로그램`} 운영 결과보고서`
    const report = await prisma.generatedReport.create({
      data: {
        organizationId: organization.id,
        templateId: template.id,
        templateVersion: template.version,
        title,
        programIds,
        periodStart: period.from,
        periodEnd: period.to,
        version: previous + 1,
        createdById: authUser.id,
      },
      select: { id: true, version: true },
    })

    try {
      const snapshot = await buildReportSnapshot(organization, programIds, period)
      const narrativeInput = buildNarrativeInput(snapshot)
      let narrative: ReportNarrative
      let narrativeSource: 'ai' | 'template' = 'template'
      let aiAnalysisId: string | null = null
      try {
        const ai = await runAiTask(reportNarrativeTask, narrativeInput, { userId: authUser.id, organizationId: organization.id })
        narrative = ai.output
        aiAnalysisId = ai.analysisId
        narrativeSource = ai.meta.provider === 'mock' ? 'template' : 'ai'
      } catch (error) {
        console.warn('[reports] AI narrative unavailable, using template text:', error instanceof Error ? error.message : error)
        narrative = fallbackNarrative(narrativeInput).output
      }

      const photos = await loadPhotos(snapshot)
      const pdf = Buffer.from(
        await renderPdf(
          reportHtml({
            title,
            version: report.version,
            snapshot,
            narrative,
            narrativeSource,
            narrativeSources: [...narrativeInput.sources.values()],
            photos,
          }),
          { footerLabel: `${organization.name} · ${title} · 제${report.version}판` },
        ),
      )
      const sha256 = createHash('sha256').update(pdf).digest('hex')
      const storageKey = `reports/${organization.id}/${report.id}-v${report.version}.pdf`
      await storage.put(storageKey, pdf, 'application/pdf')
      const ready = await prisma.generatedReport.update({
        where: { id: report.id },
        data: {
          status: ReportStatus.READY,
          dataSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          narrative: narrative as unknown as Prisma.InputJsonValue,
          narrativeSource,
          aiAnalysisId,
          storageKey,
          sha256,
          sizeBytes: pdf.length,
          completedAt: new Date(),
        },
        select: reportSelect,
      })
      res.status(201).json({ report: serializeReport(ready) })
    } catch (error) {
      console.error('[reports] generation failed', error)
      await prisma.generatedReport.update({
        where: { id: report.id },
        data: { status: ReportStatus.FAILED, error: '보고서 생성 중 오류가 발생했습니다.', completedAt: new Date() },
      })
      throw new HttpError(500, '보고서 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.')
    }
  } catch (error) {
    next(error)
  } finally {
    if (locked) inFlight.delete(lockKey)
  }
})

async function findAccessibleReport(access: OrgAccess, userId: string, reportId: string) {
  const report = await prisma.generatedReport.findFirst({
    where: { id: reportId, organizationId: access.organization.id },
    select: { ...reportSelect, storageKey: true, dataSnapshot: true, narrative: true },
  })
  if (!report) throw new HttpError(404, '보고서를 찾을 수 없습니다.')
  const { isOrgAdmin, ids } = await managedProgramIds(access, userId)
  if (!isOrgAdmin && !report.programIds.every((id) => ids.has(id))) throw new HttpError(404, '보고서를 찾을 수 없습니다.')
  return report
}

organizationReportsRouter.get('/:reportId', authenticate, staffAccess, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const report = await findAccessibleReport(res.locals.orgAccess as OrgAccess, authUser.id, String(req.params.reportId))
    const snapshot = report.dataSnapshot as unknown as ReportSnapshot | null
    res.status(200).json({
      report: serializeReport(report),
      summary: snapshot
        ? { generatedAt: snapshot.generatedAt, totals: snapshot.kpis.totals, programs: snapshot.programs.map((p) => ({ id: p.id, title: p.title })) }
        : null,
      narrative: report.narrative,
    })
  } catch (error) {
    next(error)
  }
})

organizationReportsRouter.get('/:reportId/download', authenticate, staffAccess, async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const report = await findAccessibleReport(res.locals.orgAccess as OrgAccess, authUser.id, String(req.params.reportId))
    if (report.status !== ReportStatus.READY || !report.storageKey) throw new HttpError(409, '아직 다운로드할 수 없는 보고서입니다.')
    const signed = await storage.signedUrl(report.storageKey, {
      contentType: 'application/pdf',
      fileName: `${report.title}_v${report.version}.pdf`,
      inline: req.query.inline === '1',
    })
    res.status(200).json(signed)
  } catch (error) {
    next(error)
  }
})
