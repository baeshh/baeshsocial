import { Link } from 'react-router-dom'
import { Badge } from '../common/Badge'
import { Button } from '../common/Button'
import { EmptyState } from '../common/EmptyState'
import type { ProfileProject } from '../../types/profile'

type ProfileProjectsPanelProps = {
  projects: ProfileProject[]
  isOwnProfile: boolean
}

export function ProfileProjectsPanel({ projects, isOwnProfile }: ProfileProjectsPanelProps) {
  if (projects.length === 0) {
    return (
      <EmptyState
        action={
          isOwnProfile ? (
            <Button to="/projects" variant="secondary">
              프로젝트 만들기
            </Button>
          ) : undefined
        }
        description={
          isOwnProfile
            ? 'Projects에서 팀 프로젝트를 만들면 프로필에 자동으로 표시됩니다.'
            : '등록된 프로젝트 이력이 없습니다.'
        }
        title="아직 프로젝트가 없습니다"
      />
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-2">
        {projects.map((project) => (
          <Link
            className="rounded-xl border border-surface-border p-4 transition hover:border-brand-200 hover:bg-brand-50/30"
            key={project.id}
            to={`/projects/${project.id}`}
          >
            <p className="font-bold text-ink-strong">{project.title}</p>
            <p className="mt-2 line-clamp-2 text-sm text-ink-muted">
              {project.description ?? '프로젝트 설명이 없습니다.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge tone="purple">{project.status}</Badge>
              <Badge>{project.progress}%</Badge>
              {project.memberRole ? <Badge>{project.memberRole}</Badge> : null}
            </div>
          </Link>
        ))}
      </div>
      {isOwnProfile ? (
        <Link className="text-sm font-semibold text-brand-600 hover:underline" to="/projects">
          Projects에서 관리하기 →
        </Link>
      ) : null}
    </div>
  )
}
