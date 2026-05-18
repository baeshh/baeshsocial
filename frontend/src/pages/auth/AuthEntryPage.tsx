import { useMutation } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '../../components/common/Button'
import { Card } from '../../components/common/Card'
import { Input, Select } from '../../components/common/Input'
import { login, register } from '../../services/authService'
import { useAuthStore } from '../../stores/authStore'
import type { UserRole } from '../../types/auth'

const roleOptions: Array<{ label: string; value: UserRole }> = [
  { label: '개인 사용자', value: 'user' },
  { label: '기업', value: 'company' },
  { label: '기관', value: 'institution' },
  { label: '관리자', value: 'admin' },
]

export function AuthEntryPage() {
  const { mode } = useParams()
  const navigate = useNavigate()
  const { token, setSession } = useAuthStore()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
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
        ? register({ email, password, name, role })
        : login({ email, password }),
    onSuccess: ({ token: nextToken, user }) => {
      setSession(nextToken, user)
      navigate('/dashboard')
    },
  })

  if (token) {
    return <Navigate replace to="/dashboard" />
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

          {isRegister ? (
            <Select
              label="역할"
              onChange={(event) => setRole(event.target.value as UserRole)}
              value={role}
            >
                {roleOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
            </Select>
          ) : null}

          {authMutation.error ? (
            <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
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
            to={isRegister ? '/auth/login' : '/auth/register'}
          >
            {isRegister ? '로그인' : '회원가입'}
          </Link>
        </p>
      </Card>
    </main>
  )
}
