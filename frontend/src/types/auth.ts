export type UserRole = 'user' | 'company' | 'institution' | 'admin'

export type AuthUser = {
  id: string
  email: string
  name: string
  role: UserRole
  avatarUrl: string | null
  coverUrl: string | null
  createdAt: string
  updatedAt: string
}

export type AuthResponse = {
  token: string
  user: AuthUser
  invite?: { organizationId: string; organizationName: string; programId: string | null; role: string }
  inviteError?: string
}
