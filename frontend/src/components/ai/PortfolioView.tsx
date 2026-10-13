import { Copy, ExternalLink, ShieldCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { showToast } from '../../stores/toastStore'
import type { AiValidation, Portfolio } from '../../types/insights'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { ClaimList, SourceTable } from './ClaimList'

const SECTIONS = [
  ['contributions', '담당 업무와 기여'],
  ['process', '수행 과정'],
  ['technicalResults', '기술적 결과'],
  ['outcomes', '결과'],
] as const

function resumeSummaryText(portfolio: Portfolio) {
  return [portfolio.headline, ...portfolio.resumeSummary.map((claim) => `- ${claim.text}`)].join('\n')
}

export function PortfolioView({ portfolio, validation }: { portfolio: Portfolio; validation?: AiValidation }) {
  const sources = useMemo(() => new Map(portfolio.sources.map((source) => [source.ref, source])), [portfolio.sources])
  const [showSources, setShowSources] = useState(false)

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-5 ring-1 ring-brand-100">
        <p className="text-lg font-bold leading-7 text-ink-strong">{portfolio.headline}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <Badge tone="green">
            <ShieldCheck className="mr-1" size={12} /> 기관 검증 문장 {portfolio.stats.verifiedClaims}/{portfolio.stats.totalClaims}
          </Badge>
          <Badge>프로젝트 {portfolio.stats.projects}개</Badge>
          {validation && validation.dropped > 0 ? (
            <Badge tone="red" title="근거가 없거나 데이터에 없는 수치를 포함한 문장은 자동으로 제외됩니다.">
              근거 부족 문장 {validation.dropped}개 제외
            </Badge>
          ) : null}
        </div>
      </div>

      <section>
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold text-ink-strong">이력서 요약</h3>
          <Button
            className="min-h-8 gap-1.5 px-3 py-1 text-xs"
            onClick={() => {
              void navigator.clipboard.writeText(resumeSummaryText(portfolio))
              showToast('이력서 요약을 복사했습니다.')
            }}
            variant="ghost"
          >
            <Copy size={13} /> 복사
          </Button>
        </div>
        <div className="mt-2">
          <ClaimList claims={portfolio.resumeSummary} empty="요약할 기록이 부족합니다." sources={sources} />
        </div>
      </section>

      {portfolio.skills.length ? (
        <section>
          <h3 className="font-bold text-ink-strong">기술</h3>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {portfolio.skills.map((skill) => (
              <span
                className={`rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${skill.verified ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-white text-ink-body ring-surface-border'}`}
                key={skill.name}
                title={`근거: ${skill.sourceRefs.join(', ')}`}
              >
                {skill.name}
                {skill.verified ? ' ✓' : ''}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h3 className="font-bold text-ink-strong">프로젝트</h3>
        {portfolio.projects.map((project) => (
          <article className="rounded-2xl border border-surface-border p-5" key={project.ref}>
            <div className="flex flex-wrap items-center gap-2">
              <h4 className="text-base font-bold text-ink-strong">{project.title}</h4>
              <Badge>{project.role}</Badge>
              {project.isProgramProject ? <Badge tone="blue">기관 프로그램</Badge> : null}
              {project.verifiedEvidence.length ? <Badge tone="green">검증 기록 {project.verifiedEvidence.length}건</Badge> : null}
            </div>
            {project.intro ? <ClaimList claims={[project.intro]} sources={sources} /> : null}
            {project.roleSummary ? (
              <div className="mt-3">
                <p className="text-xs font-semibold text-ink-muted">역할</p>
                <ClaimList claims={[project.roleSummary]} sources={sources} />
              </div>
            ) : null}
            {SECTIONS.filter(([key]) => project[key].length).map(([key, label]) => (
              <div className="mt-3" key={key}>
                <p className="text-xs font-semibold text-ink-muted">{label}</p>
                <ClaimList claims={project[key]} sources={sources} />
              </div>
            ))}
            {project.links.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {project.links.map((link) => (
                  <a
                    className="inline-flex items-center gap-1 rounded-full border border-surface-border px-2.5 py-1 text-xs font-semibold text-ink-body hover:border-brand-200 hover:text-brand-700"
                    href={link.url}
                    key={link.ref}
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    <ExternalLink size={12} /> {link.label}
                  </a>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>

      <section>
        <button className="text-sm font-semibold text-ink-muted hover:text-ink-strong" onClick={() => setShowSources((v) => !v)} type="button">
          {showSources ? '근거 자료 숨기기' : `근거 자료 ${portfolio.sources.length}개 보기`}
        </button>
        {showSources ? (
          <div className="mt-2">
            <SourceTable sources={portfolio.sources} />
          </div>
        ) : null}
      </section>
    </div>
  )
}
