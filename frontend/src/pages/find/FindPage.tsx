import { useQuery } from '@tanstack/react-query'
import { Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Avatar } from '../../components/common/Avatar'
import { Badge } from '../../components/common/Badge'
import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { AppLayout } from '../../components/layout/AppLayout'
import { searchPeople } from '../../services/searchService'
import { useAuthStore } from '../../stores/authStore'

export function FindPage() {
  const token = useAuthStore((state) => state.token)
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const urlQuery = searchParams.get('q') ?? ''
  const [input, setInput] = useState(urlQuery)
  const [debouncedQuery, setDebouncedQuery] = useState(urlQuery)

  useEffect(() => {
    setInput(urlQuery)
    setDebouncedQuery(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(input.trim())
    }, 350)
    return () => window.clearTimeout(timer)
  }, [input])

  useEffect(() => {
    const trimmed = debouncedQuery.trim()
    if (trimmed === (searchParams.get('q') ?? '')) {
      return
    }
    if (trimmed) {
      setSearchParams({ q: trimmed }, { replace: true })
    } else {
      setSearchParams({}, { replace: true })
    }
  }, [debouncedQuery, searchParams, setSearchParams])

  const searchQuery = useQuery({
    queryKey: ['search', 'people', debouncedQuery],
    queryFn: () => searchPeople(token ?? '', debouncedQuery),
    enabled: Boolean(token) && debouncedQuery.length >= 1,
  })

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmed = input.trim()
    if (trimmed) {
      navigate(`/find?q=${encodeURIComponent(trimmed)}`)
    } else {
      navigate('/find')
    }
  }

  const results = searchQuery.data?.results ?? []

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-strong">Find</h1>
          <p className="mt-2 text-sm text-ink-muted">
            이름, 직무, 회사, 학교, 스킬로 사람을 검색할 수 있습니다.
          </p>
        </div>

        <form className="sticky top-16 z-20 -mx-1 rounded-2xl bg-surface-canvas/95 px-1 py-2 backdrop-blur lg:top-20" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor="find-search">
            사람 검색
          </label>
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-ink-muted"
              size={20}
            />
            <input
              autoComplete="off"
              className="h-12 w-full rounded-full border border-surface-border bg-white pl-11 pr-4 text-sm text-ink-strong shadow-sm outline-none ring-brand-600/20 transition placeholder:text-ink-muted focus:border-brand-200 focus:ring-2"
              id="find-search"
              onChange={(event) => setInput(event.target.value)}
              placeholder="이름, 직무, 회사, 스킬 검색…"
              type="search"
              value={input}
            />
          </div>
        </form>

        {!debouncedQuery ? (
          <EmptyState
            description="검색어를 입력하면 BAESH 사용자 프로필을 찾아 드립니다."
            title="검색어를 입력해 주세요"
          />
        ) : null}

        {debouncedQuery && searchQuery.isLoading ? <LoadingState /> : null}

        {debouncedQuery && searchQuery.error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchQuery.error.message}
          </p>
        ) : null}

        {debouncedQuery && !searchQuery.isLoading && results.length === 0 ? (
          <EmptyState
            description={`"${debouncedQuery}"에 맞는 프로필이 없습니다. 다른 키워드로 시도해 보세요.`}
            title="검색 결과 없음"
          />
        ) : null}

        {results.length > 0 ? (
          <ul className="space-y-3 pb-4">
            {results.map((person) => (
              <li key={person.userId}>
                <Link
                  className="flex gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
                  to={`/profile/${person.userId}`}
                >
                  <Avatar className="shrink-0" name={person.name} src={person.avatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-ink-strong">{person.name}</p>
                    {person.headline ? (
                      <p className="mt-0.5 truncate text-sm text-ink-body">{person.headline}</p>
                    ) : null}
                    {(person.company || person.school) && (
                      <p className="mt-1 truncate text-xs text-ink-muted">
                        {[person.company, person.school].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {person.skills.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {person.skills.slice(0, 4).map((skill) => (
                          <Badge key={skill} tone="blue">
                            {skill}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                    {person.matchReasons.length > 0 ? (
                      <p className="mt-2 text-xs text-brand-600">
                        매칭: {person.matchReasons.join(', ')}
                      </p>
                    ) : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppLayout>
  )
}
