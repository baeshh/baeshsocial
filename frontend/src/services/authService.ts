import { apiRequest } from '../lib/api'
import type { AuthResponse, AuthUser, UserRole } from '../types/auth'

export type RegisterPayload = {
  email: string
  password: string
  name: string
  role: UserRole
}

export type LoginPayload = {
  email: string
  password: string
}

export function register(payload: RegisterPayload) {
  return apiRequest<AuthResponse>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function login(payload: LoginPayload) {
  return apiRequest<AuthResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchMe(token: string) {
  return apiRequest<{ user: AuthUser }>('/auth/me', {
    token,
  })
}

export function logout(token: string | null) {
  return apiRequest<{ message: string }>('/auth/logout', {
    method: 'POST',
    token,
  })
}
