import { expect, test, type Page } from '@playwright/test'
import { API, MOVE_TARGET, apiGet, apiToken, deadlineInput, expectNoHorizontalOverflow, expectToast, orgIds, signIn } from './support'

/**
 * Program creation wizard: server-side autosave and recovery, the applicant preview, publishing, and who may open it.
 * Publishing happens in the company workspace so the university keeps room under the trial plan's program limit.
 */
// Later steps continue the draft the first one created; a retry would start from a half-finished draft.
test.describe.configure({ mode: 'serial', retries: 0 })

const stamp = Date.now().toString(36)
const title = `E2E 위저드 ${stamp}`
const rosterTitle = `E2E 명단 등록 ${stamp}`
const intro = `E2E 위저드 소개 ${stamp}`
let companyId = ''
let universityId = ''
let draftId = ''

const stepNav = (page: Page) => page.getByRole('navigation', { name: '프로그램 개설 단계' })
const saveStatus = (page: Page) => page.getByRole('status').filter({ hasText: /임시저장|저장/ })
const expectSaved = (page: Page) => expect(saveStatus(page)).toContainText('임시저장됨', { timeout: 15_000 })

test.beforeAll(async ({ request }) => {
  ;({ company: companyId, university: universityId } = await orgIds(request))
})

test('입력하는 동안 서버에 자동저장되고, 새로고침해도 단계와 내용이 복구된다', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto(`/org/${companyId}/programs/new`)
  await page.getByRole('button', { name: /지금부터 지원자를 모집해요/ }).click()
  await expect(stepNav(page).getByRole('button', { name: /기본 정보/ })).toHaveAttribute('aria-current', 'step')
  await expect(saveStatus(page)).toContainText('이름을 입력하면 자동 저장됩니다')

  const name = page.getByLabel('프로그램 이름')
  await name.fill(title)
  // The draft gets an id and a resumable URL without remounting the form.
  await expect(page).toHaveURL(/\/programs\/[^/]+\/setup\?step=basics/, { timeout: 15_000 })
  draftId = new URL(page.url()).pathname.split('/').at(-2)!
  await expect(name).toHaveValue(title)
  await page.getByLabel('프로그램 소개').fill(intro)
  await expectSaved(page)

  // The server is the only copy: nothing typed into the form is written to browser storage.
  const stored = await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))
  expect(stored).not.toContain(title)
  expect(stored).not.toContain(intro)

  const next = page.getByRole('button', { name: '다음 단계' })
  await next.click()
  await page.getByLabel('모집 마감 일시').fill(deadlineInput(10))
  await page.getByLabel('정원 (선발 인원)').fill('20')
  await expectSaved(page)

  await next.click()
  await expect(stepNav(page).getByRole('button', { name: /지원서 설계/ })).toHaveAttribute('aria-current', 'step')
  await page.getByRole('button', { name: '단답형 질문' }).click()
  // An unfinished question is held back (the server would reject it) and the user is told so.
  await expect(saveStatus(page)).toContainText('문항을 완성하면 지원서가 저장됩니다')
  await page.getByLabel('질문', { exact: true }).last().fill('관련 경험')
  await expectSaved(page)

  await page.reload()
  await expect(page).toHaveURL(new RegExp(`/programs/${draftId}/setup\\?step=form`))
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(page.getByLabel('질문', { exact: true })).toHaveCount(3)
  await expect(page.getByLabel('질문', { exact: true }).last()).toHaveValue('관련 경험')

  await stepNav(page).getByRole('button', { name: /기본 정보/ }).click()
  await expect(page.getByLabel('프로그램 소개')).toHaveValue(intro)

  const saved = await apiGet<{ program: { title: string; publishedAt: string | null; recruitment: { capacity: number | null } } }>(
    page.request,
    'operator',
    `/programs/${draftId}`,
  )
  expect(saved.program).toMatchObject({ title, publishedAt: null, recruitment: { capacity: 20 } })
})

test('작성 중인 프로그램은 목록과 시작 화면에서 이어서 작성할 수 있다', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto(`/org/${companyId}?tab=programs`)
  await page.getByRole('link', { name: `${title} 이어서 작성` }).click()
  await expect(page).toHaveURL(new RegExp(`/programs/${draftId}/setup`))
  await expect(page.getByLabel('프로그램 이름')).toHaveValue(title)

  await page.goto(`/org/${companyId}/programs/new`)
  const drafts = page.getByRole('region', { name: /작성 중인 프로그램/ })
  await expect(drafts.getByText(title)).toBeVisible()
})

test('미리보기는 학생에게 공개될 모집 화면을 보여 주고, 제출은 막혀 있다', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto(`/org/${companyId}/programs/${draftId}/setup?step=preview`)
  const preview = page.getByRole('region', { name: '모집 공고 미리보기' })
  await expect(preview.getByRole('heading', { level: 2, name: title })).toBeVisible()
  await expect(preview.getByText(intro)).toBeVisible()
  await expect(preview.getByText('20명')).toBeVisible()
  await expect(preview.getByText('3. 관련 경험')).toBeVisible()
  await expect(preview.getByRole('button', { name: '제출하기' })).toBeDisabled()
  await expect(preview.getByText('미리보기에서는 지원서를 저장하거나 제출할 수 없습니다.')).toBeVisible()

  await page.getByRole('button', { name: '모바일' }).click()
  await expect(page.getByRole('button', { name: '모바일' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('[data-device="mobile"]')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('검토 단계는 빠진 필수 항목을 짚어 주고, 게시하면 학생에게 공개된다', async ({ page, browser }) => {
  await signIn(page, 'operator')
  await page.goto(`/org/${companyId}/programs/${draftId}/setup?step=recruitment`)
  await page.getByLabel('모집 마감 일시').fill('')
  await expectSaved(page)
  await stepNav(page).getByRole('button', { name: /검토·게시/ }).click()

  const problems = page.getByRole('alert').filter({ hasText: '게시하기 전에' })
  await expect(problems).toContainText('모집 마감 일시를 입력해 주세요.')
  const publish = page.getByRole('button', { name: '모집 공고 게시' })
  await expect(publish).toBeDisabled()

  await problems.getByRole('button', { name: '모집 설정 단계로 이동' }).click()
  await page.getByLabel('모집 마감 일시').fill(deadlineInput(10))
  await stepNav(page).getByRole('button', { name: /검토·게시/ }).click()
  await expect(page.getByText('게시할 준비가 되었습니다')).toBeVisible()
  await publish.click()

  await expect(page).toHaveURL(new RegExp(`/org/${companyId}/programs/${draftId}\\?tab=applications`))
  await expectToast(page, '모집 공고를 게시했습니다')
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible()

  // A published program is edited from its settings, not the wizard.
  await page.goto(`/org/${companyId}/programs/${draftId}/setup`)
  await expect(page).toHaveURL(new RegExp(`/programs/${draftId}\\?tab=settings`))

  const context = await browser.newContext()
  const applicant = await context.newPage()
  await signIn(applicant, 'applicant')
  await applicant.goto(`/programs/${draftId}`)
  await expect(applicant.getByRole('heading', { level: 1, name: title })).toBeVisible()
  await expect(applicant.getByText('3. 관련 경험')).toBeVisible()
  await context.close()
})

test('명단 등록형은 지원서 단계 없이 진행되고, 관리자는 초안을 삭제할 수 있다', async ({ page }) => {
  await signIn(page, 'operator')
  await page.goto(`/org/${universityId}/programs/new`)
  await page.getByRole('button', { name: /참여자가 이미 정해져 있어요/ }).click()
  const steps = stepNav(page).getByRole('button')
  await expect(steps).toHaveCount(4)
  await expect(stepNav(page).getByRole('button', { name: /지원서 설계/ })).toHaveCount(0)

  await page.getByLabel('프로그램 이름').fill(rosterTitle)
  await expect(page).toHaveURL(/\/setup\?step=basics/, { timeout: 15_000 })
  await expectSaved(page)
  await page.getByRole('button', { name: '다음 단계' }).click()
  await expect(page.getByText('참여자 탭에서 선발된 명단을')).toBeVisible()

  await stepNav(page).getByRole('button', { name: /검토·게시/ }).click()
  await expect(page.getByRole('button', { name: '프로그램 개설' })).toBeEnabled()
  page.once('dialog', (dialog) => void dialog.accept())
  await page.getByRole('button', { name: '초안 삭제' }).click()
  await expect(page).toHaveURL(new RegExp(`/org/${universityId}\\?tab=programs`))
  await expectToast(page, '작성 중이던 프로그램을 삭제했습니다.')
  await expect(page.getByText(rosterTitle)).toHaveCount(0)
})

test.describe('권한', () => {
  test('일반 구성원은 개설·편집 화면을 열 수 없고, API도 거부한다', async ({ page }) => {
    const { programs } = await apiGet<{ programs: Array<{ id: string; title: string }> }>(page.request, 'operator', `/organizations/${universityId}/programs`)
    const target = programs.find((program) => program.title === MOVE_TARGET)!

    await signIn(page, 'member')
    await page.goto(`/org/${universityId}?tab=programs`)
    await expect(page.getByText('참여 중인 프로그램과 조직에 공개된 프로그램이 표시됩니다.')).toBeVisible()
    await expect(page.getByRole('link', { name: '프로그램 만들기' })).toHaveCount(0)

    await page.goto(`/org/${universityId}/programs/new`)
    await expect(page.getByRole('heading', { name: '프로그램을 개설할 권한이 없습니다' })).toBeVisible()
    await expect(page.getByLabel('프로그램 이름')).toHaveCount(0)

    await page.goto(`/org/${universityId}/programs/${target.id}/setup`)
    await expect(page.getByRole('heading', { name: '이 프로그램을 편집할 수 없습니다' })).toBeVisible()
    await expect(page.getByLabel('프로그램 이름')).toHaveCount(0)

    const token = await apiToken(page.request, 'member')
    const created = await page.request.post(`${API}/organizations/${universityId}/programs`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'E2E 권한 없는 생성', publish: false },
    })
    expect(created.status()).toBe(403)
    const edited = await page.request.patch(`${API}/programs/${target.id}`, {
      headers: { Authorization: `Bearer ${token}` },
      data: { title: 'E2E 권한 없는 수정' },
    })
    expect([403, 404]).toContain(edited.status())
  })

  test('조직에 속하지 않은 사용자는 개설 화면에 들어올 수 없다', async ({ page }) => {
    await signIn(page, 'outsider')
    await page.goto(`/org/${universityId}/programs/new`)
    await expect(page).toHaveURL(/\/organizations$/)
    await expect(page.getByLabel('프로그램 이름')).toHaveCount(0)
  })

  test('로그인하지 않으면 로그인 화면으로 이동한다', async ({ page }) => {
    await page.goto(`/org/${universityId}/programs/new`)
    await expect(page).toHaveURL(/\/auth\/login/)
  })
})

test.describe('반응형', () => {
  test('모바일: 단계 선택과 하단 고정 버튼', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await signIn(page, 'operator')
    await page.goto(`/org/${universityId}/programs/new`)
    await page.getByRole('button', { name: /지금부터 지원자를 모집해요/ }).click()
    await expect(page.getByLabel('단계 이동')).toBeVisible()
    await expect(stepNav(page)).toHaveCount(0)
    const next = page.getByRole('button', { name: '다음 단계' })
    await expect(next).toBeInViewport()
    await expectNoHorizontalOverflow(page)

    // Without a name nothing is saved yet, so moving on is refused with a clear reason.
    await next.click()
    await expect(page.getByRole('alert')).toContainText('프로그램 이름을 2자 이상 입력해 주세요.')
  })

  test('태블릿: 가로 단계 표시', async ({ page }) => {
    await page.setViewportSize({ width: 820, height: 1180 })
    await signIn(page, 'operator')
    await page.goto(`/org/${universityId}/programs/new`)
    await page.getByRole('button', { name: /지금부터 지원자를 모집해요/ }).click()
    const nav = stepNav(page)
    await expect(nav).toBeVisible()
    const box = (await nav.boundingBox())!
    expect(box.width).toBeGreaterThan(box.height)
    await expectNoHorizontalOverflow(page)
  })
})