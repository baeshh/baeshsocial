import { BookOpen, Globe, HardDrive, Link2, PenTool, type LucideProps } from 'lucide-react'
import { createElement, type ComponentType } from 'react'
import type { ProjectLinkType } from '../../types/profile'

const GITHUB_MARK_PATH =
  'M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z'

function GithubMark({ size = 16, className }: LucideProps) {
  return createElement(
    'svg',
    { 'aria-hidden': true, className, fill: 'currentColor', height: size, viewBox: '0 0 16 16', width: size },
    createElement('path', { d: GITHUB_MARK_PATH }),
  )
}

export const PROJECT_LINK_META: Record<
  ProjectLinkType,
  { label: string; icon: ComponentType<LucideProps>; tone: string }
> = {
  github: { label: 'GitHub', icon: GithubMark, tone: 'border-slate-300 bg-slate-900 text-white hover:bg-slate-800' },
  deployment: { label: '서비스', icon: Globe, tone: 'border-brand-200 bg-brand-50 text-brand-700 hover:bg-brand-100' },
  figma: { label: 'Figma', icon: PenTool, tone: 'border-pink-200 bg-pink-50 text-pink-700 hover:bg-pink-100' },
  notion: { label: 'Notion', icon: BookOpen, tone: 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50' },
  google_drive: {
    label: 'Drive',
    icon: HardDrive,
    tone: 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100',
  },
  other: { label: '링크', icon: Link2, tone: 'border-surface-border bg-white text-ink-body hover:bg-surface-muted' },
}

/** Client-side hint only; the server decides the final type from the host. */
export function guessLinkType(rawUrl: string): ProjectLinkType | null {
  try {
    const host = new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, '')
    if (host === 'github.com') return 'github'
    if (host === 'figma.com' || host.endsWith('.figma.com')) return 'figma'
    if (host === 'notion.so' || host.endsWith('.notion.so') || host === 'notion.site' || host.endsWith('.notion.site')) {
      return 'notion'
    }
    if (host === 'drive.google.com' || host === 'docs.google.com') return 'google_drive'
    return 'deployment'
  } catch {
    return null
  }
}
