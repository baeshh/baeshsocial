import { ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { cn } from '../../lib/cn'
import type { AiSource, GroundedClaim } from '../../types/insights'

const KIND_LABEL: Record<AiSource['kind'], string> = {
  project: '프로젝트',
  evidence: '기관 검증',
  activity: '활동 기록',
  task: '태스크',
  link: '외부 산출물',
  fact: '집계',
  program: '프로그램',
  profile: '프로필',
}

export function SourceChip({ refId, sources }: { refId: string; sources: Map<string, AiSource> }) {
  const [open, setOpen] = useState(false)
  const source = sources.get(refId)
  return (
    <span className="relative inline-block align-middle">
      <button
        aria-expanded={open}
        className={cn(
          'ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold leading-none ring-1 transition',
          source?.verified ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-surface-muted text-ink-muted ring-surface-border hover:text-ink-strong',
        )}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {refId}
      </button>
      {open && source ? (
        <span className="absolute left-0 top-6 z-30 block w-72 rounded-xl border border-surface-border bg-white p-3 text-left text-xs leading-5 text-ink-body shadow-card">
          <span className="block font-semibold text-ink-strong">
            {KIND_LABEL[source.kind]} · {source.label}
          </span>
          <span className="mt-1 block">{source.text}</span>
          {source.verified ? <span className="mt-1 block font-semibold text-emerald-700">기관 담당자가 승인한 증빙입니다.</span> : null}
        </span>
      ) : null}
    </span>
  )
}

export function ClaimList({ claims, sources, empty }: { claims: GroundedClaim[]; sources: Map<string, AiSource>; empty?: string }) {
  if (!claims.length) return empty ? <p className="text-sm text-ink-muted">{empty}</p> : null
  return (
    <ul className="space-y-1.5">
      {claims.map((claim, index) => (
        <li className="flex gap-2 text-sm leading-6 text-ink-body" key={`${claim.text}-${index}`}>
          <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-ink-muted/50" />
          <span>
            {claim.text}
            {claim.verified ? (
              <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-50 px-1.5 py-0.5 align-middle text-[10px] font-bold text-emerald-700">
                <ShieldCheck size={10} />
                기관 검증
              </span>
            ) : null}
            {claim.sourceRefs.map((ref) => (
              <SourceChip key={ref} refId={ref} sources={sources} />
            ))}
          </span>
        </li>
      ))}
    </ul>
  )
}

export function SourceTable({ sources }: { sources: AiSource[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-xs">
        <thead className="text-left text-ink-muted">
          <tr>
            <th className="w-12 py-1.5">근거</th>
            <th className="w-48">종류</th>
            <th>내용</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {sources.map((source) => (
            <tr key={source.ref}>
              <td className="py-1.5 font-bold text-ink-strong">{source.ref}</td>
              <td>
                {KIND_LABEL[source.kind]}
                {source.verified ? <span className="ml-1 font-semibold text-emerald-700">· 검증</span> : null}
                <span className="block text-ink-muted">{source.label}</span>
              </td>
              <td className="text-ink-body">{source.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
