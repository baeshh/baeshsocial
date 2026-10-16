import { Prisma, ProjectLinkType } from '@prisma/client'
import { HttpError } from './httpError.js'

export const MAX_LINKS_PER_PROJECT = 20

/** Display order on project pages and profile cards. */
export const LINK_TYPE_ORDER: ProjectLinkType[] = [
  ProjectLinkType.GITHUB,
  ProjectLinkType.DEPLOYMENT,
  ProjectLinkType.FIGMA,
  ProjectLinkType.NOTION,
  ProjectLinkType.GOOGLE_DRIVE,
  ProjectLinkType.OTHER,
]

const SERVICE_LABELS: Record<ProjectLinkType, string> = {
  GITHUB: 'GitHub 저장소',
  FIGMA: 'Figma 디자인',
  NOTION: 'Notion 문서',
  GOOGLE_DRIVE: 'Google Drive',
  DEPLOYMENT: '배포 사이트',
  OTHER: '외부 링크',
}

type AnalyzedLink = {
  type: ProjectLinkType
  url: string
  metadata: Record<string, string> | null
  defaultLabel: string
}

function hostMatches(host: string, domain: string) {
  return host === domain || host.endsWith(`.${domain}`)
}

function detectType(host: string): ProjectLinkType | null {
  if (host === 'github.com' || host === 'www.github.com') return ProjectLinkType.GITHUB
  if (hostMatches(host, 'figma.com')) return ProjectLinkType.FIGMA
  if (hostMatches(host, 'notion.so') || hostMatches(host, 'notion.site')) return ProjectLinkType.NOTION
  if (host === 'drive.google.com' || host === 'docs.google.com') return ProjectLinkType.GOOGLE_DRIVE
  return null
}

const GITHUB_NAME = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,99})$/
const FIGMA_KINDS = new Set(['file', 'design', 'proto', 'board', 'slides', 'deck'])

/**
 * Validates a user-supplied link and normalizes it per service. Links are only displayed (never
 * fetched server-side), but every type is still pinned to its expected host so a "GitHub" badge
 * can't point somewhere else.
 */
export function analyzeExternalLink(rawUrl: string, requestedType?: ProjectLinkType): AnalyzedLink {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new HttpError(400, '올바른 URL 형식이 아닙니다.')
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new HttpError(400, 'http 또는 https 주소만 연결할 수 있습니다.')
  }
  if (parsed.username || parsed.password) {
    throw new HttpError(400, '계정 정보가 포함된 URL은 연결할 수 없습니다.')
  }

  const host = parsed.hostname.toLowerCase()
  const detected = detectType(host)
  const type = requestedType ?? detected ?? ProjectLinkType.OTHER
  const isServiceType = type !== ProjectLinkType.DEPLOYMENT && type !== ProjectLinkType.OTHER

  if (isServiceType && detected !== type) {
    throw new HttpError(400, `${SERVICE_LABELS[type]} 주소가 아닙니다. 링크 유형을 확인해 주세요.`)
  }
  if (isServiceType && parsed.protocol !== 'https:') {
    throw new HttpError(400, `${SERVICE_LABELS[type]} 주소는 https로 시작해야 합니다.`)
  }

  if (type === ProjectLinkType.GITHUB) {
    const [owner, repoRaw] = parsed.pathname.split('/').filter(Boolean)
    const repo = repoRaw?.replace(/\.git$/i, '')
    if (!owner || !repo || !GITHUB_NAME.test(owner) || !GITHUB_NAME.test(repo)) {
      throw new HttpError(400, 'GitHub 저장소 주소(https://github.com/소유자/저장소)를 입력해 주세요.')
    }
    return {
      type,
      url: `https://github.com/${owner}/${repo}`,
      metadata: { owner, repo },
      defaultLabel: `${owner}/${repo}`,
    }
  }

  if (type === ProjectLinkType.FIGMA) {
    const [kind, fileKey] = parsed.pathname.split('/').filter(Boolean)
    if (!kind || !FIGMA_KINDS.has(kind) || !fileKey) {
      throw new HttpError(400, 'Figma 파일 또는 프로토타입 공유 주소를 입력해 주세요.')
    }
    return { type, url: parsed.toString(), metadata: { fileKey }, defaultLabel: SERVICE_LABELS[type] }
  }

  parsed.hash = type === ProjectLinkType.NOTION ? '' : parsed.hash
  return {
    type,
    url: parsed.toString(),
    metadata: null,
    defaultLabel: isServiceType ? SERVICE_LABELS[type] : host.replace(/^www\./, ''),
  }
}

export const projectLinkSelect = {
  id: true,
  type: true,
  url: true,
  label: true,
  description: true,
  sortOrder: true,
  createdAt: true,
} as const

export type ProjectLinkRecord = Prisma.ProjectExternalLinkGetPayload<{ select: typeof projectLinkSelect }>

type LinkRow = { type: ProjectLinkType; sortOrder: number; createdAt: Date }

export function sortLinks<T extends LinkRow>(links: T[]) {
  return [...links].sort(
    (a, b) =>
      LINK_TYPE_ORDER.indexOf(a.type) - LINK_TYPE_ORDER.indexOf(b.type) ||
      a.sortOrder - b.sortOrder ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  )
}

export function serializeLink(link: LinkRow & { id: string; url: string; label: string | null; description?: string | null }) {
  return {
    id: link.id,
    type: link.type.toLowerCase(),
    url: link.url,
    label: link.label,
    description: link.description ?? null,
  }
}
