import { expect, test } from '@playwright/test'
import { PASSWORD, USERS, UNIVERSITY, orgIds, signIn } from './support'

test.describe('로그인', () => {
  test('잘못된 비밀번호는 한국어 오류로 알리고 입력값을 유지한다', async ({ page }) => {
    await page.goto('/auth/login')
    await page.getByLabel('이메일').fill(USERS.applicant.email)
    await page.getByLabel('비밀번호').fill('wrong-password')
    await page.locator('form').getByRole('button', { name: '로그인' }).click()

    await expect(page.getByRole('alert')).toHaveText('이메일 또는 비밀번호가 올바르지 않습니다.')
    await expect(page.getByLabel('이메일')).toHaveValue(USERS.applicant.email)
    await expect(page).toHaveURL(/\/auth\/login/)
  })

  test('로그인 후 next 경로로 돌아가고, 로그아웃하면 보호된 화면에 들어갈 수 없다', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveURL(/\/auth\/login/)

    await page.goto('/auth/login?next=%2Fprojects')
    await page.getByLabel('이메일').fill(USERS.applicant.email)
    await page.getByLabel('비밀번호').fill(PASSWORD)
    await page.locator('form').getByRole('button', { name: '로그인' }).click()
    await expect(page).toHaveURL(/\/projects$/)

    await page.getByRole('button', { name: '계정 메뉴' }).click()
    await page.getByRole('menuitem', { name: '로그아웃' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('baesh.auth.token'))).toBeNull()

    await page.goto('/dashboard')
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

test.describe('권한', () => {
  test('소속이 없는 사용자는 URL을 직접 입력해도 조직 콘솔을 볼 수 없다', async ({ page }) => {
    const { university } = await orgIds(page.request)
    await signIn(page, 'outsider')
    await page.goto(`/org/${university}`)

    await expect(page).toHaveURL(/\/organizations$/)
    await expect(page.getByText('접근 권한이 없는 조직입니다.')).toBeVisible()
    await expect(page.getByRole('navigation', { name: '관리 메뉴' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` })).toHaveCount(0)
  })

  test('조직 정보 조회가 실패하면 권한 없음으로 보내지 않고 다시 시도할 수 있다', async ({ page }) => {
    const { university } = await orgIds(page.request)
    await signIn(page, 'operator')
    let fail = true
    await page.route('**/api/organizations/me', (route) => (fail ? route.fulfill({ status: 503, json: { message: '잠시 후 다시 시도해 주세요.' } }) : route.fallback()))
    await page.goto(`/org/${university}`)

    await expect(page.getByRole('heading', { name: '조직 정보를 확인하지 못했습니다' })).toBeVisible()
    await expect(page).toHaveURL(new RegExp(`/org/${university}$`))

    fail = false
    await page.getByRole('button', { name: '다시 시도' }).click()
    await expect(page.getByRole('button', { name: `작업 공간: ${UNIVERSITY}` })).toBeVisible()
  })
})
