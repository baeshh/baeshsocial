import { useQuery } from '@tanstack/react-query'
import gsap from 'gsap'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { BaeshLogo } from '../../components/common/BaeshLogo'
import { getBetaOpenLabel, getMemberCountDisplay } from '../../lib/formatPublicStats'
import { getPublicStats } from '../../services/publicService'
import './landing.css'
import { useLandingBackground } from './useLandingBackground'

const HEADER_OFFSET = 100

function scrollToSection(sectionId: string) {
  const target = document.getElementById(sectionId)
  if (!target) {
    return
  }
  const top = target.getBoundingClientRect().top + window.pageYOffset - HEADER_OFFSET
  window.scrollTo({ top, behavior: 'smooth' })
}

function ArrowIcon() {
  return (
    <svg
      aria-hidden
      className="icon-arrow"
      viewBox="0 0 24 24"
    >
      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function LandingPage() {
  const canvasRef = useRef<HTMLDivElement>(null)
  useLandingBackground(canvasRef)

  const statsQuery = useQuery({
    queryKey: ['public', 'stats'],
    queryFn: getPublicStats,
    staleTime: 60_000,
    retry: 1,
  })

  const memberDisplay = getMemberCountDisplay(statsQuery.data?.userCount)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('active')
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 },
    )

    document.querySelectorAll('.landing-page .reveal').forEach((el) => observer.observe(el))

    gsap.to('#anim-1', { y: 0, opacity: 1, duration: 1.2, ease: 'power4.out', delay: 0.15 })
    gsap.to('#anim-2', { y: 0, opacity: 1, duration: 1.2, ease: 'power4.out', delay: 0.3 })
    gsap.to('#anim-3', { y: 0, opacity: 1, duration: 1.2, ease: 'power4.out', delay: 0.45 })
    gsap.to('#anim-4', { y: 0, opacity: 1, duration: 1.2, ease: 'power4.out', delay: 0.6 })
    gsap.to('#anim-5', { y: 0, opacity: 1, duration: 1.2, ease: 'power4.out', delay: 0.75 })
    gsap.to('#anim-6', { opacity: 1, duration: 1.5, ease: 'power2.out', delay: 1.4 })

    return () => observer.disconnect()
  }, [])

  return (
    <div className="landing-page">
      <svg aria-hidden className="svg-defs" focusable="false">
        <defs>
          <linearGradient id="svg-gradient" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#4285f4" />
            <stop offset="100%" stopColor="#9b72cb" />
          </linearGradient>
        </defs>
      </svg>

      <div id="canvas-container" ref={canvasRef} />

      <div className="ui-layer">
        <header className="lp-header">
          <BaeshLogo className="logo" imageClassName="h-10 w-10" to="/" />
          <nav className="nav-links">
            <button onClick={() => scrollToSection('intro')} type="button">
              서비스 소개
            </button>
            <button onClick={() => scrollToSection('why-baesh')} type="button">
              왜 BAESH인가
            </button>
            <button onClick={() => scrollToSection('flow')} type="button">
              이용 흐름
            </button>
          </nav>
          <div className="header-actions">
            <Link className="btn-nav" to="/auth/register">
              합류하기
            </Link>
          </div>
        </header>

        <section className="hero" id="intro">
          <div className="hero-ecosystem" id="anim-1">
            <p className="hero-ecosystem-text">
              {statsQuery.isLoading ? (
                <span className="hero-ecosystem-loading">멤버 수 불러오는 중…</span>
              ) : memberDisplay?.kind === 'members' ? (
                <>
                  현재{' '}
                  <strong className="hero-ecosystem-count">
                    {memberDisplay.count.toLocaleString('ko-KR')}명
                  </strong>
                  이 프로젝트 생태계를 함께 만들어가고 있습니다
                </>
              ) : memberDisplay?.kind === 'empty' ? (
                <>곧 첫 멤버와 함께 프로젝트 생태계를 시작합니다</>
              ) : (
                <>프로젝트 생태계에 함께해 주세요</>
              )}
            </p>
            <span className="hero-beta-tag">{getBetaOpenLabel()}</span>
          </div>

          <div className="hero-badge" id="anim-2">
            <div className="pulse-dot" />
            CES 2026 혁신상 · Meta AI 해커톤 1위 선정
          </div>

          <h1 id="anim-3">
            소멸되던 프로젝트 경험,
            <br />
            <span className="gradient">압도적인 커리어 자산으로.</span>
          </h1>
          <p className="subtitle" id="anim-4">
            방치되던 수천 건의 실행 기록을 BAESH가 기록하고,
            <br />
            당신의 숨겨진 가치를 읽어내어 완벽한 기회와 연결해드립니다.
          </p>

          <div className="glass-panel" id="anim-5">
            <div className="stat-group">
              <span className="stat-value">90%+</span>
              <span className="stat-label">방치되는 프로젝트</span>
            </div>
            <div className="v-divider" />
            <div className="stat-group">
              <span className="stat-value">AI 엔진</span>
              <span className="stat-label">실시간 역량 구조화</span>
            </div>
            <div className="v-divider" />
            <div className="stat-group">
              <span className="stat-value">글로벌 검증</span>
              <span className="stat-label">해외 현지 마켓 테스트 완료</span>
            </div>
            <div className="v-divider" />
            <Link className="btn-cta" to="/auth/register">
              합류하기
              <ArrowIcon />
            </Link>
          </div>

          <div className="scroll-indicator" id="anim-6">
            <div className="scroll-text">Scroll to explore</div>
            <div className="mouse">
              <div className="wheel" />
            </div>
          </div>
        </section>

        <section className="content-section" id="why-baesh">
          <div className="section-header reveal">
            <div className="section-tag">Why BAESH</div>
            <h2 className="section-title">왜 BAESH를 선택해야 하는가</h2>
          </div>
          <div className="cards-grid">
            <article className="info-card reveal">
              <span className="card-num">01</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" x2="12" y1="22.08" y2="12" />
                </svg>
              </div>
              <h3>방치와 단절의 연속</h3>
              <p>
                해커톤, 캡스톤 디자인 등 수많은 행사 종료 후 공들여 만든 프로젝트의 90% 이상이 그대로
                버려지고 소멸합니다.
              </p>
            </article>
            <article className="info-card reveal reveal-delay-1">
              <span className="card-num">02</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
              </div>
              <h3>평생 증명되는 자산</h3>
              <p>
                소멸되던 단발성 경험을 영구적인 디지털 데이터 구조로 축적하여 학벌이나 스펙을
                뛰어넘는 강력한 실행 증명 인프라를 구축합니다.
              </p>
            </article>
            <article className="info-card reveal reveal-delay-2">
              <span className="card-num">03</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="14.31" x2="20.05" y1="8" y2="17.94" />
                  <line x1="9.69" x2="21.17" y1="8" y2="8" />
                  <line x1="7.38" x2="13.12" y1="12" y2="2.06" />
                  <line x1="9.69" x2="3.95" y1="16" y2="6.06" />
                  <line x1="14.31" x2="2.83" y1="16" y2="16" />
                  <line x1="16.62" x2="10.88" y1="12" y2="21.94" />
                </svg>
              </div>
              <h3>독보적인 데이터 해자</h3>
              <p>
                이력서의 텍스트 한 줄이 아닌, 실제 검증된 프로젝트 아카이브 데이터를 기반으로 AI가
                인재와 팀을 정확하게 연결합니다.
              </p>
            </article>
          </div>
        </section>

        <section className="content-section" id="flow">
          <div className="section-header reveal">
            <div className="section-tag">How It Works</div>
            <h2 className="section-title">플랫폼 이용 프로세스</h2>
          </div>
          <div className="cards-grid">
            <article className="info-card reveal">
              <span className="card-num">01</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" x2="8" y1="13" y2="13" />
                  <line x1="16" x2="8" y1="17" y2="17" />
                  <polyline points="10 9 9 9 8 9" />
                </svg>
              </div>
              <h3>활동 자동 누적</h3>
              <p>
                플랫폼 내에서 팀 빌딩을 완료하고 프로젝트를 생성하는 순간부터 모든 작업 히스토리가
                자동으로 아카이빙됩니다.
              </p>
            </article>
            <article className="info-card reveal reveal-delay-1">
              <span className="card-num">02</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
              </div>
              <h3>역량 분석 및 인증</h3>
              <p>
                독자적 AI 알고리즘을 거쳐 개개인의 문제 정의력, 협업력, 실행력을 정교한 역량 태그
                정보로 표준화하여 인증합니다.
              </p>
            </article>
            <article className="info-card reveal reveal-delay-2">
              <span className="card-num">03</span>
              <div className="card-icon-wrapper">
                <svg viewBox="0 0 24 24">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5.5" />
                  <polygon points="8.5 11.5 5.5 8.5 2.5 11.5" />
                  <line x1="21" x2="11" y1="5.5" y2="5.5" />
                  <line x1="21" x2="14" y1="12.5" y2="12.5" />
                  <line x1="21" x2="18" y1="19.5" y2="19.5" />
                </svg>
              </div>
              <h3>기회 및 채용 매칭</h3>
              <p>
                분석 완료된 실데이터 기반 맞춤형 인재풀을 형성하여, 기업의 헤드헌팅 제안 및 진성
                창업 팀 빌딩 파이프라인을 실현합니다.
              </p>
            </article>
          </div>
        </section>

        <section className="content-section join-section" id="join">
          <div className="bottom-cta reveal">
            <h2>지금 당신의 가치를 증명하세요</h2>
            <p>방치되던 당신의 열정과 노력을 평생의 커리어 자산으로 만들어 드립니다.</p>
            <Link className="btn-cta-gradient" to="/auth/register">
              합류하기
              <svg aria-hidden className="icon-cta-arrow" viewBox="0 0 24 24">
                <line x1="5" x2="19" y1="12" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </Link>
            <p className="bottom-login">
              이미 계정이 있으신가요? <Link to="/auth/login">로그인</Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}
