import type { RequestHandler } from 'express'
import {
  OrganizationMemberStatus,
  OrganizationVerificationStatus,
  type Organization,
  type OrganizationMember,
  type OrganizationRole,
} from '@prisma/client'
import { prisma } from '../config/prisma.js'
import { hasOrgRole } from '../utils/organizations.js'
import type { AuthTokenPayload } from '../utils/auth.js'

export type OrgAccess = {
  organization: Organization
  membership: OrganizationMember
}

type OrgAccessOptions = {
  /** Minimum organization role required (OWNER > ADMIN > MANAGER > MEMBER). */
  minRole?: OrganizationRole
  /** Management features are only available once the platform has approved the organization. */
  requireApproved?: boolean
}

/**
 * Must run after `authenticate`. Resolves `:orgId` against the caller's ACTIVE membership in the DB,
 * so access to another organization's data is denied regardless of what the client sends.
 */
export function requireOrgAccess(options: OrgAccessOptions = {}): RequestHandler {
  return async (req, res, next) => {
    try {
      const authUser = res.locals.user as AuthTokenPayload | undefined
      if (!authUser) {
        res.status(401).json({ message: 'Authentication required' })
        return
      }

      const organizationId = String(req.params.orgId ?? '')
      const membership = await prisma.organizationMember.findUnique({
        where: { organizationId_userId: { organizationId, userId: authUser.id } },
        include: { organization: true },
      })

      if (!membership || membership.status !== OrganizationMemberStatus.ACTIVE) {
        res.status(403).json({ message: 'You are not a member of this organization' })
        return
      }

      if (
        options.requireApproved &&
        membership.organization.verificationStatus !== OrganizationVerificationStatus.APPROVED
      ) {
        res.status(403).json({ message: 'Organization has not been approved yet' })
        return
      }

      if (options.minRole && !hasOrgRole(membership.role, options.minRole)) {
        res.status(403).json({ message: 'Insufficient organization role' })
        return
      }

      const { organization, ...memberRow } = membership
      res.locals.orgAccess = { organization, membership: memberRow } satisfies OrgAccess
      next()
    } catch (error) {
      next(error)
    }
  }
}
