import { cn } from '../../lib/cn'
import type { ProjectLink } from '../../types/profile'
import { PROJECT_LINK_META } from './projectLinkMeta'

type ProjectLinkChipsProps = {
  links: ProjectLink[]
  max?: number
  size?: 'sm' | 'md'
  className?: string
}

export function ProjectLinkChips({ links, max = 4, size = 'sm', className }: ProjectLinkChipsProps) {
  if (links.length === 0) {
    return null
  }
  const visible = links.slice(0, max)
  const hidden = links.length - visible.length

  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {visible.map((link) => {
        const meta = PROJECT_LINK_META[link.type]
        const Icon = meta.icon
        return (
          <a
            className={cn(
              'inline-flex max-w-full items-center gap-1.5 rounded-full border font-semibold transition',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-sm',
              meta.tone,
            )}
            href={link.url}
            key={link.id}
            onClick={(event) => event.stopPropagation()}
            rel="noopener noreferrer nofollow"
            target="_blank"
            title={link.url}
          >
            <Icon className="shrink-0" size={size === 'sm' ? 13 : 15} />
            <span className="truncate">{link.type === 'github' || link.type === 'deployment' ? meta.label : (link.label ?? meta.label)}</span>
          </a>
        )
      })}
      {hidden > 0 ? (
        <span className="inline-flex items-center rounded-full border border-surface-border px-2.5 py-1 text-xs font-semibold text-ink-muted">
          +{hidden}
        </span>
      ) : null}
    </div>
  )
}
