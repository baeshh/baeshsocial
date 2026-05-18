import { UserRole } from '@prisma/client'

const apiRoleToUserRole: Record<string, UserRole> = {
  user: UserRole.USER,
  company: UserRole.COMPANY,
  institution: UserRole.INSTITUTION,
  admin: UserRole.ADMIN,
}

const userRoleToApiRole: Record<UserRole, string> = {
  [UserRole.USER]: 'user',
  [UserRole.COMPANY]: 'company',
  [UserRole.INSTITUTION]: 'institution',
  [UserRole.ADMIN]: 'admin',
}

export function toUserRole(role: string): UserRole {
  return apiRoleToUserRole[role]
}

export function toApiRole(role: UserRole): string {
  return userRoleToApiRole[role]
}
