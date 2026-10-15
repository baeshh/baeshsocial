import { Plus } from 'lucide-react'
import { Avatar } from '../../common/Avatar'
import type { ProjectDetailContext, ProjectTabId } from './projectDetailContext'

/** Desktop side column: who is on the team and the latest shared files, one click from their tabs. */
export function ProjectSummaryAside({ ctx, onSelectTab, onInvite }: { ctx: ProjectDetailContext; onSelectTab: (id: ProjectTabId) => void; onInvite: () => void }) {
  const { project, can, pendingInvites, restricted } = ctx
  return (
    <aside aria-label="프로젝트 요약" className="hidden space-y-4 lg:block">
      <section aria-labelledby="aside-team" className="rounded-2xl border border-surface-border bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-ink-strong" id="aside-team">
            팀 {project.members.length}명
          </h2>
          {can('members.invite') ? (
            <button aria-label="팀원 초대" className="rounded-full p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink-strong" onClick={onInvite} type="button">
              <Plus aria-hidden size={16} />
            </button>
          ) : null}
        </div>
        <ul className="space-y-2.5">
          {project.members.slice(0, 6).map((member) => (
            <li className="flex items-center gap-2.5" key={member.id}>
              <Avatar name={member.user.name} size="sm" src={member.user.avatarUrl} />
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink-strong">{member.user.name}</p>
                <p className="truncate text-xs text-ink-muted">{member.projectRole?.name ?? member.role}</p>
              </div>
            </li>
          ))}
        </ul>
        {can('members.invite') && pendingInvites.length > 0 ? <p className="mt-2 text-xs text-warning-700">응답 대기 초대 {pendingInvites.length}건</p> : null}
        <button className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => onSelectTab('members')} type="button">
          팀원·권한 보기
        </button>
      </section>

      {can('files.view') && !restricted ? (
        <section aria-labelledby="aside-files" className="rounded-2xl border border-surface-border bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-ink-strong" id="aside-files">
            최근 파일
          </h2>
          {project.files.length === 0 ? (
            <p className="text-sm text-ink-muted">연결된 파일이 없습니다.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {project.files.slice(0, 5).map((file) => (
                <li className="truncate text-ink-body" key={file.id}>
                  <span className="font-semibold text-ink-strong">{file.name}</span>
                  <span className="text-ink-muted"> · {file.fileType}</span>
                </li>
              ))}
            </ul>
          )}
          <button className="mt-3 text-sm font-semibold text-brand-700 hover:underline" onClick={() => onSelectTab('files')} type="button">
            파일 전체 보기
          </button>
        </section>
      ) : null}
    </aside>
  )
}
