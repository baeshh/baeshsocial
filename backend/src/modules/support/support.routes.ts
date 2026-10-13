import { OrganizationMemberStatus, OrganizationRole, SupportTicketStatus, UserRole, type Prisma } from '@prisma/client'
import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../../config/prisma.js'
import { authenticate, requireRoles } from '../../middlewares/auth.middleware.js'
import { audit } from '../../services/audit/audit.js'
import { sendAlert } from '../../services/ops/alerts.js'
import type { AuthTokenPayload } from '../../utils/auth.js'
import { HttpError } from '../../utils/httpError.js'
import { hasOrgRole } from '../../utils/organizations.js'

export const supportRouter = Router()
export const supportAdminRouter = Router()

const CATEGORIES = ['account', 'billing', 'program', 'evidence', 'report', 'bug', 'other'] as const

const createSchema = z.object({
  organizationId: z.string().max(64).nullable().optional(),
  category: z.enum(CATEGORIES),
  subject: z.string().trim().min(2).max(120),
  body: z.string().trim().min(5).max(5000),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
})

const messageSchema = z.object({ body: z.string().trim().min(1).max(5000) })

const ticketInclude = {
  organization: { select: { id: true, name: true } },
  requester: { select: { id: true, name: true, email: true } },
  messages: {
    orderBy: { createdAt: 'asc' },
    include: { author: { select: { id: true, name: true } } },
  },
} satisfies Prisma.SupportTicketInclude

type TicketRow = Prisma.SupportTicketGetPayload<{ include: typeof ticketInclude }>

function serializeTicket(ticket: TicketRow, options: { showRequesterEmail: boolean }) {
  return {
    id: ticket.id,
    organization: ticket.organization,
    requester: ticket.requester
      ? { id: ticket.requester.id, name: ticket.requester.name, email: options.showRequesterEmail ? ticket.requester.email : null }
      : null,
    category: ticket.category,
    subject: ticket.subject,
    status: ticket.status.toLowerCase(),
    priority: ticket.priority,
    lastMessageAt: ticket.lastMessageAt,
    createdAt: ticket.createdAt,
    messages: ticket.messages.map((message) => ({
      id: message.id,
      body: message.body,
      isStaff: message.isStaff,
      author: message.isStaff ? { id: null, name: 'BAESH 운영팀' } : message.author,
      createdAt: message.createdAt,
    })),
  }
}

/** Organizations where the user is an active admin; their tickets are shared with co-admins. */
async function adminOrgIds(userId: string) {
  const memberships = await prisma.organizationMember.findMany({
    where: { userId, status: OrganizationMemberStatus.ACTIVE, role: { in: [OrganizationRole.OWNER, OrganizationRole.ADMIN] } },
    select: { organizationId: true },
  })
  return memberships.map((membership) => membership.organizationId)
}

async function visibleTicket(ticketId: string, userId: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: ticketInclude })
  if (!ticket) throw new HttpError(404, '문의를 찾을 수 없습니다.')
  if (ticket.requesterId === userId) return ticket
  if (ticket.organizationId && (await adminOrgIds(userId)).includes(ticket.organizationId)) return ticket
  throw new HttpError(404, '문의를 찾을 수 없습니다.')
}

/* ------------------------------ /api/support --------------------------- */

supportRouter.use(authenticate)

supportRouter.get('/tickets', async (_req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const orgIds = await adminOrgIds(authUser.id)
    const tickets = await prisma.supportTicket.findMany({
      where: { OR: [{ requesterId: authUser.id }, ...(orgIds.length ? [{ organizationId: { in: orgIds } }] : [])] },
      include: ticketInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    })
    res.status(200).json({ tickets: tickets.map((ticket) => serializeTicket(ticket, { showRequesterEmail: false })) })
  } catch (error) {
    next(error)
  }
})

supportRouter.post('/tickets', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const input = createSchema.parse(req.body)
    if (input.organizationId) {
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId: input.organizationId, userId: authUser.id } },
        select: { status: true, role: true },
      })
      if (membership?.status !== OrganizationMemberStatus.ACTIVE || !hasOrgRole(membership.role, OrganizationRole.MANAGER)) {
        throw new HttpError(403, '조직 문의는 조직의 매니저 이상만 등록할 수 있습니다.')
      }
    }
    const recent = await prisma.supportTicket.count({
      where: { requesterId: authUser.id, createdAt: { gte: new Date(Date.now() - 3_600_000) } },
    })
    if (recent >= 10) throw new HttpError(429, '문의는 1시간에 10건까지 등록할 수 있습니다.')
    const ticket = await prisma.supportTicket.create({
      data: {
        organizationId: input.organizationId ?? null,
        requesterId: authUser.id,
        category: input.category,
        subject: input.subject,
        priority: input.priority,
        messages: { create: { authorId: authUser.id, body: input.body } },
      },
      include: ticketInclude,
    })
    if (input.priority === 'urgent') {
      await sendAlert('warning', '긴급 지원 문의가 접수되었습니다', `${ticket.organization?.name ?? '개인'} · ${ticket.subject}`, `ticket:${ticket.id}`)
    }
    res.status(201).json({ ticket: serializeTicket(ticket, { showRequesterEmail: false }) })
  } catch (error) {
    next(error)
  }
})

supportRouter.get('/tickets/:ticketId', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const ticket = await visibleTicket(String(req.params.ticketId), authUser.id)
    res.status(200).json({ ticket: serializeTicket(ticket, { showRequesterEmail: false }) })
  } catch (error) {
    next(error)
  }
})

supportRouter.post('/tickets/:ticketId/messages', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { body } = messageSchema.parse(req.body)
    const ticket = await visibleTicket(String(req.params.ticketId), authUser.id)
    if (ticket.status === SupportTicketStatus.CLOSED) throw new HttpError(409, '종료된 문의입니다. 새 문의를 등록해 주세요.')
    await prisma.$transaction([
      prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, authorId: authUser.id, body } }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: {
          lastMessageAt: new Date(),
          ...(ticket.status === SupportTicketStatus.RESOLVED ? { status: SupportTicketStatus.OPEN } : {}),
        },
      }),
    ])
    const updated = await visibleTicket(ticket.id, authUser.id)
    res.status(201).json({ ticket: serializeTicket(updated, { showRequesterEmail: false }) })
  } catch (error) {
    next(error)
  }
})

/* --------------------------- /api/admin/support ------------------------- */

supportAdminRouter.use(authenticate, requireRoles([UserRole.ADMIN]))

supportAdminRouter.get('/tickets', async (req, res, next) => {
  try {
    const { status } = z
      .object({ status: z.enum(['open', 'in_progress', 'resolved', 'closed', 'active', 'all']).default('active') })
      .parse(req.query)
    const tickets = await prisma.supportTicket.findMany({
      where:
        status === 'all'
          ? {}
          : status === 'active'
            ? { status: { in: [SupportTicketStatus.OPEN, SupportTicketStatus.IN_PROGRESS] } }
            : { status: status.toUpperCase() as SupportTicketStatus },
      include: ticketInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: 200,
    })
    res.status(200).json({ tickets: tickets.map((ticket) => serializeTicket(ticket, { showRequesterEmail: true })) })
  } catch (error) {
    next(error)
  }
})

supportAdminRouter.post('/tickets/:ticketId/messages', async (req, res, next) => {
  try {
    const authUser = res.locals.user as AuthTokenPayload
    const { body } = messageSchema.parse(req.body)
    const ticket = await prisma.supportTicket.findUnique({ where: { id: String(req.params.ticketId) } })
    if (!ticket) throw new HttpError(404, '문의를 찾을 수 없습니다.')
    await prisma.$transaction([
      prisma.supportTicketMessage.create({ data: { ticketId: ticket.id, authorId: authUser.id, body, isStaff: true } }),
      prisma.supportTicket.update({
        where: { id: ticket.id },
        data: { lastMessageAt: new Date(), ...(ticket.status === SupportTicketStatus.OPEN ? { status: SupportTicketStatus.IN_PROGRESS } : {}) },
      }),
    ])
    if (ticket.requesterId) {
      await prisma.notification
        .create({
          data: {
            userId: ticket.requesterId,
            actorId: authUser.id,
            type: 'SYSTEM',
            title: '지원 문의에 답변이 등록되었습니다',
            body: ticket.subject,
            link: `/support?ticket=${ticket.id}`,
          },
        })
        .catch(() => undefined)
    }
    const updated = await prisma.supportTicket.findUniqueOrThrow({ where: { id: ticket.id }, include: ticketInclude })
    res.status(201).json({ ticket: serializeTicket(updated, { showRequesterEmail: true }) })
  } catch (error) {
    next(error)
  }
})

supportAdminRouter.patch('/tickets/:ticketId', async (req, res, next) => {
  try {
    const input = z
      .object({
        status: z.enum(['open', 'in_progress', 'resolved', 'closed']).optional(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
      })
      .parse(req.body)
    const ticket = await prisma.supportTicket.update({
      where: { id: String(req.params.ticketId) },
      data: {
        ...(input.status ? { status: input.status.toUpperCase() as SupportTicketStatus } : {}),
        ...(input.priority ? { priority: input.priority } : {}),
      },
      include: ticketInclude,
    })
    await audit(req, res, {
      action: 'admin.support_update',
      organizationId: ticket.organizationId,
      targetType: 'support_ticket',
      targetId: ticket.id,
      metadata: input,
    })
    res.status(200).json({ ticket: serializeTicket(ticket, { showRequesterEmail: true }) })
  } catch (error) {
    next(error)
  }
})
