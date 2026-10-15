import { expect, test, type Browser, type Page } from '@playwright/test'
import { API, MOVE_TARGET, USERS, apiGet, apiToken, deadlineInput, expectToast, orgIds, signIn, type Role } from './support'

/**
 * One cohort end to end: an operator publishes a program, a person applies, gets an offer and confirms it,
 * the operator puts them on a team project and moves that project to another program, and the participant opens it.
 */
// A retry would open a second cohort, which the trial plan's program limit rightly refuses.
test.describe.configure({ mode: 'serial', retries: 0 })

const title = `E2E 모집 ${Date.now().toString(36)}`
const projectTitle = `${title} 팀 프로젝트`
let universityId = ''
let programId = ''
let operator: Page
let applicant: Page

async function pageFor(browser: Browser, role: Role) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await signIn(page, role)
  return page
}

test.beforeAll(async ({ browser, request }) => {
  universityId = (await orgIds(request)).university
  operator = await pageFor(browser, 'operator')
  applicant = await pageFor(browser, 'applicant')
})

test.afterAll(async () => {
  await operator?.context().close()
  await applicant?.context().close()
})

test('운영자가 개설 위저드로 공개 모집 프로그램을 만든다', async () => {
  await operator.goto(`/org/${universityId}?tab=programs`)
  await operator.getByRole('link', { name: '프로그램 만들기' }).click()
  await expect(operator).toHaveURL(new RegExp(`/org/${universityId}/programs/new`))
  await operator.getByRole('button', { name: /지금부터 지원자를 모집해요/ }).click()

  await operator.getByLabel('프로그램 이름').fill(title)
  await expect(operator).toHaveURL(/\/programs\/[^/]+\/setup\?step=basics/)

  const steps = operator.getByRole('navigation', { name: '프로그램 개설 단계' })
  const next = operator.getByRole('button', { name: '다음 단계' })
  await next.click()
  await operator.getByLabel('모집 마감 일시').fill(deadlineInput(7))
  await next.click()
  await expect(steps.getByRole('button', { name: /지원서 설계/ })).toHaveAttribute('aria-current', 'step')
  await next.click()
  await next.click()
  await expect(steps.getByRole('button', { name: /검토·게시/ })).toHaveAttribute('aria-current', 'step')
  await operator.getByRole('button', { name: '모집 공고 게시' }).click()

  await expect(operator).toHaveURL(new RegExp(`/org/${universityId}/programs/[^/?]+\\?tab=applications`))
  programId = new URL(operator.url()).pathname.split('/').pop()!
  await expect(operator.getByRole('heading', { name: title })).toBeVisible()
  await expect(operator.getByText('심사할 지원서가 없습니다')).toBeVisible()
})

test('지원자가 임시저장 후 다시 열어도 답변이 남아 있고, 필수 항목을 채워야 제출된다', async () => {
  await applicant.goto(`/programs/${programId}`)
  const motivation = applicant.getByRole('textbox', { name: /지원 동기/ })
  await motivation.fill('E2E 지원 동기입니다. 팀 프로젝트 경험을 쌓고 싶습니다.')
  await applicant.getByRole('button', { name: '임시저장' }).click()
  await expectToast(applicant, '임시저장했습니다')

  await applicant.reload()
  await expect(motivation).toHaveValue('E2E 지원 동기입니다. 팀 프로젝트 경험을 쌓고 싶습니다.')
  await expect(applicant.getByRole('button', { name: '이어서 작성하기' })).toBeVisible()

  const consent = applicant.getByRole('checkbox', { name: /개인정보 수집·이용 동의/ })
  await applicant.getByRole('button', { name: '제출하기' }).click()
  await expect(consent).toHaveAttribute('aria-invalid', 'true')
  await expect(applicant.getByText('동의가 필요합니다.')).toBeVisible()
  await expect(consent).toBeFocused()

  await consent.check()
  await expect(consent).not.toHaveAttribute('aria-invalid', 'true')
  applicant.once('dialog', (dialog) => void dialog.accept())
  await applicant.getByRole('button', { name: '제출하기' }).click()
  await expectToast(applicant, '지원서를 제출했습니다')
})

test('운영자가 합격을 제안한다', async () => {
  await operator.goto(`/org/${universityId}/programs/${programId}?tab=applications`)
  await expect(operator.getByText(USERS.applicant.name).first()).toBeVisible()
  await operator.getByRole('button', { name: '합격 제안' }).first().click()
  const modal = operator.getByRole('dialog', { name: `${USERS.applicant.name} 합격 제안` })
  await modal.getByLabel('응답 기한').selectOption('3')
  await modal.getByRole('button', { name: '합격 제안' }).click()
  await expect(modal).toBeHidden()
  const awaiting = operator.getByRole('button', { name: '응답 대기 1' })
  await awaiting.click()
  await expect(awaiting).toHaveAttribute('aria-pressed', 'true')
  await expect(operator.getByText(/^응답 기한 /)).toBeVisible()
})

test('지원자 홈에 합격 제안과 남은 시간이 보이고, 참여를 확정한다', async () => {
  await applicant.goto('/dashboard')
  const offer = applicant.getByRole('listitem').filter({ hasText: '합격 제안에 응답해 주세요' })
  await expect(offer).toBeVisible()
  await expect(offer).toContainText(/2일 2\d시간 남음/)

  await offer.getByRole('link').click()
  await expect(applicant).toHaveURL(new RegExp(`/programs/${programId}`))
  await expect(applicant.getByText(/2일 2\d시간 남음/)).toBeVisible()
  await applicant.getByRole('button', { name: '참여 확정' }).click()
  await expect(applicant.getByRole('button', { name: '참여 확정' })).toBeHidden()

  await applicant.goto('/dashboard')
  await expect(applicant.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(applicant.getByText('합격 제안에 응답해 주세요')).toHaveCount(0)
})

test('운영자가 팀 프로젝트를 만들고 참여자를 배정한 뒤 다른 프로그램으로 이동한다', async () => {
  await operator.goto(`/org/${universityId}/programs/${programId}?tab=projects`)
  await operator.getByRole('button', { name: '기관 프로젝트 추가' }).click()
  const form = operator.getByRole('dialog')
  await form.getByLabel('프로젝트 이름').fill(projectTitle)
  await form.getByRole('button', { name: '추가' }).click()
  await expect(form).toBeHidden()

  const card = operator.locator('div').filter({ has: operator.getByText(projectTitle, { exact: true }) }).filter({ has: operator.getByRole('button', { name: '팀원 배정' }) }).last()
  await card.getByRole('button', { name: '팀원 배정' }).click()
  const assign = operator.getByRole('dialog')
  await assign.getByRole('checkbox', { name: new RegExp(USERS.applicant.name) }).check()
  await assign.getByRole('button', { name: '배정' }).click()
  await expectToast(operator, '1명을 배정했습니다.')
  await expect(card.getByText(USERS.applicant.name)).toBeVisible()

  await card.getByRole('button', { name: '이동', exact: true }).click()
  const move = operator.getByRole('dialog', { name: '다른 프로그램으로 이동' })
  await move.getByLabel('대상 프로그램').selectOption({ label: MOVE_TARGET })
  await move.getByRole('button', { name: '이동', exact: true }).click()
  await expectToast(operator, '프로젝트를 이동했습니다')
  await expect(operator.getByText(projectTitle, { exact: true })).toHaveCount(0)
})

test('기관 공식 기록: 이전 프로그램 기록은 확정되고 이동한 프로그램에 새 기록이 생기며, 참여자는 열람할 수 없다', async ({ request }) => {
  type RecordRow = { id: string; programTitle: string; projectTitle: string; status: string; participants: number }
  const { records } = await apiGet<{ records: RecordRow[] }>(request, 'operator', `/organizations/${universityId}/project-records?limit=50`)
  const mine = records.filter((record) => record.projectTitle === projectTitle)
  expect(mine.map((record) => [record.programTitle, record.status]).sort()).toEqual([[MOVE_TARGET, 'active'], [title, 'final']].sort())

  const source = mine.find((record) => record.programTitle === title)!
  const { record } = await apiGet<{ record: { events: { action: string; trigger: string }[]; snapshot: { participants: { name: string }[] } } }>(
    request,
    'operator',
    `/organizations/${universityId}/project-records/${source.id}`,
  )
  expect(record.events.map((event) => event.trigger)).toEqual(['project.created', 'team.assigned', 'project.moved_out'])
  expect(record.events.at(-1)?.action).toBe('finalized')
  expect(record.snapshot.participants.map((participant) => participant.name)).toContain(USERS.applicant.name)

  const denied = await request.get(`${API}/organizations/${universityId}/project-records/${source.id}`, {
    headers: { Authorization: `Bearer ${await apiToken(request, 'applicant')}` },
  })
  expect(denied.status()).toBe(403)
})

test('참여자가 이동된 프로젝트를 열 수 있다', async () => {
  await applicant.goto('/projects')
  const card = applicant.locator('article, div').filter({ hasText: projectTitle }).filter({ has: applicant.getByRole('link', { name: '상세 보기' }) }).last()
  await expect(card).toContainText(MOVE_TARGET)
  await card.getByRole('link', { name: '상세 보기' }).click()
  await expect(applicant).toHaveURL(/\/projects\/[^/?]+/)
  await expect(applicant.getByRole('heading', { name: '프로젝트 목록' })).toHaveCount(0)
  await expect(applicant.getByText('프로젝트를 찾을 수 없습니다')).toHaveCount(0)
  await expect(applicant.getByRole('heading', { level: 1, name: projectTitle })).toBeVisible()
})
