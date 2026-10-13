import { UserRole } from '@prisma/client'

const userRoleToApiRole: Record<UserRole, string> = {
  [UserRole.USER]: 'user',
  [UserRole.COMPANY]: 'company',
  [UserRole.INSTITUTION]: 'institution',
  [UserRole.ADMIN]: 'admin',
}

export function toApiRole(role: UserRole): string {
  return userRoleToApiRole[role]
}
