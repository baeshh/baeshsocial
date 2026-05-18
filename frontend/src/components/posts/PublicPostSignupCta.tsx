import { Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '../common/Button'

export function PublicPostSignupCta() {
  return (
    <section className="mt-8 overflow-hidden rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-surface-muted p-8 text-center shadow-sm">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
        <Sparkles size={24} />
      </div>
      <h2 className="mt-4 text-xl font-bold text-ink-strong">BAESH와 성장해보세요</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        프로젝트 경험을 커리어 데이터로 쌓고, 팀과 함께 성장하며, AI가 추천하는 기회까지 한곳에서
        이어가 보세요.
      </p>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button className="min-w-[140px] rounded-full" to="/auth/register">
          회원가입
        </Button>
        <Button className="min-w-[140px] rounded-full" to="/auth/login" variant="secondary">
          로그인
        </Button>
      </div>
      <p className="mt-4 text-xs text-ink-muted">
        이미 계정이 있으신가요?{' '}
        <Link className="font-semibold text-brand-600 hover:text-brand-700" to="/auth/login">
          로그인하기
        </Link>
      </p>
    </section>
  )
}
