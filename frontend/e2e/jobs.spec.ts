import { expect, test, type Page } from '@playwright/test'
import { signIn } from './support'

const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)

test.describe('기회 탐색 필터와 URL', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'applicant')
  })

  test('필터를 바꾸면 URL에 남고 뒤로/앞으로 가기로 이전 필터가 복원된다', async ({ page }) => {
    await page.goto('/opportunities')
    const search = page.getByRole('searchbox', { name: '프로그램·공고 검색' })
    const sort = page.getByLabel('정렬')
    const chip = (name: string) => page.getByRole('button', { name, exact: true })

    await search.fill('E2E')
    await expect.poll(() => params(page)).toEqual({ q: 'E2E' })

    await chip('공모전·해커톤').click()
    await expect.poll(() => params(page)).toEqual({ q: 'E2E', category: 'competition' })

    await sort.selectOption('recent')
    await expect.poll(() => params(page)).toEqual({ q: 'E2E', category: 'competition', sort: 'recent' })

    await page.goBack()
    await expect.poll(() => params(page)).toEqual({ q: 'E2E', category: 'competition' })
    await expect(sort).toHaveValue('recommended')
    await expect(chip('공모전·해커톤')).toHaveAttribute('aria-pressed', 'true')

    await page.goBack()
    await expect.poll(() => params(page)).toEqual({ q: 'E2E' })
    await expect(chip('전체')).toHaveAttribute('aria-pressed', 'true')
    await expect(search).toHaveValue('E2E')

    await page.goForward()
    await expect.poll(() => params(page)).toEqual({ q: 'E2E', category: 'competition' })
    await expect(chip('공모전·해커톤')).toHaveAttribute('aria-pressed', 'true')

    await page.reload()
    await expect(search).toHaveValue('E2E')
    await expect(chip('공모전·해커톤')).toHaveAttribute('aria-pressed', 'true')
  })

  test('검색어 입력은 기록을 쌓지 않고, 뒤로 가기는 검색창도 되돌린다', async ({ page }) => {
    await page.goto('/dashboard')
    await page.goto('/opportunities?category=education')
    const search = page.getByRole('searchbox', { name: '프로그램·공고 검색' })

    await search.pressSequentially('캡스톤', { delay: 40 })
    await expect.poll(() => params(page)).toEqual({ category: 'education', q: '캡스톤' })
    await page.getByRole('button', { name: '모집 중만' }).click()
    await expect.poll(() => params(page)).toEqual({ category: 'education', q: '캡스톤', open: '1' })

    await page.goBack()
    await expect.poll(() => params(page)).toEqual({ category: 'education', q: '캡스톤' })
    await expect(search).toHaveValue('캡스톤')

    // Typing replaced the entry instead of pushing one per keystroke, so one more step leaves the page.
    await page.goBack()
    await expect(page).toHaveURL(/\/dashboard$/)
    await page.goForward()
    await expect.poll(() => params(page)).toEqual({ category: 'education', q: '캡스톤' })
    await expect(search).toHaveValue('캡스톤')
  })

  test('상단 메뉴의 기회를 다시 누르면 필터가 초기화된다', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/opportunities?q=data&category=job&sort=deadline')
    const search = page.getByRole('searchbox', { name: '프로그램·공고 검색' })
    await expect(search).toHaveValue('data')

    await page.getByRole('navigation', { name: '주요 메뉴' }).getByRole('link', { name: '기회' }).click()
    await expect.poll(() => params(page)).toEqual({})
    await expect(search).toHaveValue('')
    await expect(page.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('정렬')).toHaveValue('recommended')
  })

  test('잘못된 URL 값은 기본값으로 처리된다', async ({ page }) => {
    await page.goto('/opportunities?category=nope&sort=bogus')
    await expect(page.getByRole('button', { name: '전체', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('정렬')).toHaveValue('recommended')
  })
})
