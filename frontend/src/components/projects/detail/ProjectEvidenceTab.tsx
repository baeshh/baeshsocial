import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EVIDENCE_STATUS_META } from '../../../lib/programs'
import { Badge } from '../../common/Badge'
import { ProjectEvidencePanel } from '../../evidence/ProjectEvidencePanel'
import type { ProjectDetailContext } from './projectDetailContext'
import { ProjectSection } from './ProjectSection'

const FLOW = ['draft', 'submitted', 'approved', 'rejected'] as const

export function ProjectEvidenceTab({ ctx }: { ctx: ProjectDetailContext }) {
  const { project, isProgramStaff } = ctx

  if (!project.program) {
    return (
      <ProjectSection title="증빙·기관 검증">
        <div className="space-y-2 text-sm leading-6 text-ink-body">
          <p>
            개인 프로젝트에서는 활동 증빙 제출과 기관 검증을 사용할 수 없습니다. 작업·활동·파일 기록은 팀이 직접 남긴 기록이며, 프로필에서도 검증된 성과로 표시되지 않습니다.
          </p>
          <p className="text-ink-muted">
            기관 프로그램에 참여 중이라면 프로그램 화면에서 이 프로젝트의 연결을 요청할 수 있습니다. 담당자가 승인하면 이곳에서 증빙을 제출해 검증받을 수 있습니다.
          </p>
        </div>
      </ProjectSection>
    )
  }

  return (
    <div className="space-y-4">
      <ProjectSection title="증빙과 검증 절차">
        <ol aria-label="증빙 상태 단계" className="flex flex-wrap items-center gap-1.5 text-xs">
          {FLOW.map((status, index) => (
            <li className="flex items-center gap-1.5" key={status}>
              <Badge tone={EVIDENCE_STATUS_META[status].tone}>{EVIDENCE_STATUS_META[status].label}</Badge>
              {index < FLOW.length - 2 ? <ArrowRight aria-hidden className="text-ink-muted" size={12} /> : null}
              {index === FLOW.length - 2 ? <span className="text-ink-muted">또는</span> : null}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm leading-6 text-ink-body">
          팀원이 사진·영상·보고서를 첨부해 제출하면 {project.program.organization.name} 담당자가 검토합니다. 반려된 증빙은 고쳐서 다시 제출할 수 있습니다.
        </p>
        <p className="mt-2 flex gap-2 rounded-xl bg-success-50/60 p-3 text-sm leading-6 text-ink-body">
          <ShieldCheck aria-hidden className="mt-1 shrink-0 text-success-700" size={16} />
          <span>
            승인된 증빙만 기관 인증 기록이 되어 작성자 프로필의 ‘경력·이력 &gt; 검증된 성과’에 표시됩니다. 검토 대기·반려·임시저장 증빙은 검증된 성과로 표시되지 않습니다.
            {!isProgramStaff ? (
              <>
                {' '}
                <Link className="font-semibold text-success-700 underline-offset-2 hover:underline" to="/profile?tab=experience&type=verified">
                  내 검증된 성과 보기
                </Link>
              </>
            ) : null}
          </span>
        </p>
      </ProjectSection>
      <ProjectEvidencePanel projectId={project.id} />
    </div>
  )
}
