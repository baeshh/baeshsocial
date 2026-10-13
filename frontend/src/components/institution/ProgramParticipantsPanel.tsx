import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Crown } from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  addProgramParticipants,
  getProgramParticipants,
  removeProgramParticipant,
  type ParticipantInput,
} from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program } from '../../types/program'
import { Avatar } from '../common/Avatar'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { LoadingState } from '../common/LoadingState'

/** One participant per line: "email[, 학번[, 학과]]". */
function parseLines(text: string): ParticipantInput[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [email, studentNo, department] = line.split(/[,\t]/).map((part) => part.trim())
      return { email: email.toLowerCase(), studentNo: studentNo || undefined, department: department || undefined }
    })
}

type Report = { added: number; approved: number; skipped: Array<{ input: string; reason: string }> }

export function ProgramParticipantsPanel({ program }: { program: Program }) {
  const token = useAuthStore((s) => s.token)
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const [report, setReport] = useState<Report | null>(null)
  const [search, setSearch] = useState('')
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)
  const writable = program.status !== 'archived'

  const participantsQuery = useQuery({
    queryKey: ['programs', program.id, 'participants'],
    queryFn: () => getProgramParticipants(token!, program.id),
    enabled: Boolean(token),
  })

  const add = useMutation({
    mutationFn: () => addProgramParticipants(token!, program.id, parseLines(text)),
    onSuccess: (result) => {
      setReport({ added: result.added.length, approved: result.approvedMemberships.length, skipped: result.skipped })
      if (result.skipped.length === 0) setText('')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: (userId: string) => removeProgramParticipant(token!, program.id, userId),
    onSuccess: () => {
      showToast('참여자에서 제외했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs', program.id] })
    },
    onError: (error: Error) => showToast(error.message, 'error'),
  })

  const participants = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (participantsQuery.data?.participants ?? []).filter((p) => {
      if (onlyUnassigned && p.team) return false
      return !q || [p.user.name, p.user.email, p.studentNo ?? '', p.department ?? '', p.team?.teamName ?? ''].some((v) => v.toLowerCase().includes(q))
    })
  }, [participantsQuery.data, search, onlyUnassigned])

  if (participantsQuery.isLoading) return <LoadingState />
  if (participantsQuery.isError) return <p className="text-sm text-red-700">{(participantsQuery.error as Error).message}</p>

  const total = participantsQuery.data?.participants.length ?? 0
  const unassigned = participantsQuery.data?.participants.filter((p) => !p.team).length ?? 0
  const lineCount = parseLines(text).length

  return (
    <div className="space-y-5">
      {writable ? (
        <Card className="rounded-2xl">
          <CardHeader>
            <CardTitle className="text-lg">참여 학생 등록</CardTitle>
            <CardDescription>
              한 줄에 한 명씩 <code className="rounded bg-surface-muted px-1">이메일, 학번, 학과</code> 형식으로 붙여 넣으세요. 조직에
              가입 신청한 학생은 등록과 함께 구성원으로 승인되고, 가입하지 않은 학생은 사유와 함께 제외됩니다.
            </CardDescription>
          </CardHeader>
          <textarea
            className="min-h-32 w-full rounded-2xl border border-surface-border px-4 py-3 font-mono text-sm outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-100"
            onChange={(e) => setText(e.target.value)}
            placeholder={'student1@kiu.ac.kr, 20260001, 컴퓨터공학과\nstudent2@kiu.ac.kr, 20260002'}
            value={text}
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-ink-muted">{lineCount}명 입력됨 (최대 300명)</span>
            <Button disabled={lineCount === 0 || lineCount > 300 || add.isPending} onClick={() => add.mutate()}>
              {add.isPending ? '등록 중…' : '등록'}
            </Button>
          </div>
          {report ? (
            <div className="mt-4 rounded-2xl border border-surface-border bg-surface-muted/40 p-4 text-sm">
              <p className="font-semibold text-ink-strong">
                {report.added}명 등록{report.approved ? ` · 가입 승인 ${report.approved}명` : ''}
                {report.skipped.length ? ` · 제외 ${report.skipped.length}명` : ''}
              </p>
              {report.skipped.length ? (
                <ul className="mt-2 space-y-1 text-xs text-red-700">
                  {report.skipped.map((item) => (
                    <li key={item.input}>
                      <b>{item.input}</b> — {item.reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="overflow-hidden rounded-2xl p-0">
        <div className="flex flex-wrap items-center gap-3 border-b border-surface-border px-5 py-4">
          <p className="font-bold text-ink-strong">
            참여 학생 {total}명 <span className="text-sm font-medium text-ink-muted">· 팀 미배정 {unassigned}명</span>
          </p>
          <div className="ml-auto flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-body">
              <input checked={onlyUnassigned} onChange={(e) => setOnlyUnassigned(e.target.checked)} type="checkbox" />
              미배정만
            </label>
            <input
              className="h-9 w-56 rounded-full border border-surface-border px-4 text-sm outline-none focus:border-brand-500"
              onChange={(e) => setSearch(e.target.value)}
              placeholder="이름·학번·팀 검색"
              value={search}
            />
          </div>
        </div>
        {participants.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-muted">{total === 0 ? '등록된 참여 학생이 없습니다.' : '조건에 맞는 학생이 없습니다.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-surface-muted/60 text-left text-xs font-semibold text-ink-muted">
                <tr>
                  <th className="px-5 py-3">학생</th>
                  <th className="px-3 py-3">학번 · 학과</th>
                  <th className="px-3 py-3">팀</th>
                  <th className="px-3 py-3 text-right">대기 / 승인 / 반려</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {participants.map((p) => (
                  <tr key={p.id}>
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2">
                        <Avatar name={p.user.name} size="sm" src={p.user.avatarUrl} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-strong">{p.user.name}</p>
                          <p className="truncate text-xs text-ink-muted">{p.user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-ink-body">{[p.studentNo, p.department].filter(Boolean).join(' · ') || '—'}</td>
                    <td className="px-3 py-2.5 text-xs">
                      {p.team ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-ink-strong">
                          {p.team.teamRole === 'leader' ? <Crown className="text-amber-500" size={12} /> : null}
                          {p.team.teamName ?? p.team.title}
                        </span>
                      ) : (
                        <span className="text-amber-700">미배정</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right text-xs">
                      <span className="font-semibold text-accent-600">{p.evidence.submitted}</span> /{' '}
                      <span className="font-semibold text-emerald-700">{p.evidence.approved}</span> /{' '}
                      <span className="font-semibold text-red-600">{p.evidence.rejected}</span>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      {writable ? (
                        <button
                          className="text-xs font-semibold text-ink-muted hover:text-red-600"
                          onClick={() => {
                            if (window.confirm(`${p.user.name}님을 프로그램에서 제외할까요? 팀 배정도 함께 해제됩니다.`)) remove.mutate(p.userId)
                          }}
                          type="button"
                        >
                          제외
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
