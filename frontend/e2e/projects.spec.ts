import { expect, test, type Browser, type Page } from '@playwright/test'
import {
  API,
  MOVE_TARGET,
  PASSWORD,
  PROJECTS,
  UNIVERSITY,
  apiGet,
  apiToken,
  expectNoA11yViolations,
  expectNoHorizontalOverflow,
  expectToast,
  signIn,
  type Role,
} from './support'

/**
 * Projects list and workspace against the seeded world: the applicant's private personal project (member is an
 * editor without private access) and a team project of an active program led by member, reviewed by the operator.
 * Later tests build on earlier ones (private access, evidence), so the file runs in order.
 */
test.describe.configure({ mode: 'serial' })

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const WIDTHS = [320, 390, 768, 820, 1024, 1440]

const card = (page: Page, title: string) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: title }) })
const tabNav = (page: Page) => page.getByRole('navigation', { name: '프로젝트 메뉴' })
const tab = (page: Page, label: string) => tabNav(page).getByRole('button', { name: new RegExp(`^${label}`) })
const params = (page: Page) => Object.fromEntries(new URL(page.url()).searchParams)

async function projectId(page: Page, role: Role, title: string) {
  const { projects } = await apiGet<{ projects: { id: string; title: string }[] }>(page.request, role, `/projects?q=${encodeURIComponent(title)}`)
  const found = projects.find((project) => project.title === title)
  expect(found, title).toBeTruthy()
  return found!.id
}

async function pageAs(browser: Browser, role: Role, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ locale: 'ko-KR', timezoneId: 'Asia/Seoul', viewport })
  const page = await context.newPage()
  await signIn(page, role)
  return page
}

test('목록: 카드에 상태·구분·팀이 입력한 진행률·다음 작업·내 역할을 보여 주고, 필터는 URL에 남는다', async ({ page }) => {
  await signIn(page, 'applicant')
  await page.goto('/projects')
  await expect(page.getByRole('heading', { level: 1, name: '프로젝트' })).toBeVisible()

  const privateCard = card(page, PROJECTS.private)
  await expect(privateCard.getByText('진행 중', { exact: true })).toBeVisible()
  await expect(privateCard.getByText('개인 프로젝트', { exact: true })).toBeVisible()
  await expect(privateCard.getByRole('progressbar', { name: '팀이 입력한 진행률' })).toHaveAttribute('aria-valuenow', '40')
  await expect(privateCard).toContainText('작업 완료 1/2')
  await expect(privateCard).toContainText('다음 작업E2E 로그인 API 연결')
  await expect(privateCard).toContainText('내 역할 소유자')
  await expect(page.getByText(/건강도|Health|On Track/)).toHaveCount(0)

  await page.getByLabel('구분').selectOption('program')
  await expect(page).toHaveURL(/kind=program/)
  await expect(privateCard).toHaveCount(0)
  await page.goBack()
  await expect(privateCard).toBeVisible()

  await page.getByRole('group', { name: '진행 상태' }).getByRole('button', { name: /^완료/ }).click()
  expect(params(page)).toMatchObject({ status: 'completed' })
  await expect(page.getByRole('heading', { name: '조건에 맞는 프로젝트가 없습니다' })).toBeVisible()
  await page.getByRole('button', { name: '조건 초기화' }).first().click()

  await page.getByRole('searchbox', { name: '프로젝트 검색' }).fill('비공개 개인')
  await expect(page).toHaveURL(/q=/)
  await expect(page.getByRole('article')).toHaveCount(1)
  await expect(privateCard).toBeVisible()
  await page.reload()
  await expect(page.getByRole('searchbox', { name: '프로젝트 검색' })).toHaveValue('비공개 개인')
  await expect(privateCard).toBeVisible()
})

test('생성: 새 프로젝트를 만들면 상세로 이동하고, 기본 정보·진행 상태·작업·활동을 바로 기록한다', async ({ page }) => {
  const title = `E2E 새 프로젝트 ${Date.now().toString(36)}`
  await signIn(page, 'applicant')
  await page.goto('/projects')
  await page.getByRole('button', { name: '새 프로젝트' }).first().click()
  const dialog = page.getByRole('dialog', { name: '새 프로젝트' })
  await dialog.getByLabel('프로젝트명').fill(title)
  await dialog.getByLabel('공개 범위').selectOption('team')
  await dialog.getByRole('button', { name: '만들기' }).click()

  await expect(page).toHaveURL(/\/projects\/[^/?]+$/)
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  for (const label of ['개요', '작업', '팀원', '활동', '파일', '증빙', '설정']) await expect(tab(page, label)).toBeVisible()
  await expect(tab(page, '기관 검증')).toHaveCount(0)
  await expect(page.getByText('진행률은 팀이 설정에서 직접 입력한 값으로, 작업 완료 수로 자동 계산되지 않습니다.')).toBeVisible()

  await tab(page, '설정').click()
  expect(params(page)).toEqual({ tab: 'settings' })
  const info = page.getByRole('form', { name: '기본 정보' })
  await info.getByLabel('한 줄 설명').fill('E2E로 만든 프로젝트 설명')
  await info.getByRole('button', { name: '기본 정보 저장' }).click()
  await expectToast(page, '기본 정보를 저장했습니다.')
  const progress = page.getByRole('form', { name: '진행 상태' })
  await progress.getByLabel('단계').selectOption('ACTIVE')
  await progress.getByLabel('진행률 (%)').fill('60')
  await progress.getByRole('button', { name: '진행 상태 저장' }).click()
  await expectToast(page, '진행 상태를 저장했습니다.')
  await expect(page.getByRole('group', { name: '진행 요약' })).toContainText('60%')
  await expect(page.getByText('E2E로 만든 프로젝트 설명').first()).toBeVisible()

  await tab(page, '작업').click()
  await page.getByRole('button', { name: '작업 추가' }).first().click()
  const form = page.getByRole('form', { name: '새 작업' })
  await expect(form.getByLabel('작업 이름')).toBeFocused()
  await form.getByLabel('작업 이름').fill('E2E 첫 작업')
  await form.getByLabel('담당자').selectOption({ label: '박지원' })
  await form.getByRole('button', { name: '작업 추가' }).click()
  await expectToast(page, '작업을 추가했습니다.')
  const tasks = page.getByRole('list', { name: '작업 목록' })
  await expect(tasks).toContainText('담당 박지원')
  await tasks.getByLabel('E2E 첫 작업 상태').selectOption('blocked')
  await expect(page.getByRole('group', { name: '작업 상태' }).getByRole('button', { name: '차단됨 1' })).toBeVisible()
  await expect(page.getByRole('group', { name: '진행 요약' })).toContainText('0/1')

  await tab(page, '활동').click()
  await expect(page.getByText('기관 검증을 거치지 않은 자기 기록입니다.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: '활동 기록' }).click()
  const activity = page.getByRole('form', { name: '새 활동' })
  await activity.getByLabel('제목', { exact: true }).fill('E2E 첫 회의')
  await activity.getByRole('button', { name: '기록하기' }).click()
  await expect(page.getByRole('list', { name: '활동 목록' })).toContainText('E2E 첫 회의')

  await tab(page, '증빙').click()
  await expect(page.getByText('개인 프로젝트에서는 활동 증빙 제출과 기관 검증을 사용할 수 없습니다.', { exact: false })).toBeVisible()
  await expect(page.getByRole('button', { name: '증빙 작성' })).toHaveCount(0)

  const url = page.url().split('?')[0]
  await page.goto('/projects')
  const created = card(page, title)
  await expect(created).toContainText('작업 완료 0/1')
  await expect(created).toContainText('다음 작업E2E 첫 작업')
  await expect(created.getByRole('progressbar', { name: '팀이 입력한 진행률' })).toHaveAttribute('aria-valuenow', '60')

  await page.goto(`${url}?tab=settings`)
  const removal = page.getByRole('region', { name: '프로젝트 삭제' })
  await expect(removal).toContainText(/작업 1개, 활동 \d+개, 파일 0개, 외부 링크 0개가 함께 삭제됩니다\./)
  await removal.getByRole('button', { name: '프로젝트 삭제' }).click()
  const confirm = page.getByRole('dialog', { name: '프로젝트 삭제' })
  await expect(confirm.getByRole('checkbox')).toHaveCount(0)
  await confirm.getByLabel('비밀번호').fill(PASSWORD)
  await confirm.getByRole('button', { name: '삭제 확인' }).click()
  await expect(page).toHaveURL(/\/projects$/)
  await expect(card(page, title)).toHaveCount(0)
})

test('권한: 비공개 열람이 없는 팀원은 내용을 못 보고, 팀장이 허용하면 바뀐 역할의 권한만큼 본다', async ({ browser }) => {
  const owner = await pageAs(browser, 'applicant')
  const id = await projectId(owner, 'applicant', PROJECTS.private)

  const member = await pageAs(browser, 'member')
  await member.goto(`/projects/${id}`)
  await expect(member.getByRole('heading', { level: 1, name: PROJECTS.private })).toBeVisible()
  await expect(member.getByText('팀장이 비공개로 설정한 프로젝트입니다.', { exact: false })).toBeVisible()
  await expect(tab(member, '작업')).toHaveCount(0)
  await expect(tab(member, '설정')).toHaveCount(0)
  await expect(member.getByText('E2E 로그인 API 연결')).toHaveCount(0)
  await member.goto(`/projects/${id}?tab=tasks`)
  await expect(tab(member, '개요')).toHaveAttribute('aria-current', 'page')

  const outsider = await pageAs(browser, 'outsider')
  await outsider.goto(`/projects/${id}`)
  await expect(outsider.getByRole('heading', { name: '프로젝트를 찾을 수 없습니다' })).toBeVisible()
  await outsider.context().close()

  await owner.goto(`/projects/${id}?tab=members`)
  const members = owner.getByRole('list', { name: '팀원 목록' })
  await expect(members).toContainText('소유자')
  await expect(members).toContainText('할 수 있는 일:')
  await members.getByLabel('김구성 역할').selectOption({ label: '뷰어' })
  await expectToast(owner, '역할을 변경했습니다.')
  await members.getByLabel('김구성 비공개 열람 허용').click()
  await expect(members.getByLabel('김구성 비공개 열람 허용')).toBeChecked()

  await member.reload()
  await expect(tab(member, '작업')).toBeVisible()
  await expect(tab(member, '설정')).toHaveCount(0)
  await tab(member, '작업').click()
  await expect(member.getByRole('list', { name: '작업 목록' })).toContainText('E2E 로그인 API 연결')
  await expect(member.getByRole('button', { name: '작업 추가' })).toHaveCount(0)
  await expect(member.getByLabel('E2E 로그인 API 연결 상태')).toHaveCount(0)
  await tab(member, '팀원').click()
  await expect(member.getByLabel('박지원 역할')).toHaveCount(0)
  await expect(member.getByRole('button', { name: '프로젝트 나가기' })).toBeVisible()

  await owner.context().close()
  await member.context().close()
})

test('증빙: 팀장이 제출하면 검토 대기로, 기관 담당자가 승인하면 승인자와 날짜가 남고 검증된 성과로 이어진다', async ({ browser }) => {
  const leader = await pageAs(browser, 'member')
  const id = await projectId(leader, 'member', PROJECTS.program)
  await leader.goto(`/projects/${id}?tab=evidence`)
  await expect(leader.getByRole('heading', { level: 1, name: PROJECTS.program })).toBeVisible()
  await expect(leader.getByText(`${UNIVERSITY} · ${MOVE_TARGET}`).first()).toBeVisible()
  await expect(leader.getByRole('list', { name: '증빙 상태 단계' })).toContainText('임시저장검토 대기승인또는반려')

  await leader.getByRole('button', { name: '증빙 작성' }).click()
  const dialog = leader.getByRole('dialog', { name: '활동 증빙 작성' })
  await dialog.getByLabel('활동 제목').fill('E2E 중간 발표')
  await dialog.locator('input[type=file]').setInputFiles({ name: 'meeting.png', mimeType: 'image/png', buffer: PNG })
  await dialog.getByRole('button', { name: '저장 후 제출' }).click()
  await expectToast(leader, '제출했습니다. 담당자 검토를 기다려 주세요.')
  const submitted = leader.getByRole('article').filter({ hasText: 'E2E 중간 발표' })
  await expect(submitted).toContainText('검토 대기')
  await expect(submitted).toContainText('기관 담당자가 아직 검토하지 않았습니다.')
  await expect(submitted).not.toContainText('검증 기록 발급')

  const staff = await pageAs(browser, 'operator')
  await staff.goto(`/projects/${id}?tab=evidence`)
  await expect(staff.getByText('기관 담당자 열람')).toBeVisible()
  await expect(staff.getByRole('link', { name: '내 검증된 성과 보기' })).toHaveCount(0)
  const review = staff.getByRole('article').filter({ hasText: 'E2E 중간 발표' })
  await review.getByRole('button', { name: '승인' }).click()
  await expect(review).toContainText('기관 승인 · 이운영')
  await staff.context().close()

  await leader.reload()
  const approved = leader.getByRole('article').filter({ hasText: 'E2E 중간 발표' })
  await expect(approved).toContainText('기관 승인 · 이운영')
  await expect(approved).toContainText('검증 기록 발급')
  await expect(leader.getByRole('link', { name: '내 검증된 성과 보기' })).toHaveAttribute('href', '/profile?tab=experience&type=verified')
  await leader.context().close()
})

test('보존: 프로그램 프로젝트는 팀장도 기관 담당자도 삭제할 수 없고, 팀원이 있는 개인 프로젝트는 영향을 확인해야 삭제된다', async ({ browser }) => {
  const leader = await pageAs(browser, 'member')
  const programProject = await projectId(leader, 'member', PROJECTS.program)
  await leader.goto(`/projects/${programProject}?tab=settings`)
  const kept = leader.getByRole('region', { name: '기록 보존' })
  await expect(kept).toContainText('팀원도 기관 담당자도 영구 삭제할 수 없습니다.')
  await expect(leader.getByRole('button', { name: '프로젝트 삭제' })).toHaveCount(0)

  for (const role of ['member', 'operator'] as const) {
    const response = await leader.request.delete(`${API}/projects/${programProject}`, {
      headers: { Authorization: `Bearer ${await apiToken(leader.request, role)}` },
      data: { password: PASSWORD, confirmTeamImpact: true },
    })
    expect(response.status(), role).toBe(403)
  }
  const evidence = await apiGet<{ evidence: { title: string; status: string }[] }>(leader.request, 'operator', `/projects/${programProject}/evidence`)
  expect(evidence.evidence.find((item) => item.title === 'E2E 중간 발표')?.status).toBe('approved')
  await leader.context().close()

  const owner = await pageAs(browser, 'applicant')
  const shared = await projectId(owner, 'applicant', PROJECTS.private)
  await owner.goto(`/projects/${shared}?tab=settings`)
  const removal = owner.getByRole('region', { name: '프로젝트 삭제' })
  await expect(removal).toContainText('다른 팀원 1명도 이 프로젝트를 잃습니다.')
  await removal.getByRole('button', { name: '프로젝트 삭제' }).click()
  const confirm = owner.getByRole('dialog', { name: '프로젝트 삭제' })
  await confirm.getByLabel('비밀번호').fill(PASSWORD)
  await expect(confirm.getByRole('button', { name: '삭제 확인' })).toBeDisabled()
  await confirm.getByRole('checkbox', { name: /다른 팀원 1명도/ }).check()
  await expect(confirm.getByRole('button', { name: '삭제 확인' })).toBeEnabled()
  await confirm.getByRole('button', { name: '취소' }).click()
  await expect(owner.getByRole('heading', { level: 1, name: PROJECTS.private })).toBeVisible()
  await owner.context().close()
})

test('모바일: 빠른 작업이 하단 메뉴 위에 있고, 작업 추가를 누르면 입력란으로 바로 이동한다', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signIn(page, 'applicant')
  const id = await projectId(page, 'applicant', PROJECTS.private)
  await page.goto(`/projects/${id}`)

  const quick = page.getByRole('group', { name: '빠른 작업' })
  await expect(quick).toBeVisible()
  const quickBox = (await quick.boundingBox())!
  const navBox = (await page.getByRole('navigation', { name: '주요 메뉴' }).boundingBox())!
  expect(quickBox.y + quickBox.height).toBeLessThanOrEqual(navBox.y + 1)
  await expect(page.getByRole('complementary')).toBeHidden()

  await quick.getByRole('button', { name: '작업 추가' }).click()
  expect(params(page)).toEqual({ tab: 'tasks' })
  await expect(page.getByRole('form', { name: '새 작업' }).getByLabel('작업 이름')).toBeFocused()
  await quick.getByRole('button', { name: '활동 기록' }).click()
  expect(params(page)).toEqual({ tab: 'activity' })
  await expect(page.getByRole('form', { name: '새 활동' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('키보드: 프로젝트 메뉴를 탭과 Enter로 이동한다', async ({ page }) => {
  await signIn(page, 'applicant')
  const id = await projectId(page, 'applicant', PROJECTS.private)
  await page.goto(`/projects/${id}`)
  await tab(page, '개요').focus()
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await expect(tab(page, '팀원')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(tab(page, '팀원')).toHaveAttribute('aria-current', 'page')
  expect(params(page)).toEqual({ tab: 'members' })
})

test('반응형·접근성: 목록과 상세가 모든 폭에서 가로로 넘치지 않는다', async ({ page }) => {
  await signIn(page, 'applicant')
  const id = await projectId(page, 'applicant', PROJECTS.private)
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/projects')
    await expect(card(page, PROJECTS.private)).toBeVisible()
    await expectNoHorizontalOverflow(page)
    for (const target of ['', '?tab=tasks', '?tab=members', '?tab=settings']) {
      await page.goto(`/projects/${id}${target}`)
      await expect(page.getByRole('heading', { level: 1, name: PROJECTS.private })).toBeVisible()
      await expectNoHorizontalOverflow(page)
    }
    if (width === 390 || width === 1440) {
      await page.goto('/projects')
      await expect(card(page, PROJECTS.private)).toBeVisible()
      await expectNoA11yViolations(page)
      await page.goto(`/projects/${id}?tab=tasks`)
      await expect(page.getByRole('list', { name: '작업 목록' })).toBeVisible()
      await expectNoA11yViolations(page)
    }
  }
})
