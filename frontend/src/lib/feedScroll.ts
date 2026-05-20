/** Network 피드: 탭 재탭 시 맨 위로 스크롤 */
export const NETWORK_SCROLL_TOP_EVENT = 'baesh:network-scroll-top'

export function scrollFeedToTop(behavior: ScrollBehavior = 'smooth') {
  window.scrollTo({ top: 0, left: 0, behavior })
}

/** 모바일·PWA에서 확실히 맨 위로 (smooth가 무시되는 경우 대비) */
export function forceScrollFeedToTop() {
  window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

export function dispatchNetworkScrollTop() {
  window.dispatchEvent(new CustomEvent(NETWORK_SCROLL_TOP_EVENT))
}

/** refetch·invalidate 후 스크롤이 튀지 않도록 현재 위치 복원 */
export async function withPreservedScroll(run: () => Promise<unknown>) {
  const scrollY = window.scrollY
  try {
    await run()
  } finally {
    requestAnimationFrame(() => {
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
    })
  }
}
