export function buildProfileShareUrl(userId: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/u/${userId}`
  }
  return `/u/${userId}`
}

export async function copyProfileShareLink(userId: string) {
  const url = buildProfileShareUrl(userId)
  await navigator.clipboard.writeText(url)
  return url
}
