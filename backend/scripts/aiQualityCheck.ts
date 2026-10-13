/**
 * Exercises the real LLM pipeline against a local fake OpenAI-compatible server:
 * retries, schema re-ask, grounding of fabricated numbers/refs, cost logging, secret redaction
 * and input minimization. Run with: npx tsx scripts/aiQualityCheck.ts
 */
import http from 'node:http'

type Reply = { status: number; body: unknown }
const queue: Reply[] = []
const requests: { auth: string | undefined; body: string }[] = []

const server = http.createServer((req, res) => {
  let body = ''
  req.on('data', (chunk) => (body += chunk))
  req.on('end', () => {
    requests.push({ auth: req.headers.authorization, body })
    const reply = queue.shift() ?? { status: 500, body: { error: 'queue empty' } }
    res.writeHead(reply.status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(reply.body))
  })
})
await new Promise<void>((resolve) => server.listen(0, resolve))
const port = (server.address() as { port: number }).port

const FAKE_KEY = 'sk-test-SECRET1234567890abcdef'
process.env.AI_PROVIDER = 'openai'
process.env.OPENAI_API_KEY = FAKE_KEY
process.env.OPENAI_BASE_URL = `http://127.0.0.1:${port}/v1`
process.env.AI_MODEL = 'gpt-4o-mini'
process.env.AI_MAX_RETRIES = '2'
process.env.AI_TIMEOUT_MS = '5000'
process.env.AI_DAILY_LIMIT_PER_USER = '1000'

const { prisma } = await import('../src/config/prisma.js')
const { runAiTask } = await import('../src/services/ai/runner.js')
const { insightTask } = await import('../src/services/ai/tasks/insight.js')
const { collectCareerSources } = await import('../src/services/ai/careerSources.js')

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, extra = '') => {
  if (ok) pass++
  else fail++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? `  (${extra})` : ''}`)
}
const completion = (content: unknown, usage = { prompt_tokens: 1200, completion_tokens: 300 }) => ({
  status: 200,
  body: { model: 'gpt-4o-mini', choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }], usage },
})
const latestLog = (userId: string) => prisma.aIUsageLog.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } })

const user = await prisma.user.findUniqueOrThrow({ where: { email: 'student01@scenario.baesh.dev' } })
const career = await collectCareerSources(user.id)
const input = { ...career, mode: 'profile' as const }
const firstProject = career.projects[0]

// 1) 500 → 429 → schema-invalid → valid with fabricated content.
queue.push(
  { status: 500, body: { error: 'upstream' } },
  { status: 429, body: { error: 'slow down' } },
  completion({ summary: '' }),
  completion({
    summary: '사용자 3만 명을 확보하고 매출 250% 성장을 이끈 개발자입니다.',
    strengths: [
      { text: `${firstProject.title}에서 ${firstProject.role} 역할 수행`, sourceRefs: [firstProject.ref] },
      { text: '월간 활성 사용자 12000명 달성', sourceRefs: [firstProject.ref] },
      { text: '해커톤 대상 수상', sourceRefs: ['P99'] },
      { text: '근거 없는 주장', sourceRefs: [] },
    ],
    gaps: ['테스트 커버리지 87% 미만'],
    recommendations: ['검증 기록을 늘려 보세요'],
  }),
)
const started = Date.now()
const result = await runAiTask(insightTask('profile'), input, { userId: user.id })
const out = result.output
check('재시도: 500·429 후 성공 (총 4회 호출 = 재시도 2 + 형식 재요청 1)', result.meta.attempts === 4, `attempts ${result.meta.attempts}, ${Date.now() - started}ms`)
check('형식 검증 실패 시 교정 재요청 전송', requests[3]?.body.includes('형식 검증을 통과하지 못했습니다') ?? false)
check('근거 없는 수치 문장(12000명) 제거', !out.strengths.some((c) => c.text.includes('12000')))
check('존재하지 않는 근거(P99) 문장 제거', !out.strengths.some((c) => c.sourceRefs.includes('P99')))
check('근거 없는 주장 제거', !out.strengths.some((c) => c.text === '근거 없는 주장'))
check('정상 근거 문장 유지', out.strengths.some((c) => c.sourceRefs.includes(firstProject.ref)))
check('요약의 조작된 수치(3만·250%) 미노출', !/3만|250/.test(out.summary), out.summary.slice(0, 60))
check('개선점의 조작된 수치(87%) 미노출', !out.gaps.some((g) => g.includes('87')))
check('검증 이슈 기록', result.issues.length >= 3, `${result.issues.length}건`)
check('토큰·비용 집계(성공 응답 2회분)', result.meta.inputTokens === 2400 && result.meta.costUsd > 0, `in ${result.meta.inputTokens} cost $${result.meta.costUsd}`)
let log = await latestLog(user.id)
check('AIUsageLog SUCCESS 기록', log?.status === 'SUCCESS' && log.attempts === 4 && Number(log.costUsd) > 0 && log.validationIssues === result.issues.length)
const analysis = await prisma.aIAnalysis.findUnique({ where: { id: result.analysisId } })
check('AIAnalysis에 provider·model·promptVersion 저장', analysis?.provider === 'openai' && analysis.model === 'gpt-4o-mini' && !!analysis.promptVersion)

const sent = requests.map((r) => r.body).join('\n')
check('API 키는 Authorization 헤더로만 전송', requests.every((r) => r.auth === `Bearer ${FAKE_KEY}`) && !sent.includes(FAKE_KEY))
check('입력 최소화: 이메일·비밀번호 해시 미전송', !sent.includes(user.email) && !sent.includes(user.password))
check('JSON 모드 요청', sent.includes('"response_format":{"type":"json_object"}'))

// 2) Auth error echoing the key: no retry, redacted.
requests.length = 0
queue.push({ status: 401, body: { error: { message: `Incorrect API key provided: ${FAKE_KEY}` } } })
let threw = false
try {
  await runAiTask(insightTask('profile'), input, { userId: user.id })
} catch (error) {
  threw = (error as { status?: number }).status === 502
}
log = await latestLog(user.id)
check('401: 재시도 없이 502 반환', threw && requests.length === 1, `calls ${requests.length}`)
check('401: 오류 로그의 키 마스킹', log?.status === 'PROVIDER_ERROR' && !log.errorMessage?.includes(FAKE_KEY) && !!log.errorMessage?.includes('[redacted]'), log?.errorMessage ?? '')

// 3) Schema invalid twice → INVALID_OUTPUT.
requests.length = 0
queue.push(completion('not json at all'), completion({ strengths: 'wrong' }))
threw = false
try {
  await runAiTask(insightTask('profile'), input, { userId: user.id })
} catch (error) {
  threw = (error as { status?: number }).status === 502
}
log = await latestLog(user.id)
check('형식 재요청도 실패 시 INVALID_OUTPUT 기록', threw && log?.status === 'INVALID_OUTPUT' && log.errorCode === 'schema_validation' && Number(log.costUsd) > 0)

// 4) Persistent 503 → retries exhausted.
requests.length = 0
queue.push({ status: 503, body: {} }, { status: 503, body: {} }, { status: 503, body: {} })
threw = false
try {
  await runAiTask(insightTask('profile'), input, { userId: user.id })
} catch {
  threw = true
}
log = await latestLog(user.id)
check('503 지속: 최대 재시도 후 PROVIDER_ERROR', threw && requests.length === 3 && log?.status === 'PROVIDER_ERROR' && log.attempts === 3, `calls ${requests.length}`)

await prisma.aIAnalysis.deleteMany({ where: { userId: user.id, provider: 'openai' } })
await prisma.aIUsageLog.deleteMany({ where: { userId: user.id, provider: 'openai' } })
console.log(`\n${pass} passed, ${fail} failed`)
server.close()
await prisma.$disconnect()
process.exit(fail ? 1 : 0)
