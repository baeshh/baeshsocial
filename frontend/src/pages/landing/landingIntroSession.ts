const INTRO_SESSION_KEY = 'baesh-landing-intro-seen'

export function shouldShowLandingIntro() {
  if (typeof window === 'undefined') {
    return false
  }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    return false
  }
  try {
    return sessionStorage.getItem(INTRO_SESSION_KEY) !== '1'
  } catch {
    return true
  }
}

export function markIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, '1')
  } catch {
    // ignore
  }
}
