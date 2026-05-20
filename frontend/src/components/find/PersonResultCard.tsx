import { Link } from 'react-router-dom'
import { Avatar } from '../common/Avatar'
import { Badge } from '../common/Badge'
import type { SearchResult } from '../../services/searchService'

type PersonResultCardProps = {
  person: SearchResult
}

export function PersonResultCard({ person }: PersonResultCardProps) {
  return (
    <Link
      className="flex gap-3 rounded-2xl border border-surface-border bg-white p-4 shadow-sm transition hover:border-brand-200 hover:shadow-md"
      to={`/profile/${person.userId}`}
    >
      <Avatar className="shrink-0" name={person.name} src={person.avatarUrl} />
      <div className="min-w-0 flex-1">
        <p className="font-bold text-ink-strong">{person.name}</p>
        {person.headline ? (
          <p className="mt-0.5 truncate text-sm text-ink-body">{person.headline}</p>
        ) : null}
        {(person.company || person.school) && (
          <p className="mt-1 truncate text-xs text-ink-muted">
            {[person.company, person.school].filter(Boolean).join(' · ')}
          </p>
        )}
        {person.skills.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {person.skills.slice(0, 4).map((skill) => (
              <Badge key={skill} tone="blue">
                {skill}
              </Badge>
            ))}
          </div>
        ) : null}
        {person.matchReasons.length > 0 ? (
          <p className="mt-2 text-xs text-brand-600">{person.matchReasons.join(' · ')}</p>
        ) : null}
      </div>
    </Link>
  )
}
