import gsap from 'gsap'
import { useEffect, useRef, useState, type CSSProperties } from 'react'

const INTRO_SESSION_KEY = 'baesh-landing-intro-seen'

const FRAGMENTS = [
  { label: '해커톤', x: -38, y: -32, rotate: -12 },
  { label: '캡스톤', x: 36, y: -28, rotate: 8 },
  { label: '사이드', x: -42, y: 8, rotate: -6 },
  { label: 'MVP', x: 40, y: 14, rotate: 10 },
  { label: '데모데이', x: -18, y: 36, rotate: -4 },
  { label: '포트폴리오', x: 22, y: -40, rotate: 14 },
  { label: '팀 빌딩', x: -48, y: -8, rotate: 5 },
  { label: '프로토타입', x: 46, y: -6, rotate: -9 },
  { label: '오픈소스', x: 8, y: 42, rotate: 3 },
  { label: '런칭', x: -6, y: -44, rotate: -15 },
] as const

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

function markIntroSeen() {
  try {
    sessionStorage.setItem(INTRO_SESSION_KEY, '1')
  } catch {
    // ignore
  }
}

type LandingIntroProps = {
  onComplete: () => void
}

export function LandingIntro({ onComplete }: LandingIntroProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fragmentsRef = useRef<HTMLDivElement>(null)
  const brandRef = useRef<HTMLDivElement>(null)
  const logoRef = useRef<HTMLImageElement>(null)
  const copyRef = useRef<HTMLParagraphElement>(null)
  const ctaRef = useRef<HTMLButtonElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const ambientRef = useRef<HTMLDivElement>(null)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const idleTweensRef = useRef<gsap.core.Tween[]>([])
  const completedRef = useRef(false)
  const [readyForCta, setReadyForCta] = useState(false)

  const stopIdle = () => {
    idleTweensRef.current.forEach((tween) => tween.kill())
    idleTweensRef.current = []
  }

  const startIdleMotion = () => {
    stopIdle()

    const logo = logoRef.current
    const glow = glowRef.current
    const brand = brandRef.current
    const cta = ctaRef.current
    const ambientDots = ambientRef.current?.querySelectorAll('.landing-intro-ambient-dot')

    if (logo) {
      idleTweensRef.current.push(
        gsap.to(logo, {
          y: -7,
          duration: 2.8,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
        gsap.to(logo, {
          scale: 1.04,
          duration: 3.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      )
    }

    if (glow) {
      idleTweensRef.current.push(
        gsap.to(glow, {
          opacity: 0.55,
          scale: 1.18,
          duration: 3.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      )
    }

    if (brand) {
      idleTweensRef.current.push(
        gsap.to(brand, {
          y: -3,
          duration: 4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      )
    }

    if (cta) {
      idleTweensRef.current.push(
        gsap.to(cta, {
          boxShadow: '0 0 0 1px rgba(255,255,255,0.22), 0 0 28px rgba(255,255,255,0.12)',
          duration: 2.2,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
        gsap.to(cta.querySelector('.landing-intro-cta-arrow'), {
          x: 4,
          duration: 1.4,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        }),
      )
    }

    if (ambientDots?.length) {
      ambientDots.forEach((dot, index) => {
        idleTweensRef.current.push(
          gsap.to(dot, {
            y: `+=${12 + (index % 4) * 6}`,
            x: `+=${(index % 2 === 0 ? 1 : -1) * (8 + index * 2)}`,
            opacity: 0.35 + (index % 3) * 0.12,
            duration: 3.5 + index * 0.35,
            ease: 'sine.inOut',
            yoyo: true,
            repeat: -1,
            delay: index * 0.12,
          }),
        )
      })
    }
  }

  const finish = (animateOut: boolean) => {
    if (completedRef.current) {
      return
    }
    completedRef.current = true
    markIntroSeen()
    timelineRef.current?.kill()
    stopIdle()

    const root = rootRef.current
    if (!root || !animateOut) {
      document.body.style.overflow = ''
      onComplete()
      return
    }

    gsap.to(root, {
      yPercent: -110,
      opacity: 0.85,
      duration: 0.95,
      ease: 'power4.inOut',
      onComplete: () => {
        document.body.style.overflow = ''
        onComplete()
      },
    })
  }

  useEffect(() => {
    document.body.style.overflow = 'hidden'

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      finish(false)
      return
    }

    const fragments = fragmentsRef.current?.querySelectorAll('.landing-intro-fragment')
    const ambientDots = ambientRef.current?.querySelectorAll('.landing-intro-ambient-dot')
    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        setReadyForCta(true)
        startIdleMotion()
      },
    })
    timelineRef.current = tl

    gsap.set(brandRef.current, { opacity: 0, scale: 0.72, y: 18 })
    gsap.set(copyRef.current, { opacity: 0, y: 22 })
    gsap.set(ctaRef.current, { opacity: 0, y: 16 })
    gsap.set(glowRef.current, { opacity: 0, scale: 0.4 })
    if (ambientDots?.length) {
      gsap.set(ambientDots, { opacity: 0, scale: 0.4 })
    }

    if (fragments?.length) {
      gsap.set(fragments, {
        opacity: 0,
        scale: 0.85,
        xPercent: -50,
        yPercent: -50,
        x: (i) => `${FRAGMENTS[i]?.x ?? 0}vw`,
        y: (i) => `${FRAGMENTS[i]?.y ?? 0}vh`,
        rotation: (i) => FRAGMENTS[i]?.rotate ?? 0,
      })

      tl.to(fragments, {
        opacity: 0.9,
        scale: 1,
        duration: 0.85,
        stagger: { each: 0.05, from: 'random' },
        ease: 'power2.out',
      })
        .to(fragments, {
          x: 0,
          y: 0,
          rotation: 0,
          scale: 0.55,
          opacity: 0.35,
          duration: 1.35,
          stagger: { each: 0.03, from: 'edges' },
          ease: 'power3.inOut',
        })
        .to(
          fragments,
          {
            opacity: 0,
            scale: 0.2,
            duration: 0.55,
            ease: 'power2.in',
          },
          '-=0.25',
        )
    }

    tl.to(
      glowRef.current,
      {
        opacity: 1,
        scale: 1,
        duration: 0.9,
        ease: 'power2.out',
      },
      '-=0.2',
    )
      .to(
        brandRef.current,
        {
          opacity: 1,
          scale: 1,
          y: 0,
          duration: 0.95,
          ease: 'power4.out',
        },
        '-=0.55',
      )
      .to(
        copyRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.8,
          ease: 'power3.out',
        },
        '-=0.35',
      )
      .to(
        ctaRef.current,
        {
          opacity: 1,
          y: 0,
          duration: 0.7,
          ease: 'power3.out',
        },
        '-=0.35',
      )

    if (ambientDots?.length) {
      tl.to(
        ambientDots,
        {
          opacity: 0.28,
          scale: 1,
          duration: 1.1,
          stagger: 0.06,
          ease: 'power2.out',
        },
        '-=0.5',
      )
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        finish(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      timelineRef.current?.kill()
      stopIdle()
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only intro sequence
  }, [])

  useEffect(() => {
    if (!readyForCta) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault()
        finish(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readyForCta])

  return (
    <div
      aria-label="BAESH 인트로"
      aria-modal="true"
      className="landing-intro"
      ref={rootRef}
      role="dialog"
    >
      <button className="landing-intro-skip" onClick={() => finish(true)} type="button">
        Skip
      </button>

      <div aria-hidden className="landing-intro-glow" ref={glowRef} />

      <div aria-hidden className="landing-intro-ambient" ref={ambientRef}>
        {Array.from({ length: 12 }, (_, index) => (
          <span className="landing-intro-ambient-dot" key={index} style={{ '--i': index } as CSSProperties} />
        ))}
      </div>

      <div aria-hidden className="landing-intro-fragments" ref={fragmentsRef}>
        {FRAGMENTS.map((fragment) => (
          <div className="landing-intro-fragment" key={fragment.label}>
            <span className="landing-intro-fragment-dot" />
            <span>{fragment.label}</span>
          </div>
        ))}
      </div>

      <div className="landing-intro-stage">
        <div className="landing-intro-brand" ref={brandRef}>
          <img
            alt=""
            className="landing-intro-logo"
            height={140}
            ref={logoRef}
            src="/baesh-logo.png"
            width={140}
          />
          <span className="landing-intro-wordmark">BAESH</span>
        </div>

        <p className="landing-intro-copy" ref={copyRef}>
          프로젝트를 커리어 자산으로.
        </p>

        <button
          className="landing-intro-cta"
          disabled={!readyForCta}
          onClick={() => finish(true)}
          ref={ctaRef}
          type="button"
        >
          더 둘러보기
          <span aria-hidden className="landing-intro-cta-arrow">
            →
          </span>
        </button>
      </div>
    </div>
  )
}
