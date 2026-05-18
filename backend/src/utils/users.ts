import type { User } from '@prisma/client'
import { toApiRole } from './roles.js'

export function serializeUser(user: Pick<User, 'id' | 'email' | 'name' | 'role' | 'avatarUrl' | 'coverUrl' | 'createdAt' | 'updatedAt'>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: toApiRole(user.role),
    avatarUrl: user.avatarUrl,
    coverUrl: user.coverUrl,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  }
}
