import type { Profile } from '../types/profile'

export function buildProfileMetaDescription(profile: Profile) {
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
  if (profile.skills.length > 0) {
    parts.push(profile.skills.slice(0, 8).join(', '))
  }
  const body = parts.join(' · ')
  return body
    ? `${profile.user.name} — ${body}`.slice(0, 160)
    : `${profile.user.name}의 BAESH 프로필`
}

function upsertMeta(attr: 'name' | 'property', key: string, content: string) {
  const selector =
    attr === 'name' ? `meta[name="${key}"]` : `meta[property="${key}"]`
  let element = document.querySelector(selector)
  if (!element) {
    element = document.createElement('meta')
    element.setAttribute(attr, key)
    document.head.appendChild(element)
  }
  element.setAttribute('content', content)
}

export function applyProfilePageMeta(profile: Profile, canonicalUrl: string) {
  const title = `${profile.user.name} · BAESH 프로필`
  const description = buildProfileMetaDescription(profile)

  document.title = title
  upsertMeta('name', 'description', description)
  upsertMeta('property', 'og:title', title)
  upsertMeta('property', 'og:description', description)
  upsertMeta('property', 'og:url', canonicalUrl)
  upsertMeta('property', 'og:type', 'profile')
  upsertMeta('property', 'og:site_name', 'BAESH')

  let canonical = document.querySelector('link[rel="canonical"]')
  if (!canonical) {
    canonical = document.createElement('link')
    canonical.setAttribute('rel', 'canonical')
    document.head.appendChild(canonical)
  }
  canonical.setAttribute('href', canonicalUrl)
}

export function clearProfilePageMeta() {
  document.title = 'BAESH'
  document.querySelector('meta[name="description"]')?.remove()
  document.querySelector('link[rel="canonical"]')?.remove()
  for (const key of ['og:title', 'og:description', 'og:url', 'og:type', 'og:site_name']) {
    document.querySelector(`meta[property="${key}"]`)?.remove()
  }
}
