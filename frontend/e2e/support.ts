import { expect, type APIRequestContext, type Page } from '@playwright/test'

/** Mirrors backend/prisma/seedE2E.ts. */
export const API = `http://localhost:${process.env.E2E_API_PORT ?? 4100}/api`
export const PASSWORD = process.env.E2E_PASSWORD || 'password123'
export const USERS = {
  operator: { email: 'operator@e2e.baesh.dev', name: '이운영' },
  applicant: { email: 'applicant@e2e.baesh.dev', name: '박지원' },
  outsider: { email: 'outsider@e2e.baesh.dev', name: '최외부' },
  member: { email: 'member@e2e.baesh.dev', name: '김구성' },
} as const
export const UNIVERSITY = 'E2E 대학교'
export const COMPANY = 'E2E 테크'
export const MOVE_TARGET = 'E2E 이동 대상 프로그램'

export type Role = keyof typeof USERS

const tokens = new Map<Role, string>()

export async function apiToken(request: APIRequestContext, role: Role) {
  const cached = tokens.get(role)
  if (cached) return cached
  const response = await request.post(`${API}/auth/login`, { data: { email: USERS[role].email, password: PASSWORD } })
  expect(response.ok(), `login ${role}`).toBeTruthy()
  const { token } = (await response.json()) as { token: string }
  tokens.set(role, token)
  return token
}

export async function apiGet<T>(request: APIRequestContext, role: Role, path: string): Promise<T> {
  const response = await request.get(`${API}${path}`, { headers: { Authorization: `Bearer ${await apiToken(request, role)}` } })
  expect(response.ok(), `GET ${path}`).toBeTruthy()
  return (await response.json()) as T
}

/** Signs in without the login form: the app reads the token from localStorage on boot. */
export async function signIn(page: Page, role: Role) {
  const token = await apiToken(page.request, role)
  await page.addInitScript(
    ([key, value]) => {
      if (!sessionStorage.getItem('e2e.signed-out')) localStorage.setItem(key, value)
    },
    ['baesh.auth.token', token] as const,
  )
}

export async function orgIds(request: APIRequestContext) {
  const { memberships } = await apiGet<{ memberships: Array<{ organization: { id: string; name: string } }> }>(
    request,
    'operator',
    '/organizations/me',
  )
  const id = (name: string) => {
    const found = memberships.find((m) => m.organization.name === name)
    expect(found, `membership in ${name}`).toBeTruthy()
    return found!.organization.id
  }
  return { university: id(UNIVERSITY), company: id(COMPANY) }
}

/** `datetime-local` value `days` from now, in the browser's local time. */
export function deadlineInput(days: number) {
  const at = new Date(Date.now() + days * 86_400_000)
  return new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** The page must never scroll sideways: every overflow is a layout bug at that width. */
export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow, 'horizontal overflow in px').toBeLessThanOrEqual(0)
}

export async function expectToast(page: Page, text: string | RegExp) {
  await expect(page.getByText(text).first()).toBeVisible()
}
