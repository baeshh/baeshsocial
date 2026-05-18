export function buildPostShareUrl(postId: string) {
  if (typeof window !== 'undefined') {
    return `${window.location.origin}/p/${postId}`
  }
  return `/p/${postId}`
}

export async function copyPostShareLink(postId: string) {
  const url = buildPostShareUrl(postId)
  await navigator.clipboard.writeText(url)
  return url
}
