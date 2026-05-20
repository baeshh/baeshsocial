import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * 라우트 변경 시 스크롤을 맨 위로 (딥링크·앵커 예외는 각 페이지에서 처리)
 */
export function ScrollToTop() {
  const { pathname, search } = useLocation()

  useEffect(() => {
    const params = new URLSearchParams(search)

    if (pathname.startsWith('/profile') && params.get('section') === 'updates') {
      return
    }

    if (pathname.startsWith('/p/') && params.has('comment')) {
      return
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, search])

  return null
}
