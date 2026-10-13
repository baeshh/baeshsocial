import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useManagerCandidates } from '../../hooks/useManagerCandidates'
import { programToForm, toProgramPayload } from '../../lib/programForm'
import { deleteProgram, updateProgram } from '../../services/programService'
import { useAuthStore } from '../../stores/authStore'
import { showToast } from '../../stores/toastStore'
import type { Program, ProgramAccess } from '../../types/program'
import { Button } from '../common/Button'
import { Card, CardDescription, CardHeader, CardTitle } from '../common/Card'
import { ProgramFormFields } from './ProgramFormFields'

export function ProgramSettingsPanel({ program, access }: { program: Program; access: ProgramAccess }) {
  const token = useAuthStore((s) => s.token)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState(() => programToForm(program))
  const [error, setError] = useState<string | null>(null)
  const managerCandidates = useManagerCandidates(program.organizationId, access.isOrgAdmin)

  const save = useMutation({
    mutationFn: () =>
      updateProgram(token!, program.id, {
        ...toProgramPayload(form),
        ...(access.isOrgAdmin ? { managerUserIds: form.managerUserIds } : {}),
      }),
    onSuccess: () => {
      showToast('프로그램 정보를 저장했습니다.')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      void queryClient.invalidateQueries({ queryKey: ['organizations'] })
    },
    onError: (err: Error) => setError(err.message),
  })
  const remove = useMutation({
    mutationFn: () => deleteProgram(token!, program.id),
    onSuccess: () => {
      showToast('프로그램을 삭제했습니다.', 'info')
      void queryClient.invalidateQueries({ queryKey: ['programs'] })
      navigate(`/org/${program.organizationId}?tab=programs`)
    },
    onError: (err: Error) => showToast(err.message, 'error'),
  })

  return (
    <div className="space-y-5">
      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="text-lg">프로그램 정보</CardTitle>
          <CardDescription>
            {access.isOrgAdmin ? '담당자 지정은 조직 관리자만 변경할 수 있습니다.' : '담당자 변경은 조직 관리자에게 요청하세요.'} 보관 상태로 바꾸면
            프로젝트·참여자·증빙이 더 이상 수정되지 않습니다.
          </CardDescription>
        </CardHeader>
        <form
          className="space-y-5"
          onSubmit={(event) => {
            event.preventDefault()
            setError(null)
            save.mutate()
          }}
        >
          <ProgramFormFields canEditManagers={access.isOrgAdmin} managerCandidates={managerCandidates} onChange={setForm} value={form} />
          {error ? <p className="rounded-xl bg-red-50 px-4 py-2 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="flex justify-end">
            <Button disabled={save.isPending} type="submit">
              {save.isPending ? '저장 중…' : '저장'}
            </Button>
          </div>
        </form>
      </Card>

      {access.isOrgAdmin ? (
        <Card className="rounded-2xl border-red-200">
          <CardHeader>
            <CardTitle className="text-lg text-red-700">프로그램 삭제</CardTitle>
            <CardDescription>프로젝트가 하나도 없는 프로그램만 삭제할 수 있습니다. 운영이 끝난 프로그램은 보관 상태로 바꿔 기록을 남기세요.</CardDescription>
          </CardHeader>
          <Button
            className="w-fit"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm(`'${program.title}' 프로그램을 삭제할까요?`)) remove.mutate()
            }}
            variant="danger"
          >
            삭제
          </Button>
        </Card>
      ) : null}
    </div>
  )
}
