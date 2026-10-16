/**
 * Privilege-escalation checks for public registration (MODULE 01).
 * Run: npx tsx scripts/checkRegisterRoleHardening.ts
 */
import { registerSchema } from '../src/validators/auth.validator.js'

let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS  ${message}`)
    return
  }
  failed += 1
  console.error(`FAIL  ${message}`)
}

const base = { email: 'member@test.baesh.dev', password: 'abcd1234', name: '일반가입' }

const ok = registerSchema.safeParse(base)
assert(ok.success, '역할 미지정 회원가입은 통과')
if (ok.success) {
  assert(!('role' in ok.data), '통과 결과에 role 필드가 없음')
}

for (const role of ['admin', 'ADMIN', 'institution', 'company', 'user'] as const) {
  const result = registerSchema.safeParse({ ...base, email: `${role}@test.baesh.dev`, role })
  assert(!result.success, `role=${role} 요청은 거부`)
  if (!result.success) {
    const text = JSON.stringify(result.error.issues)
    assert(text.includes('역할'), `role=${role} 거부에 역할 안내 메시지 포함`)
  }
}

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}
console.log('\nAll register role hardening checks passed')
