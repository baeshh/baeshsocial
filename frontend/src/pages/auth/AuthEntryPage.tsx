import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { Input } from '../../components/common/Input'
import { cn } from '../../lib/cn'
import { ORG_TYPE_META, REGISTRABLE_ORG_TYPES } from '../../lib/organizations'
import { login, register } from '../../services/authService'
import type { RegistrableOrganizationType } from '../../services/organizationService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'

type AccountPurpose = 'personal' | RegistrableOrganizationType

export function AuthEntryPage() {
  const { mode } = useParams()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite')
  const rawNext = searchParams.get('next')
  const nextPath = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : null
  const inviteQuery = inviteToken
    ? `?invite=${encodeURIComponent(inviteToken)}`
    : nextPath
      ? `?next=${encodeURIComponent(nextPath)}`
      : ''
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [purpose, setPurpose] = useState<AccountPurpose>('personal')
  const isRegister = mode === 'register'
  const title = mode === 'register' ? '회원가입' : '로그인'
  const helperText = useMemo(
    () =>
      isRegister
        ? '프로젝트 기반 커리어 데이터를 만들기 위한 계정을 생성합니다.'
        : '계정으로 로그인해 BAESH 커리어 데이터 공간으로 이동합니다.',
    [isRegister],
  )

  const authMutation = useMutation({
    mutationFn: () =>
      isRegister
        ? register({ email, password, name, ...(inviteToken ? { inviteToken } : {}) })
        : login({ email, password }),
    onSuccess: ({ token: nextToken, user, invite, inviteError }) => {
      setSession(nextToken, user)
      if (invite) {
        showToast(invite.participantOnly ? `${invite.organizationName} 프로그램에 참여자로 등록되었습니다.` : `${invite.organizationName}에 합류했습니다.`)
        navigate(invite.programId ? `/org/${invite.organizationId}/programs/${invite.programId}` : `/org/${invite.organizationId}`)
        return
      }
      if (inviteToken) {
        if (inviteError) showToast(inviteError, 'error')
        navigate(`/invite/${encodeURIComponent(inviteToken)}`)
        return
      }
      navigate(isRegister && purpose !== 'personal' ? `/organizations/new?type=${purpose}` : (nextPath ?? '/dashboard'))
    },
  })

  if (token && !authMutation.isPending && !authMutation.isSuccess) {
    return <Navigate replace to={inviteToken ? `/invite/${encodeURIComponent(inviteToken)}` : (nextPath ?? '/dashboard')} />
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    authMutation.mutate()
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <Link className="text-sm font-semibold text-brand-600" to="/">
          BAESH
        </Link>
        <h1 className="mt-6 text-3xl font-bold tracking-tight text-ink-strong">{title}</h1>
        <p className="mt-3 leading-7 text-ink-body">{helperText}</p>

        <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
          {isRegister ? (
            <Input
              label="이름"
              minLength={2}
              onChange={(event) => setName(event.target.value)}
              placeholder="홍길동"
              required
              type="text"
              value={name}
            />
          ) : null}

          <Input
            autoComplete="email"
            label="이메일"
            onChange={(event) => setEmail(event.target.value)}
            placeholder="name@company.com"
            required
            type="email"
            value={email}
          />

          <Input
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            label="비밀번호"
            minLength={isRegister ? 8 : 1}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={isRegister ? '8자 이상 입력' : '비밀번호 입력'}
            required
            type="password"
            value={password}
          />

          {inviteToken ? (
            <p className="rounded-2xl border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
              초대받은 이메일 주소로 {isRegister ? '가입하면' : '로그인하면'} 초대가 자동으로 연결됩니다.
            </p>
          ) : null}

          {isRegister && !inviteToken ? (
            <fieldset>
              <legend className="text-sm font-semibold text-ink-strong">어떤 용도로 시작하시나요?</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(['personal', ...REGISTRABLE_ORG_TYPES] as const).map((option) => (
                  <button
                    aria-pressed={purpose === option}
                    className={cn(
                      'rounded-2xl border px-3 py-2.5 text-left transition',
                      purpose === option
                        ? 'border-brand-600 bg-brand-50 ring-2 ring-brand-100'
                        : 'border-surface-border hover:bg-surface-muted',
                    )}
                    key={option}
                    onClick={() => setPurpose(option)}
                    type="button"
                  >
                    <span className="block text-sm font-bold text-ink-strong">
                      {option === 'personal' ? '개인' : ORG_TYPE_META[option].label}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {option === 'personal' ? '학생 · 직장인 · 개인' : ORG_TYPE_META[option].audience}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs leading-5 text-ink-muted">
                {purpose === 'personal'
                  ? '모든 계정은 개인 계정으로 시작합니다. 조직은 나중에 언제든 등록하거나 가입할 수 있습니다.'
                  : '개인 계정을 만든 뒤 바로 조직 등록으로 이동합니다. 조직 관리 기능은 증빙 서류 심사와 운영자 승인 후 열립니다.'}
              </p>
            </fieldset>
          ) : null}

          {authMutation.error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              {authMutation.error.message}
            </p>
          ) : null}

          <Button className="w-full" disabled={authMutation.isPending} type="submit">
            {authMutation.isPending ? '처리 중' : title}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-muted">
          {isRegister ? '이미 계정이 있나요?' : '아직 계정이 없나요?'}{' '}
          <Link
            className="font-semibold text-brand-600"
            to={`${isRegister ? '/auth/login' : '/auth/register'}${inviteQuery}`}
          >
            {isRegister ? '로그인' : '회원가입'}
          </Link>
        </p>
      </Card>
    </main>
  )
}
