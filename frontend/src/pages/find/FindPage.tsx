import { useQuery } from '@tanstack/react-query'
import { Search, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { EmptyState } from '../../components/common/EmptyState'
import { LoadingState } from '../../components/common/LoadingState'
import { PersonResultCard } from '../../components/find/PersonResultCard'
import { AppLayout } from '../../components/layout/AppLayout'
import { getRecommendedPeople, searchPeople } from '../../services/searchService'
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

  const recommendedQuery = useQuery({
    queryKey: ['search', 'recommended'],
    queryFn: () => getRecommendedPeople(token ?? '', 12),
    enabled: Boolean(token) && !debouncedQuery,
  })

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

  const searchResults = searchQuery.data?.results ?? []
  const recommended = recommendedQuery.data?.results ?? []

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="hidden md:block">
          <h1 className="text-2xl font-bold text-ink-strong">Find</h1>
          <p className="mt-2 text-sm text-ink-muted">
            이름, 직무, 회사, 학교, 스킬로 사람을 검색할 수 있습니다.
          </p>
        </div>

        <form
          className="sticky top-16 z-20 -mx-1 rounded-2xl bg-surface-canvas/95 px-1 py-2 backdrop-blur md:top-20"
          onSubmit={handleSubmit}
        >
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
              autoFocus={!debouncedQuery}
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
          <section className="space-y-3 pb-4">
            <div className="flex items-center gap-2 px-0.5">
              <Sparkles className="text-brand-600" size={18} />
              <h2 className="text-base font-bold text-ink-strong">추천 친구</h2>
            </div>

            {recommendedQuery.isLoading ? <LoadingState /> : null}

            {recommendedQuery.error ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {recommendedQuery.error.message}
              </p>
            ) : null}

            {!recommendedQuery.isLoading && recommended.length === 0 ? (
              <EmptyState
                description="프로필을 채우고 다른 사람 프로필을 둘러보면 맞춤 추천이 쌓입니다."
                title="아직 추천할 친구가 없어요"
              />
            ) : null}

            {recommended.length > 0 ? (
              <ul className="space-y-3">
                {recommended.map((person) => (
                  <li key={person.userId}>
                    <PersonResultCard person={person} />
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
        ) : null}

        {debouncedQuery && searchQuery.isLoading ? <LoadingState /> : null}

        {debouncedQuery && searchQuery.error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {searchQuery.error.message}
          </p>
        ) : null}

        {debouncedQuery && !searchQuery.isLoading && searchResults.length === 0 ? (
          <EmptyState
            description={`"${debouncedQuery}"에 맞는 프로필이 없습니다. 다른 키워드로 시도해 보세요.`}
            title="검색 결과 없음"
          />
        ) : null}

        {debouncedQuery && searchResults.length > 0 ? (
          <ul className="space-y-3 pb-4">
            {searchResults.map((person) => (
              <li key={person.userId}>
                <PersonResultCard person={person} />
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </AppLayout>
  )
}
