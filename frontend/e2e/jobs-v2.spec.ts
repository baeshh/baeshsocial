import { expect, test, type Page } from '@playwright/test'
import {
  API,
  JOBS_PROGRAM,
  POSTINGS,
  apiGet,
  apiToken,
  expectNoA11yViolations,
  expectNoHorizontalOverflow,
  expectToast,
  orgIds,
  signIn,
} from './support'

const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)
const programsGroup = (page: Page) => page.getByRole('region', { name: /^기관 운영 프로그램/ })
const postingsGroup = (page: Page) => page.getByRole('region', { name: /^일반 공고/ })
const card = (page: Page, title: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })

type Page1 = { total: number }

async function postingId(page: Page, title: string) {
  const { opportunities } = await apiGet<{ opportunities: { id: string; title: string }[] }>(
    page.request,
    'applicant',
    `/opportunities?q=${encodeURIComponent(title)}`,
  )
  const found = opportunities.find((item) => item.title === title)
  expect(found, title).toBeTruthy()
  return found!.id
}

test.describe('Jobs 탐색 화면', () => {
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'applicant')
  })

  test('데스크톱: 두 출처를 따로 보여 주고, 요약 개수는 서버 total의 합이다', async ({ page }) => {
    const programs = await apiGet<Page1>(page.request, 'applicant', '/programs/discover?page=1&pageSize=6')
    const postings = await apiGet<Page1>(page.request, 'applicant', '/opportunities?page=1&pageSize=8')
    await page.goto('/opportunities')

    await expect(page.getByRole('heading', { level: 1, name: '나에게 맞는 기회 찾기' })).toBeVisible()
    await expect(page.getByText(`총 ${programs.total + postings.total}개 · 기관 프로그램 ${programs.total} · 일반 공고 ${postings.total}`)).toBeVisible()
    await expect(programsGroup(page).getByText('추천 점수가 없어')).toBeVisible()
    await expect(postingsGroup(page).getByText('내 프로필 스킬과 겹치는 비율이 높은 순')).toBeVisible()
    await expect(page.getByRole('complementary', { name: '상세 필터' })).toBeVisible()

    const program = card(page, JOBS_PROGRAM)
    await expect(program.getByText('기관 운영 프로그램')).toBeVisible()
    await expect(program.getByText('인증 기관')).toBeVisible()
    await expect(program.getByText('모집 중')).toBeVisible()

    const internship = card(page, POSTINGS.internship)
    await expect(internship.getByText('인턴십 공고')).toBeVisible()
    await expect(internship.getByText('외부 지원')).toBeVisible()
    await expect(internship.getByText('내 스킬 일치: React')).toBeVisible()
    await expect(card(page, POSTINGS.education).getByText('BAESH 신청')).toBeVisible()
    await expect(card(page, POSTINGS.closed).getByText('마감', { exact: true })).toBeVisible()
    await expect(page.getByText('AI RADAR')).toHaveCount(0)
  })

  test('결과 유형과 상세 필터가 URL에 남고 뒤로 가기·새로고침으로 복원된다', async ({ page }) => {
    await page.goto('/opportunities')
    await page.getByRole('radio', { name: '일반 공고' }).click()
    await expect.poll(() => params(page)).toEqual({ source: 'postings' })
    await expect(programsGroup(page)).toHaveCount(0)

    await page.getByRole('button', { name: 'React', exact: true }).click()
    await expect.poll(() => params(page)).toEqual({ source: 'postings', skill: 'React' })
    await expect(card(page, POSTINGS.internship)).toBeVisible()
    await expect(card(page, POSTINGS.education)).toHaveCount(0)

    await page.goBack()
    await expect.poll(() => params(page)).toEqual({ source: 'postings' })
    await expect(page.getByRole('button', { name: 'React', exact: true })).toHaveAttribute('aria-pressed', 'false')
    await expect(card(page, POSTINGS.education)).toBeVisible()

    await page.goForward()
    await page.reload()
    await expect(page.getByRole('radio', { name: '일반 공고' })).toBeChecked()
    await expect(page.getByRole('button', { name: 'React', exact: true })).toHaveAttribute('aria-pressed', 'true')
  })

  test('한쪽에만 있는 조건을 고르면 다른 쪽은 빠지고 이유를 알려 준다', async ({ page }) => {
    await page.goto('/opportunities')
    // Filters live in the URL, so the control shows its new state once the navigation commits.
    await page.getByRole('checkbox', { name: '원격 근무 가능' }).click()
    await expect(page.getByRole('checkbox', { name: '원격 근무 가능' })).toBeChecked()
    await expect(page.getByText('일반 공고 조건(스킬·원격·저장)이 적용되어 기관 프로그램은 결과에서 뺐습니다.')).toBeVisible()
    await expect(programsGroup(page)).toHaveCount(0)
    await expect(card(page, POSTINGS.education)).toBeVisible()
    await expect(card(page, POSTINGS.internship)).toHaveCount(0)

    await page.goto('/opportunities?mode=online')
    await expect(page.getByText('기관 프로그램 조건(진행 방식·지원 대상)이 적용되어 일반 공고는 결과에서 뺐습니다.')).toBeVisible()
    await expect(postingsGroup(page)).toHaveCount(0)
    await expect(card(page, JOBS_PROGRAM)).toBeVisible()

    await page.goto('/opportunities?category=job')
    await expect(page.getByText('‘채용’ 분류에는 기관 프로그램이 없어 일반 공고만 보여 줍니다.')).toBeVisible()
  })

  test('모바일: 카테고리는 가로로 넘기고, 상세 필터는 대화상자로 연다', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/opportunities')
    await expect(page.getByRole('complementary', { name: '상세 필터' })).toBeHidden()
    const chips = page.getByRole('group', { name: '분류' })
    expect(await chips.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true)
    await expectNoHorizontalOverflow(page)

    await page.getByRole('button', { name: /^상세 필터/ }).click()
    const dialog = page.getByRole('dialog', { name: '상세 필터' })
    await dialog.getByRole('radio', { name: '기관 운영 프로그램' }).click()
    await expect(dialog.getByRole('radio', { name: '기관 운영 프로그램' })).toBeChecked()
    await expect.poll(() => params(page)).toEqual({ source: 'programs' })
    await dialog.getByRole('button', { name: '결과 보기' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('button', { name: /^상세 필터/ })).toContainText('1')
    await expect(postingsGroup(page)).toHaveCount(0)

    // Title, organisation, deadline and status come first on a phone card.
    const program = card(page, JOBS_PROGRAM)
    await expect(program.getByText('E2E 대학교')).toBeVisible()
    await expect(program.getByText(/모집 마감/)).toBeVisible()
    await expect(program.getByText('모집 중')).toBeVisible()
  })

  test('검색 결과가 없으면 빈 화면과 조건 초기화를 보여 준다', async ({ page }) => {
    await page.goto('/opportunities?q=zz-없는-검색어-zz&open=1')
    await expect(page.getByRole('heading', { name: '조건에 맞는 기회가 없습니다' })).toBeVisible()
    await page.getByRole('button', { name: '검색 조건 초기화' }).click()
    await expect.poll(() => params(page)).toEqual({})
    await expect(page.getByRole('searchbox', { name: '프로그램·공고 검색' })).toHaveValue('')
    await expect(card(page, JOBS_PROGRAM)).toBeVisible()
  })

  test('공고 목록이 실패하면 오류와 다시 시도를, 느리면 로딩을 보여 준다', async ({ page }) => {
    let fail = true
    await page.route('**/api/opportunities?*', (route) => (fail ? route.fulfill({ status: 500, json: { message: '서버 오류' } }) : route.fallback()))
    let release!: () => void
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route('**/api/programs/discover?*', async (route) => {
      await held
      await route.fallback()
    })
    await page.goto('/opportunities')
    await expect(page.getByRole('status').filter({ hasText: '기관 운영 프로그램 불러오는 중' })).toBeVisible()
    release()
    await expect(card(page, JOBS_PROGRAM)).toBeVisible()

    const alert = postingsGroup(page).getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 15_000 })
    await expect(page.getByText('일부 결과를 불러오지 못했습니다')).toBeVisible()
    fail = false
    await alert.getByRole('button', { name: '다시 시도' }).click()
    await expect(card(page, POSTINGS.internship)).toBeVisible()
  })

  test('추천 근거는 실제로 일치한 스킬만 보여 준다', async ({ page }) => {
    await page.goto('/opportunities?source=postings')
    await expect(card(page, POSTINGS.internship).getByText('내 스킬 일치: React')).toBeVisible()
    await expect(card(page, POSTINGS.education).getByText(/내 스킬 일치/)).toHaveCount(0)
    await expect(page.getByText('프로필에 등록한 스킬이 없어')).toHaveCount(0)
  })
})

test('프로필 스킬이 없으면 추천순이 개인화되지 않는다고 안내하고 일치 표시를 하지 않는다', async ({ page }) => {
  await signIn(page, 'outsider')
  await page.goto('/opportunities?source=postings')
  await expect(page.getByText('프로필에 등록한 스킬이 없어 추천순이 개인화되지 않습니다.')).toBeVisible()
  await expect(page.getByText(/내 스킬 일치/)).toHaveCount(0)
})

test.describe('Jobs 상세·지원', () => {
  test('일반 공고 상세: 실제 필드와 외부 지원 안내, 저장과 해제, 목록으로 돌아가기', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.goto('/opportunities?category=internship')
    await card(page, POSTINGS.internship).getByRole('link', { name: /상세 보기/ }).click()
    await expect(page).toHaveURL(/\/opportunities\/[^/?]+$/)
    await expect(page.getByRole('heading', { level: 1, name: POSTINGS.internship })).toBeVisible()
    await expect(page.getByText('기관·회사명은 등록자가 입력한 정보로')).toBeVisible()
    await expect(page.getByText('React와 TypeScript로 사내 서비스를 함께 만드는 인턴십입니다.')).toBeVisible()
    await expect(page.getByText('내 프로필 스킬 1개가 요구 스킬과 일치합니다.')).toBeVisible()

    const external = page.getByRole('link', { name: /외부 사이트에서 지원/ })
    await expect(external).toHaveAttribute('href', 'https://example.com/apply/frontend-intern')
    await expect(external).toHaveAttribute('target', '_blank')
    await expect(external).toHaveAttribute('rel', /noopener/)
    await expect(page.getByText('BAESH에 기록되지 않으니')).toBeVisible()
    await expect(page.getByRole('button', { name: /참여 신청/ })).toHaveCount(0)

    await page.getByRole('button', { name: '저장하기' }).click()
    await expectToast(page, '공고를 저장했습니다')
    await expect(page.getByRole('button', { name: '저장됨' })).toBeVisible()

    await page.getByRole('link', { name: '기회 탐색으로' }).click()
    await expect.poll(() => params(page)).toEqual({ category: 'internship' })
    const bookmark = card(page, POSTINGS.internship).getByRole('button', { name: `${POSTINGS.internship} 저장` })
    await expect(bookmark).toHaveAttribute('aria-pressed', 'true')

    await page.goto('/opportunities?saved=1')
    await expect(card(page, POSTINGS.internship)).toBeVisible()
    await expect(card(page, POSTINGS.education)).toHaveCount(0)
    await card(page, POSTINGS.internship).getByRole('button', { name: `${POSTINGS.internship} 저장` }).click()
    await expectToast(page, '저장을 취소했습니다')
    await expect(page.getByRole('heading', { name: '조건에 맞는 기회가 없습니다' })).toBeVisible()

    // Opening an external link never shows up as an application in BAESH.
    await page.goto('/opportunities?tab=my')
    await expect(page.getByRole('heading', { name: POSTINGS.internship })).toHaveCount(0)
  })

  test('주소로 바로 연 상세와 없는 공고', async ({ page }) => {
    await signIn(page, 'applicant')
    const id = await postingId(page, POSTINGS.closed)
    await page.goto(`/opportunities/${id}`)
    await expect(page.getByRole('heading', { level: 1, name: POSTINGS.closed })).toBeVisible()
    await expect(page.getByText('마감', { exact: true }).first()).toBeVisible()
    await page.getByRole('link', { name: '기회 탐색으로' }).click()
    await expect(page).toHaveURL(/\/opportunities$/)

    await page.goto('/opportunities/does-not-exist')
    await expect(page.getByRole('heading', { name: '공고를 찾을 수 없습니다' })).toBeVisible()
  })

  test('BAESH 신청형 공고: 신청하고 내 지원 현황에서 확인한 뒤 취소한다', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.goto(`/opportunities/${await postingId(page, POSTINGS.education)}`)
    await page.getByRole('button', { name: /참여 신청$/ }).click()
    await expectToast(page, '참여 신청을 보냈습니다')
    await expect(page.getByText('내 신청 상태:')).toContainText('신청 대기')

    await page.goto('/opportunities?tab=my')
    await page.getByRole('button', { name: /^지원 완료·심사 중/ }).click()
    await expect.poll(() => params(page)).toEqual({ tab: 'my', status: 'review' })
    const item = card(page, POSTINGS.education)
    await expect(item.getByText('신청 대기')).toBeVisible()
    await expect(item.getByText('교육 공고')).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await item.getByRole('button', { name: '신청 취소' }).click()
    await expectToast(page, '신청을 취소했습니다')
    await expect(item).toHaveCount(0)
    await expect(page.getByText('‘지원 완료·심사 중’ 단계의 지원이 없습니다')).toBeVisible()

    await page.goBack()
    await expect.poll(() => params(page)).toEqual({ tab: 'my' })
  })

  test('기관 프로그램: 카드에서 상세로 가서 지원하고, 내 지원 현황에서 심사 중으로 보인다', async ({ page }) => {
    await signIn(page, 'member')
    await page.goto('/opportunities?source=programs')
    await card(page, JOBS_PROGRAM).getByRole('link', { name: /지원하기/ }).click()
    await expect(page).toHaveURL(/\/programs\/[^/]+#apply$/)
    await page.getByRole('textbox', { name: /지원 동기/ }).fill('Jobs 화면에서 찾아 지원합니다.')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: '제출하기' }).click()
    await expectToast(page, '지원서를 제출했습니다')

    await page.goto('/opportunities?source=programs')
    await expect(card(page, JOBS_PROGRAM).getByText('심사 중')).toBeVisible()
    await expect(card(page, JOBS_PROGRAM).getByRole('link', { name: /지원하기/ })).toHaveCount(0)

    await page.goto('/opportunities?tab=my&status=review')
    const item = card(page, JOBS_PROGRAM)
    await expect(item.getByText('기관 운영 프로그램')).toBeVisible()
    await expect(item.getByText('심사 중')).toBeVisible()
    await expect(item.getByRole('link', { name: /지원서 보기·취소/ })).toBeVisible()
  })
})

test.describe('Jobs 권한과 관리 분리', () => {
  test('일반 사용자: 관리 메뉴와 등록 폼이 없고, 관리 화면과 API 모두 거부된다', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.goto('/opportunities')
    await expect(page.getByRole('link', { name: '공고 관리' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '일반 공고 등록' })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: '프로그램 참여·수료 관리' })).toHaveCount(0)

    await page.goto('/opportunities/manage')
    await expect(page.getByRole('heading', { name: '공고를 관리할 권한이 없습니다' })).toBeVisible()
    await expect(page.getByRole('button', { name: '공고 등록' })).toHaveCount(0)

    const response = await page.request.post(`${API}/opportunities`, {
      headers: { Authorization: `Bearer ${await apiToken(page.request, 'applicant')}` },
      data: { title: '권한 없는 등록', type: 'job', organization: 'x', description: 'x', skills: [], isRemote: false },
    })
    expect(response.status()).toBe(403)
  })

  test('기관 계정: Jobs와 워크스페이스에서 관리 화면으로 가서 공고를 등록한다', async ({ page }) => {
    const { university } = await orgIds(page.request)
    await signIn(page, 'operator')
    await page.goto(`/org/${university}?tab=programs`)
    await expect(page.getByRole('link', { name: '일반 공고 관리' })).toHaveAttribute('href', '/opportunities/manage')

    await page.goto('/opportunities')
    await expect(page.getByRole('heading', { name: '일반 공고 등록' })).toHaveCount(0)
    await page.getByRole('link', { name: '공고 관리' }).click()
    await expect(page).toHaveURL(/\/opportunities\/manage$/)
    await expect(page.getByRole('heading', { name: '프로그램 참여·수료 관리' })).toBeVisible()

    const title = `E2E 신규 공고 ${Date.now()}`
    await page.getByLabel('제목').fill(title)
    await page.getByLabel('기관/회사').fill('E2E 테크')
    await page.getByLabel('타입').selectOption('job')
    await page.getByLabel('기술스택').fill('Go, Kubernetes')
    await page.getByLabel('지원 링크').fill('https://example.com/apply/new')
    await page.getByLabel('설명').fill('관리 화면에서 등록한 공고입니다.')
    await page.getByRole('button', { name: '공고 등록' }).click()
    await expectToast(page, '공고를 등록했습니다')
    await page.getByRole('link', { name: '등록한 공고 보기' }).click()
    await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
    await expect(page.getByRole('heading', { name: '공고 관리' })).toBeVisible()

    page.once('dialog', (dialog) => void dialog.accept())
    await page.getByRole('button', { name: '공고 삭제' }).click()
    await expectToast(page, '공고를 삭제했습니다')
    await expect(page).toHaveURL(/\/opportunities$/)
  })
})

test.describe('Jobs 반응형·키보드·접근성', () => {
  for (const width of [320, 390, 768, 820, 1024, 1440]) {
    test(`${width}px: 탐색·상세·내 지원 현황에 가로 넘침이 없다`, async ({ page }) => {
      await signIn(page, 'applicant')
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/opportunities')
      await expect(card(page, JOBS_PROGRAM)).toBeVisible()
      await expect(page.getByRole('complementary', { name: '상세 필터' })).toBeVisible({ visible: width >= 1024 })
      await expectNoHorizontalOverflow(page)

      await page.goto(`/opportunities/${await postingId(page, POSTINGS.internship)}`)
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await expectNoHorizontalOverflow(page)

      await page.goto('/opportunities?tab=my')
      await expect(page.getByRole('group', { name: '지원 단계' })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    })
  }

  test('키보드로 분류와 상세 필터를 조작하고, 대화상자는 Esc로 닫혀 초점이 돌아온다', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.setViewportSize({ width: 820, height: 900 })
    await page.goto('/opportunities')
    const chip = page.getByRole('button', { name: '교육·연수', exact: true })
    await chip.focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => params(page)).toEqual({ category: 'education' })
    await expect(chip).toHaveAttribute('aria-pressed', 'true')

    const opener = page.getByRole('button', { name: /^상세 필터/ })
    await opener.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('dialog', { name: '상세 필터' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(opener).toBeFocused()

    await page.getByRole('searchbox', { name: '프로그램·공고 검색' }).focus()
    await page.keyboard.press('Tab')
    await expect(opener).toBeFocused()
    await page.keyboard.press('Tab')
    await expect(page.getByLabel('정렬')).toBeFocused()
  })

  test('axe: 탐색·상세·내 지원 현황·관리 화면', async ({ page }) => {
    await signIn(page, 'applicant')
    await page.goto('/opportunities')
    await expect(card(page, POSTINGS.internship)).toBeVisible()
    await expectNoA11yViolations(page)

    await page.goto(`/opportunities/${await postingId(page, POSTINGS.education)}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.goto('/opportunities?tab=my')
    await expect(page.getByRole('group', { name: '지원 단계' })).toBeVisible()
    await expectNoA11yViolations(page)

    await page.goto('/opportunities/manage')
    await expect(page.getByRole('heading', { name: '공고를 관리할 권한이 없습니다' })).toBeVisible()
    await expectNoA11yViolations(page)
  })
})
