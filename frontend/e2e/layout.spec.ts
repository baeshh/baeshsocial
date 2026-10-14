import { expect, test } from '@playwright/test'
import { UNIVERSITY, expectNoHorizontalOverflow, orgIds, signIn } from './support'

/** Breakpoints from the V2.2 spec: bottom tabs and a drawer below 768px, a 72px rail to 1023px, a 240px sidebar from 1024px. */
const VIEWPORTS = [
  { width: 320, height: 640, kind: 'mobile' },
  { width: 390, height: 844, kind: 'mobile' },
  { width: 768, height: 1024, kind: 'tablet' },
  { width: 820, height: 1180, kind: 'tablet' },
  { width: 1024, height: 768, kind: 'desktop' },
  { width: 1440, height: 900, kind: 'desktop' },
] as const

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } })

    test('개인 셸: 메뉴 위치, 이동, 가로 스크롤 없음', async ({ page }) => {
      await signIn(page, 'applicant')
      await page.goto('/dashboard')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

      const nav = page.getByRole('navigation', { name: '주요 메뉴' })
      await expect(nav).toHaveCount(1)
      const box = (await nav.boundingBox())!
      if (viewport.kind === 'mobile') expect(box.y, 'bottom tab bar').toBeGreaterThan(viewport.height / 2)
      else expect(box.y, 'top menu').toBeLessThan(80)
      await expectNoHorizontalOverflow(page)

      for (const [label, path] of [
        ['기회', /\/opportunities/],
        ['프로젝트', /\/projects$/],
        ['프로필', /\/profile/],
        ['홈', /\/dashboard$/],
      ] as const) {
        await nav.getByRole('link', { name: label }).click()
        await expect(page).toHaveURL(path)
        await expect(nav.getByRole('link', { name: label })).toHaveAttribute('aria-current', 'page')
        await expectNoHorizontalOverflow(page)
      }
    })

    test('관리 셸: 레일·사이드바·드로어와 메뉴 이동', async ({ page }) => {
      const { university } = await orgIds(page.request)
      await signIn(page, 'operator')
      await page.goto(`/org/${university}`)
      await expect(page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` })).toBeVisible()

      const menuButton = page.getByRole('button', { name: '관리 메뉴' })
      const sidebar = page.locator('aside').filter({ has: page.getByRole('navigation', { name: '관리 메뉴' }) })

      if (viewport.kind === 'mobile') {
        await expect(sidebar).toBeHidden()
        await menuButton.click()
        const drawer = page.getByRole('dialog')
        await expect(drawer).toBeVisible()
        await drawer.getByRole('link', { name: '프로그램' }).click()
        await expect(drawer).toBeHidden()
      } else {
        await expect(menuButton).toBeHidden()
        const width = (await sidebar.boundingBox())!.width
        expect(Math.round(width)).toBe(viewport.kind === 'tablet' ? 72 : 240)
        await sidebar.getByRole('link', { name: '프로그램' }).click()
      }
      await expect(page).toHaveURL(new RegExp(`/org/${university}\\?tab=programs`))
      await expect(page.getByRole('button', { name: '프로그램 만들기' })).toBeVisible()
      await expectNoHorizontalOverflow(page)

      await page.goto(`/org/${university}?tab=members`)
      await expect(page.getByRole('heading', { name: '구성원' }).first()).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })

    test('공개 화면과 기회 탐색: 가로 스크롤 없음', async ({ page }) => {
      await page.goto('/')
      await expectNoHorizontalOverflow(page)
      await page.goto('/auth/login')
      await expectNoHorizontalOverflow(page)

      await signIn(page, 'applicant')
      await page.goto('/opportunities')
      await expect(page.getByRole('searchbox', { name: '프로그램·공고 검색' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  })
}
