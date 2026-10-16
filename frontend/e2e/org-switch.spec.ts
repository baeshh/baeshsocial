import { expect, test } from '@playwright/test'
import { COMPANY, UNIVERSITY, orgIds, signIn } from './support'

test('기관을 전환하는 동안 이전 기관의 정보가 보이지 않는다', async ({ page }) => {
  const { university, company } = await orgIds(page.request)
  await signIn(page, 'operator')
  await page.goto(`/org/${university}`)
  const main = page.getByRole('main')
  await expect(main.getByText(UNIVERSITY).first()).toBeVisible()

  // Hold the company's dashboard so the in-between state can be inspected.
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route(`**/api/organizations/${company}/dashboard*`, async (route) => {
    await held
    await route.fallback()
  })

  await page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` }).click()
  await page.getByRole('menuitem', { name: new RegExp(COMPANY) }).click()

  await expect(page).toHaveURL(new RegExp(`/org/${company}$`))
  await expect(page.getByRole('status').filter({ hasText: '조직 대시보드를 불러오는 중입니다' })).toBeAttached()
  await page.waitForTimeout(300)
  await expect(page.getByText(UNIVERSITY)).toHaveCount(0)

  release()
  await expect(page.getByRole('button', { name: `작업 공간: ${COMPANY}` })).toBeVisible()
  await expect(main.getByText(COMPANY).first()).toBeVisible()
  await expect(main.getByText(UNIVERSITY)).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('baesh.activeOrganizationId'))).toBe(company)

  // History keeps each workspace separate as well.
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`/org/${university}$`))
  await expect(page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` })).toBeVisible()
  await expect(main.getByText(UNIVERSITY).first()).toBeVisible()
  await expect(main.getByText(COMPANY)).toHaveCount(0)
})

test('개인 작업 공간으로 돌아오면 관리 메뉴가 사라진다', async ({ page }) => {
  const { university } = await orgIds(page.request)
  await signIn(page, 'operator')
  await page.goto(`/org/${university}`)
  await page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` }).click()
  await page.getByRole('menuitem', { name: /개인/ }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('navigation', { name: '관리 메뉴' })).toHaveCount(0)
  await expect(page.getByRole('navigation', { name: '주요 메뉴' })).toBeVisible()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('baesh.activeOrganizationId'))).toBeNull()
})
