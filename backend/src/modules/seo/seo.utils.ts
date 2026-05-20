export function getSiteOrigin(frontendUrl: string) {
  return frontendUrl.replace(/\/$/, '')
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

type SeoProfileInput = {
  name: string
  headline: string | null
  bio: string | null
  school: string | null
  company: string | null
  location: string | null
  skills: string[]
}

export function buildProfileDescription(profile: SeoProfileInput) {
  const parts: string[] = []
  if (profile.headline?.trim()) {
    parts.push(profile.headline.trim())
  }
  if (profile.bio?.trim()) {
    parts.push(profile.bio.trim())
  }
  if (profile.company?.trim()) {
    parts.push(profile.company.trim())
  }
  if (profile.school?.trim()) {
    parts.push(profile.school.trim())
  }
  if (profile.skills.length > 0) {
    parts.push(profile.skills.slice(0, 8).join(', '))
  }
  const body = parts.join(' · ')
  return body
    ? `${profile.name} — ${body}`.slice(0, 160)
    : `${profile.name}의 BAESH 프로필. 프로젝트·성장 이력을 확인하세요.`
}

export function buildProfileTitle(name: string) {
  return `${name} · BAESH 프로필`
}
