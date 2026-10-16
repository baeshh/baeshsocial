import type { PrismaClient } from '@prisma/client'

/** Founder resume for baesh6778@gmail.com (배승환) */

const FOUNDER_EMAIL = 'baesh6778@gmail.com'

const CERTIFICATES: { title: string; issuer: string }[] = [
  { title: '인공지능 기본과정 수료', issuer: '포항테크노파크' },
  { title: '인공지능 중급과정 수료', issuer: '포항테크노파크' },
  { title: '인공지능 고급과정 우수 수료', issuer: '포항테크노파크' },
  { title: '제조업 AI 기본과정 수료', issuer: '포항테크노파크' },
  { title: '블록체인 기본과정 수료', issuer: '포항테크노파크' },
  { title: '데이터 중급과정 수료', issuer: '포항테크노파크' },
  { title: '정보보안기초 수료', issuer: '경북정보보호지원센터' },
  { title: '포스코 창업 인큐베이팅스쿨', issuer: '포스코인재창조원' },
  { title: '하나소셜벤처유니버시티', issuer: '하나금융원' },
  { title: '혁신창업스쿨 온라인 공통 IT/서비스, 특화 교육 수료', issuer: '혁신창업스쿨' },
  { title: 'Sport start-up 수료 및 우수수료자 30인 선정', issuer: 'Sport start-up' },
  { title: 'Google AI 창업 기획 수료', issuer: 'Google' },
  { title: '포항테크노파크 금융 AI 보안 기본 수료', issuer: '포항테크노파크' },
  { title: 'AI 사이버보안 기본 수료', issuer: '포항테크노파크' },
]

const AWARDS: { title: string; issuer: string; description?: string; awardedAt?: Date }[] = [
  {
    title: '사용자기반 클론 AI 커리어 플랫폼 논문 등록',
    issuer: '대한전자공학회',
    description: '논문활동',
  },
  {
    title: 'SW 아카데미 5기 풀스택 개발자 양성 프로젝트 경진대회 원장상',
    issuer: '포항테크노파크',
  },
  {
    title: 'G-star 대학생 창업경진대회 예선 우수 입상',
    issuer: 'G-star',
  },
  {
    title: 'Global Innovation Award',
    issuer: '제주창조경제혁신센터',
    description: '글로벌 학생 창업 경진대회',
  },
  {
    title: 'Start-up Vision Award',
    issuer: '부산경제진흥원',
    description: '글로벌 학생 창업 경진대회',
  },
  {
    title: 'Venture Entrepreneur Award',
    issuer: '부산창조경제혁신센터',
    description: '글로벌 학생 창업 경진대회',
  },
  {
    title: '대구 경북 ICT COG 창업경진대회 최우수(1위)',
    issuer: '대구 경북 ICT COG',
  },
  {
    title: '경일대학교 교내 창업경진대회 최우수(1위)',
    issuer: '경일대학교',
  },
  {
    title: '경일대학교 Kollabo 경진대회 우수(2위)',
    issuer: '경일대학교',
  },
  {
    title: '경일대학교 LED 캡스톤 디자인 프로젝트 경진대회 최우수(1위)',
    issuer: '경일대학교',
  },
  {
    title: '경일대학교 사제동행 논문 활동 우수상(2위)',
    issuer: '경일대학교',
  },
  {
    title: 'DGU IR CONTEST 3위',
    issuer: 'DGU IR CONTEST',
  },
  {
    title: 'G-star 경일대학교 예선 1위(대상 · 경일대학교 총장상)',
    issuer: '경일대학교',
  },
  {
    title: 'Meta Llama LLM 응용 해커톤 1위',
    issuer: 'Meta',
  },
  {
    title: 'CES 혁신상 수상 (Airet.io)',
    issuer: 'CES',
  },
  {
    title: '2025년 북구 청년 창업 아이디어 오디션 대상(대구광역시 북구청장상)',
    issuer: '대구광역시 북구청',
    awardedAt: new Date('2025-11-05'),
  },
  {
    title: 'G-star 본선 장려상',
    issuer: 'G-star',
  },
  {
    title: 'Kova 캡스톤 경진대회 입상',
    issuer: 'Kova',
  },
  {
    title: '콜라보 경진대회 대상',
    issuer: '콜라보',
  },
  {
    title: '동북권 ICT 이노베이션 스퀘어 우수수료생 원장상',
    issuer: '포항테크노파크',
  },
  {
    title: 'Meta Llama Academy 1기 해커톤 1위',
    issuer: 'Meta Llama Academy',
  },
  {
    title: 'CES 2026 혁신상 수상 (Airet)',
    issuer: 'CES 2026',
  },
  {
    title: '서울 Rise 사업단 AI 창업 아이디어톤 대상',
    issuer: '서울 Rise 사업단',
  },
  {
    title: 'KIUM 콜라보 공모전 최우수상',
    issuer: 'KIUM',
  },
  {
    title: '해병대 전군대표 모범 해병 사령관 표창',
    issuer: '해병대',
    awardedAt: new Date('2022-08-01'),
  },
]

const CAREERS: {
  company: string
  position: string
  startDate?: Date | null
  endDate?: Date | null
  description?: string
}[] = [
  {
    company: '굿네이버스 인터내셔널',
    position: '활동',
    startDate: new Date('2025-03-01'),
    endDate: new Date('2025-08-31'),
  },
  {
    company: '해병대',
    position: '병장 만기전역',
    startDate: new Date('2021-05-01'),
    endDate: new Date('2022-11-30'),
    description: '해병대 전군대표 모범 해병 사령관 표창 수상(2022.08)',
  },
  {
    company: 'Airet.io',
    position: '사이트 개발 및 백엔드 엔지니어',
    startDate: new Date('2025-07-01'),
    endDate: new Date('2026-01-31'),
    description: 'CES / AIRET 참가 기업 선정 및 참가',
  },
  {
    company: '한성대학교',
    position: 'AI 캡스톤 디자인 멘토기업',
    description: 'AI 캡스톤 디자인 멘토기업 선정',
  },
  // 단체 · 기수
  {
    company: '대구광역시 4차산업혁명 청년체험단',
    position: '7기',
    description: '단체 활동',
  },
  {
    company: '경북청년무역인연합',
    position: '연합원',
    description: '단체 활동',
  },
  {
    company: '한국무역협회 청년 무역사관학교',
    position: '13기',
    description: '단체 활동',
  },
  {
    company: '대학기업 협력형 SW 아카데미',
    position: '풀스택 개발자 양성 교육 5기',
    description: '단체 · 교육 과정',
  },
  {
    company: '2024 중국 글로벌 진출 시장 조사단',
    position: '1기',
    description: '중국 옌타이 및 한인상회회장 네트워킹',
  },
  {
    company: '청년글로벌리더 육성',
    position: '1기',
    description: '중국 시장조사',
  },
  {
    company: '런던 글로벌 스타트업 교육',
    position: '2기',
    description: '영국 마켓테스트',
  },
  {
    company: '베이징대학교 글로벌 스타트업 교육',
    position: '1기',
    description: '단체 · 글로벌 교육',
  },
]

const PORTFOLIOS: { title: string; description: string; url?: string }[] = [
  {
    title: "IoT 기반 체육시설 자동화 플랫폼 '운동판'",
    description: '포항연합기술지주 아이디어 사업화 지원 선정',
  },
  {
    title: "빈티지 악세사리 리셀 플랫폼 '구공패밀리'",
    description: '24년 매출 1,000만원, 25년 7월 기준 매출 1,400만원',
  },
  {
    title: "커리어 AI 에이전트 플랫폼 'BAESH'",
    description:
      '이력분석부터 커리어 설계, 맞춤형 팀원/협업 파트너 찾기까지. 영천 창업 정착 지원 사업 선정',
    url: 'https://baesh.dev',
  },
  {
    title: "자기계발 동기부여 채널 'BILLBOOST'",
    description: '조회수 20만, 10만 등 콘텐츠 보유 · 채널 운영',
  },
]

export async function seedFounderResume(prisma: PrismaClient) {
  const user = await prisma.user.findUnique({
    where: { email: FOUNDER_EMAIL },
    include: { profile: true },
  })

  if (!user?.profile) {
    console.log(`Founder resume skipped: ${FOUNDER_EMAIL} not found`)
    return
  }

  const profileId = user.profile.id

  await prisma.user.update({
    where: { id: user.id },
    data: {
      name: '배승환',
    },
  })

  await prisma.profile.update({
    where: { id: profileId },
    data: {
      headline: 'BAESH Founder · AI Career Platform',
      bio:
        '경일대학교 클라우드컴퓨팅전공(3.3/4.5). 프로젝트 경험을 커리어 자산으로 쌓는 BAESH를 만들고 있습니다. CES 혁신상(Airet), Meta Llama 해커톤 1위 등 실행 이력을 기반으로 팀과 기회를 연결합니다.',
      school: '경일대학교 클라우드컴퓨팅전공 (3.3/4.5)',
      company: 'BAESH',
      location: '포항 · 대구',
      skills: [
        'Full-stack',
        'AI',
        'Startup',
        'Career Data',
        'Backend',
        'Product',
        'Hackathon',
      ],
      interests: ['AI SaaS', '글로벌 창업', '커리어 인프라', '팀 빌딩'],
      verified: true,
      trustScore: 95,
      socialLinks: {
        website: 'https://baesh.dev',
        email: FOUNDER_EMAIL,
      },
    },
  })

  await prisma.certificate.deleteMany({ where: { profileId } })
  await prisma.award.deleteMany({ where: { profileId } })
  await prisma.career.deleteMany({ where: { profileId } })
  await prisma.portfolio.deleteMany({ where: { profileId } })

  await prisma.certificate.createMany({
    data: CERTIFICATES.map((item, index) => ({
      id: `founder-cert-${String(index + 1).padStart(2, '0')}`,
      profileId,
      title: item.title,
      issuer: item.issuer,
      verified: true,
    })),
  })

  await prisma.award.createMany({
    data: AWARDS.map((item, index) => ({
      id: `founder-award-${String(index + 1).padStart(2, '0')}`,
      profileId,
      title: item.title,
      issuer: item.issuer,
      description: item.description ?? null,
      awardedAt: item.awardedAt ?? null,
    })),
  })

  await prisma.career.createMany({
    data: CAREERS.map((item, index) => ({
      id: `founder-career-${String(index + 1).padStart(2, '0')}`,
      profileId,
      company: item.company,
      position: item.position,
      startDate: item.startDate ?? null,
      endDate: item.endDate ?? null,
      description: item.description ?? null,
    })),
  })

  await prisma.portfolio.createMany({
    data: PORTFOLIOS.map((item, index) => ({
      id: `founder-portfolio-${String(index + 1).padStart(2, '0')}`,
      profileId,
      title: item.title,
      description: item.description,
      url: item.url ?? null,
      imageUrl: null,
    })),
  })

  console.log(
    `Founder resume seeded for ${FOUNDER_EMAIL}: ` +
      `${CERTIFICATES.length} certs, ${AWARDS.length} awards, ${CAREERS.length} careers, ${PORTFOLIOS.length} portfolios`,
  )
}
