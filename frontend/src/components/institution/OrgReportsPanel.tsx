import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, ExternalLink, FileText, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { resolveApiUrl } from '../../lib/api'
import { createReport, getReportDownloadUrl, getReports } from '../../services/insightService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { GeneratedReport } from '../../types/insights'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { EmptyState } from '../common/EmptyState'
import { LoadingState } from '../common/LoadingState'

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '')
const today = () => new Date().toISOString().slice(0, 10)

const SECTIONS = ['사업 개요 및 핵심 운영 성과', '프로그램별 운영 결과', '프로젝트별 성과 및 참여 현황', '주요 활동 사진 및 증빙', '종합 평가 및 개선 사항', '부록: 세부 활동내역과 증빙자료']

function formatSize(bytes: number | null) {
  if (!bytes) return ''
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`
}

export function OrgReportsPanel({ orgId }: { orgId: string }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<string[] | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState(today())
  const [title, setTitle] = useState('')

  const query = useQuery({
    queryKey: ['reports', orgId],
    queryFn: () => getReports(token!, orgId),
    enabled: Boolean(token),
  })
  const programs = query.data?.programs ?? []
  const programIds = selected ?? programs.filter((p) => p.status !== 'archived').map((p) => p.id)
  const earliest = programs
    .filter((p) => programIds.includes(p.id))
    .map((p) => day(p.startDate))
    .filter(Boolean)
    .sort()[0]
  const effectiveFrom = from || earliest || today()

  const generate = useMutation({
    mutationFn: () => createReport(token!, orgId, { programIds, from: effectiveFrom, to, title: title.trim() || undefined }),
    onSuccess: ({ report }) => {
      showToast(`결과보고서 제${report.version}판을 생성했습니다.`)
      void queryClient.invalidateQueries({ queryKey: ['reports', orgId] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const open = async (report: GeneratedReport, inline: boolean) => {
    // Opened synchronously so popup blockers allow it; the signed URL is filled in after the permission check.
    const win = inline ? window.open('', '_blank') : null
    try {
      const { url } = await getReportDownloadUrl(token!, orgId, report.id, inline)
      if (win) win.location.replace(resolveApiUrl(url))
      else window.location.assign(resolveApiUrl(url))
    } catch (error) {
      win?.close()
      showToast((error as Error).message, 'error')
    }
  }

  if (query.isLoading) return <LoadingState />
  if (query.isError) return <p className="text-sm text-red-700">{(query.error as Error).message}</p>

  const programTitle = new Map(programs.map((p) => [p.id, p.title]))

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>결과보고서 생성</CardTitle>
          <CardDescription>
            통계는 생성 시점의 데이터베이스 기록으로 계산되고, AI는 활동 요약과 서술 문장에만 사용됩니다. 생성된 보고서는 수치 스냅샷과 함께 판(version)별로 보관됩니다.
          </CardDescription>
        </CardHeader>
        {programs.length === 0 ? (
          <p className="text-sm text-ink-muted">관리 권한이 있는 프로그램이 없습니다.</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-sm font-semibold text-ink-strong">대상 프로그램</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {programs.map((program) => {
                  const checked = programIds.includes(program.id)
                  return (
                    <label
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm ${checked ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-surface-border text-ink-body'}`}
                      key={program.id}
                    >
                      <input
                        checked={checked}
                        className="accent-brand-600"
                        onChange={() => setSelected(checked ? programIds.filter((id) => id !== program.id) : [...programIds, program.id])}
                        type="checkbox"
                      />
                      {program.title}
                      {program.term ? <span className="text-xs text-ink-muted">{program.term}</span> : null}
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs font-semibold text-ink-muted">
                시작일
                <input className="mt-1 block h-10 rounded-xl border border-surface-border px-3 text-sm text-ink-strong" onChange={(e) => setFrom(e.target.value)} type="date" value={effectiveFrom} />
              </label>
              <label className="text-xs font-semibold text-ink-muted">
                종료일
                <input className="mt-1 block h-10 rounded-xl border border-surface-border px-3 text-sm text-ink-strong" onChange={(e) => setTo(e.target.value)} type="date" value={to} />
              </label>
              <label className="min-w-64 flex-1 text-xs font-semibold text-ink-muted">
                보고서 제목 (선택)
                <input
                  className="mt-1 block h-10 w-full rounded-xl border border-surface-border px-3 text-sm text-ink-strong"
                  maxLength={120}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="예: 2026-2학기 캡스톤디자인 운영 결과보고서"
                  value={title}
                />
              </label>
            </div>
            <details className="text-sm text-ink-muted">
              <summary className="cursor-pointer font-semibold text-ink-body">보고서 구성</summary>
              <ol className="mt-2 list-decimal space-y-0.5 pl-5">
                {SECTIONS.map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ol>
            </details>
            <Button className="gap-2" disabled={generate.isPending || programIds.length === 0} onClick={() => generate.mutate()}>
              {generate.isPending ? <Loader2 className="animate-spin" size={16} /> : <FileText size={16} />}
              {generate.isPending ? '집계·PDF 생성 중…' : 'PDF 결과보고서 생성'}
            </Button>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>생성된 보고서</CardTitle>
          <CardDescription>다운로드 링크는 권한 확인 후 짧은 시간 동안만 유효한 임시 주소로 발급됩니다.</CardDescription>
        </CardHeader>
        {query.data?.reports.length === 0 ? (
          <EmptyState description="위에서 기간과 프로그램을 선택해 첫 보고서를 만들어 보세요." title="아직 생성된 보고서가 없습니다" />
        ) : (
          <ul className="divide-y divide-surface-border">
            {query.data?.reports.map((report) => (
              <li className="flex flex-wrap items-center gap-3 py-3" key={report.id}>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold text-ink-strong">
                    {report.title}
                    <Badge tone="blue">제{report.version}판</Badge>
                    {report.status === 'failed' ? <Badge tone="red">실패</Badge> : report.status === 'pending' ? <Badge>생성 중</Badge> : null}
                    {report.narrativeSource ? <Badge tone={report.narrativeSource === 'ai' ? 'purple' : 'gray'}>{report.narrativeSource === 'ai' ? 'AI 서술' : '규칙 서술'}</Badge> : null}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {day(report.period.from)} ~ {day(report.period.to)} · {report.programIds.map((id) => programTitle.get(id) ?? '삭제된 프로그램').join(', ')} ·{' '}
                    {new Date(report.createdAt).toLocaleString('ko-KR')} · {report.createdBy?.name ?? ''} {formatSize(report.sizeBytes)}
                  </p>
                </div>
                {report.status === 'ready' ? (
                  <div className="flex gap-2">
                    <Button className="min-h-9 gap-1.5 py-1.5" onClick={() => open(report, true)} variant="secondary">
                      <ExternalLink size={14} /> 열기
                    </Button>
                    <Button className="min-h-9 gap-1.5 py-1.5" onClick={() => open(report, false)} variant="secondary">
                      <Download size={14} /> 다운로드
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
