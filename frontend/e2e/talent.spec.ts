import { expect, test } from '@playwright/test'
import { API, apiToken, expectNoA11yViolations, signIn } from './support'

/**
 * The company operator searches for a consenting applicant, then the applicant hides the matched project from
 * their profile: the saved search must drop the project's title, skill evidence and AI text, and say it re-scored.
 */
test('Talent DB: 후보가 프로젝트를 숨기면 저장된 검색에서도 제목·근거·추천 이유가 빠지고 재계산 안내가 보인다', async ({ page, request }) => {
  const title = 'E2E 공개 코틀린 앱'
  const headers = { Authorization: `Bearer ${await apiToken(request, 'applicant')}` }
  const created = await request.post(`${API}/projects`, { headers, data: { title, visibility: 'public', skills: ['Kotlin'] } })
  expect(created.ok()).toBeTruthy()
  const projectId = ((await created.json()) as { project: { id: string } }).project.id
  expect((await request.patch(`${API}/profiles/me`, { headers, data: { talentSearchOptIn: true, skills: ['React', 'Kotlin'] } })).ok()).toBeTruthy()

  await signIn(page, 'operator')
  await page.goto('/talent-db')
  await page.getByLabel('검색 이름').fill('E2E 코틀린 개발자')
  await page.getByLabel('요구 기술 (쉼표로 구분)').fill('Kotlin')
  await page.getByRole('button', { name: '후보 찾기' }).click()
  await expect(page.getByRole('link', { name: '박지원', exact: true })).toBeVisible()
  await expect(page.getByText(title).first()).toBeVisible()
  await expect(page.getByRole('note')).toHaveCount(0)

  expect((await request.put(`${API}/projects/${projectId}/profile-display`, { headers, data: { hidden: true } })).ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByRole('link', { name: '박지원', exact: true })).toBeVisible()
  await expect(page.getByRole('note')).toContainText('지금 공개된 정보만으로 점수와 추천 이유를 다시 계산했습니다.')
  await expect(page.getByText(title)).toHaveCount(0)
  await expect(page.getByText('Kotlin (프로필)')).toBeVisible()
  await expectNoA11yViolations(page)

  expect((await request.patch(`${API}/profiles/me`, { headers, data: { talentSearchOptIn: false } })).ok()).toBeTruthy()
  await page.reload()
  await expect(page.getByText('이 후보는 인재 검색 동의를 철회해 더 이상 표시되지 않습니다.')).toBeVisible()
  await expect(page.getByRole('link', { name: '박지원', exact: true })).toHaveCount(0)
})
