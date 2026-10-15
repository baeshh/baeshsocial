import { Eye, EyeOff } from 'lucide-react'
import { useProfileDisplay } from '../../../hooks/useProfileDisplay'
import { Button } from '../../common/Button'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

/** The viewer's personal setting: separate from the team's visibility setting and from institution retention. */
export function ProfileDisplaySection({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, profileDisplay } = ctx
  const toggle = useProfileDisplay()
  if (!profileDisplay.canSet) return null
  const { hidden } = profileDisplay

  return (
    <ProjectSection
      description="이 프로젝트가 내 프로필, 공개 포트폴리오, 대표 프로젝트, 기업 인재 검색에 보이는지 정합니다. 나에게만 적용됩니다."
      title="내 프로필 표시"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-ink-strong" role="status">
        {hidden ? <EyeOff aria-hidden className="text-ink-muted" size={16} /> : <Eye aria-hidden className="text-success-700" size={16} />}
        {hidden ? '내 프로필에서 숨김' : '내 프로필에 표시 중'}
      </p>
      <p className="mt-2 text-sm leading-6 text-ink-body">
        숨겨도 팀 작업 접근, 다른 팀원의 프로필은 바뀌지 않습니다.
        {project.program ? ' 기관의 운영·검증 기록도 공식 기록으로 그대로 보존됩니다.' : ' 기관 검증 기록이 있다면 그대로 보존됩니다.'}
        {hidden ? ' 다시 표시하면 대표 프로젝트 고정도 복구됩니다.' : ''}
      </p>
      <div className="mt-3">
        <Button
          loading={toggle.isPending}
          onClick={() => toggle.mutate({ projectId: project.id, hidden: !hidden })}
          type="button"
          variant="secondary"
        >
          {hidden ? <Eye aria-hidden size={16} /> : <EyeOff aria-hidden size={16} />}
          {hidden ? '내 프로필에 다시 표시' : '내 이력에서 숨기기'}
        </Button>
      </div>
    </ProjectSection>
  )
}
