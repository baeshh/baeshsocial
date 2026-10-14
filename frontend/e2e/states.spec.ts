import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'
import { orgIds, signIn } from './support'

test.describe('로딩·오류·빈 화면', () => {
  test('홈: 느린 응답은 로딩으로 알리고, 데이터가 없으면 빈 상태를 보여준다', async ({ page }) => {
    await signIn(page, 'outsider')
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/projects?*', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/dashboard')

    const projects = page.getByRole('region', { name: '최근 프로젝트' })
    await expect(projects.getByRole('status')).toHaveText('불러오는 중')
    release()
    await expect(projects.getByText('아직 프로젝트가 없습니다.')).toBeVisible()
    await expect(page.getByText('진행 중인 지원이 없습니다.')).toBeVisible()
  })

  test('홈: 요청이 실패하면 알리고 다시 시도로 복구된다', async ({ page }) => {
    await signIn(page, 'outsider')
    let fail = true
    await page.route('**/api/projects?*', (route) => (fail ? route.fulfill({ status: 500, json: { message: 'boom' } }) : route.fallback()))
    await page.goto('/dashboard')

    const projects = page.getByRole('region', { name: '최근 프로젝트' })
    const alert = projects.getByRole('alert')
    await expect(alert).toHaveText(/불러오지 못했습니다\./, { timeout: 15_000 })
    fail = false
    await alert.getByRole('button', { name: '다시 시도' }).click()
    await expect(projects.getByText('아직 프로젝트가 없습니다.')).toBeVisible()
  })

  test('조직 콘솔: 프로그램 목록이 실패하면 오류와 다시 시도를 보여준다', async ({ page }) => {
    const { company } = await orgIds(page.request)
    await signIn(page, 'operator')
    let fail = true
    await page.route(`**/api/organizations/${company}/programs`, (route) =>
      fail ? route.fulfill({ status: 500, json: { message: '프로그램 목록을 불러오지 못했습니다.' } }) : route.fallback(),
    )
    await page.goto(`/org/${company}?tab=programs`)

    const alert = page.getByRole('alert').filter({ hasText: '프로그램 목록을 불러오지 못했습니다.' })
    await expect(alert).toBeVisible({ timeout: 15_000 })
    fail = false
    await alert.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.getByRole('button', { name: '프로그램 만들기' })).toBeVisible()
  })
})

/** WCAG A/AA rules that a markup change can fix; contrast is tracked separately against the design tokens. */
async function expectNoA11yViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .disableRules(['color-contrast'])
    .analyze()
  const summary = violations.map((v) => `${v.impact} ${v.id}: ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`)
  expect(summary).toEqual([])
}

test.describe('접근성 (axe)', () => {
  test('공개 화면', async ({ page }) => {
    await page.goto('/auth/login')
    await expect(page.getByLabel('이메일')).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('개인 홈과 기회 탐색', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.goto('/dashboard')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expect(page.getByRole('status')).toHaveCount(0)
    await expectNoA11yViolations(page)

    await page.goto('/opportunities')
    await expect(page.getByRole('searchbox', { name: '프로그램·공고 검색' })).toBeVisible()
    await expectNoA11yViolations(page)
  })

  test('조직 콘솔', async ({ page }) => {
    const { university } = await orgIds(page.request)
    await signIn(page, 'operator')
    await page.goto(`/org/${university}`)
    await expect(page.getByRole('navigation', { name: '관리 메뉴' })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.goto(`/org/${university}?tab=programs`)
    await expect(page.getByRole('button', { name: '프로그램 만들기' })).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
