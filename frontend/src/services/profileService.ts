import { apiRequest } from '../lib/api'
import type { ProfilePayload } from '../types/profile'

export type UpdateProfilePayload = {
  headline: string | null
  bio: string | null
  school: string | null
  company: string | null
  location: string | null
  skills: string[]
  interests: string[]
  socialLinks: Record<string, string> | null
}

export type CertificatePayload = {
  title: string
  issuer: string
  issuedAt?: string | null
  credentialUrl?: string | null
  verified?: boolean
}

export type CareerPayload = {
  company: string
  position: string
  startDate?: string | null
  endDate?: string | null
  description?: string | null
}

export type AwardPayload = {
  title: string
  issuer?: string | null
  awardedAt?: string | null
  description?: string | null
}

export type PortfolioPayload = {
  title: string
  description?: string | null
  url?: string | null
  imageUrl?: string | null
}

export function getMyProfile(token: string) {
  return apiRequest<ProfilePayload>('/profiles/me', { token })
}

export function getProfileByUserId(token: string, userId: string) {
  return apiRequest<ProfilePayload>(`/profiles/${userId}`, { token })
}

export function updateMyProfile(token: string, payload: UpdateProfilePayload) {
  return apiRequest<{ profile: ProfilePayload['profile'] }>('/profiles/me', {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function addCertificate(token: string, payload: CertificatePayload) {
  return apiRequest('/profiles/me/certificates', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function addCareer(token: string, payload: CareerPayload) {
  return apiRequest('/profiles/me/careers', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function addAward(token: string, payload: AwardPayload) {
  return apiRequest('/profiles/me/awards', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function addPortfolio(token: string, payload: PortfolioPayload) {
  return apiRequest('/profiles/me/portfolios', {
    method: 'POST',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateCertificate(token: string, certificateId: string, payload: CertificatePayload) {
  return apiRequest(`/profiles/me/certificates/${certificateId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateCareer(token: string, careerId: string, payload: CareerPayload) {
  return apiRequest(`/profiles/me/careers/${careerId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}

export function updateAward(token: string, awardId: string, payload: AwardPayload) {
  return apiRequest(`/profiles/me/awards/${awardId}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  })
}
