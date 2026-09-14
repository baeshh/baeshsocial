/** Community seed personas — Korean & UK talent (name/gender/photo/language aligned) */

export type SeedPersona = {
  key: string
  name: string
  locale: 'kr' | 'uk'
  gender: 'm' | 'f'
  portraitIndex: number
  headline: string
  bio: string
  school: string
  company: string | null
  location: string
  skills: string[]
  interests: string[]
  career?: { company: string; position: string; description: string }
  award?: { title: string; issuer: string; description: string }
}

/** Clearly gendered Korean given names only (no unisex). */
const KR_FIRST_M = [
  '민준', '서준', '도윤', '예준', '시우', '하준', '주원', '지호', '준서', '건우',
  '현우', '우진', '선우', '연우', '정우', '승현', '재원', '동현', '준혁', '성민',
  '태윤', '민재', '상우', '현석', '지훈', '성현', '준영', '태양', '도현', '시현',
]

const KR_FIRST_F = [
  '서연', '서윤', '지우', '하은', '하윤', '수아', '지아', '채원', '예은', '윤서',
  '다은', '예진', '소율', '지민', '수빈', '예원', '지원', '서현', '채은', '유나',
  '은지', '혜원', '나연', '아린', '소민', '예림', '채린', '민서', '하린', '소연',
]

const KR_LAST = [
  '김', '이', '박', '최', '정', '강', '조', '윤', '장', '임',
  '한', '오', '서', '신', '권', '황', '안', '송', '류', '홍',
]

const UK_FIRST_M = [
  'Oliver', 'Harry', 'Jack', 'Charlie', 'Thomas', 'James', 'William', 'George',
  'Alexander', 'Henry', 'Noah', 'Oscar', 'Arthur', 'Leo', 'Freddie', 'Archie',
  'Isaac', 'Finn', 'Edward', 'Lucas', 'Joseph', 'Daniel', 'Samuel', 'Benjamin',
]

const UK_FIRST_F = [
  'Olivia', 'Amelia', 'Isla', 'Ava', 'Mia', 'Emily', 'Sophia', 'Grace',
  'Lily', 'Chloe', 'Ella', 'Freya', 'Isabelle', 'Poppy', 'Daisy', 'Charlotte',
  'Evelyn', 'Harper', 'Rosie', 'Jessica', 'Sophie', 'Alice', 'Megan', 'Hannah',
]

const UK_LAST = [
  'Smith', 'Jones', 'Taylor', 'Brown', 'Williams', 'Wilson', 'Johnson', 'Davies',
  'Patel', 'Wright', 'Evans', 'Roberts', 'Walker', 'Thompson', 'White', 'Hughes',
  'Edwards', 'Green', 'Hall', 'Clarke', 'Bailey', 'Cooper', 'Morgan', 'Ward',
]

const KR_SCHOOLS = [
  '서울대학교', '연세대학교', '고려대학교', 'KAIST', 'POSTECH', '성균관대학교',
  '한양대학교', '중앙대학교', '이화여자대학교', '건국대학교', '홍익대학교',
  '경희대학교', '서강대학교', '부산대학교', 'UNIST',
]

const UK_SCHOOLS = [
  'University of Oxford', 'University of Cambridge', 'Imperial College London',
  'UCL', 'University of Edinburgh', 'University of Manchester',
  "King's College London", 'University of Bristol', 'University of Warwick',
  'LSE', 'University of Leeds', 'University of Glasgow',
]

const KR_COMPANIES = [
  '토스', '카카오', '네이버', '라인', '쿠팡', '배달의민족', '당근', '뱅크샐러드',
  '업스테이지', '라이너', '몰로코', '하이퍼커넥트', '직방', '야놀자', '컬리',
  'BAESH Labs', '스마일게이트', '엔씨소프트', null, null,
]

const UK_COMPANIES = [
  'DeepMind', 'Monzo', 'Revolut', 'Deliveroo', 'BBC R&D', 'Arm', 'Sage',
  'Darktrace', 'BenevolentAI', 'Thought Machine', 'BAESH London', 'Expedia',
  null, null,
]

const KR_LOCATIONS = [
  '서울 강남', '서울 성수', '서울 판교', '서울 마포', '부산', '대전', '인천', '수원',
]

const UK_LOCATIONS = [
  'London', 'Cambridge', 'Manchester', 'Edinburgh', 'Bristol', 'Oxford', 'Leeds',
]

const SKILL_POOLS = [
  ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  ['Python', 'PyTorch', 'MLOps', 'FastAPI'],
  ['Figma', 'Product Design', 'User Research', 'Prototyping'],
  ['Swift', 'iOS', 'UIKit', 'SwiftUI'],
  ['Kotlin', 'Android', 'Jetpack Compose'],
  ['Go', 'Kubernetes', 'AWS', 'Docker'],
  ['Next.js', 'Tailwind', 'GraphQL', 'Prisma'],
  ['Data Analysis', 'SQL', 'dbt', 'Looker'],
  ['Unity', 'C#', 'Game Design'],
  ['Rust', 'Systems', 'WebAssembly'],
]

const INTEREST_POOLS_KR = [
  ['AI SaaS', '커리어 데이터', '해커톤'],
  ['스타트업', '프로덕트', '그로스'],
  ['오픈소스', '개발자 도구'],
  ['에듀테크', '커뮤니티', '멘토링'],
  ['핀테크', '보안', '프라이버시'],
  ['클라이밋테크', '소셜임팩트'],
  ['디자인 시스템', '접근성'],
  ['리서치', 'NLP', '컴퓨터 비전'],
]

const INTEREST_POOLS_UK = [
  ['AI SaaS', 'Career Data', 'Hackathon'],
  ['Startup', 'Product', 'Growth'],
  ['Open Source', 'Developer Tools'],
  ['EdTech', 'Community', 'Mentoring'],
  ['Fintech', 'Security', 'Privacy'],
  ['Climate Tech', 'Social Impact'],
  ['Design Systems', 'Accessibility'],
  ['Research', 'NLP', 'Computer Vision'],
]

const KR_HEADLINES = [
  '풀스택 엔지니어 · 사이드 프로젝트 중독',
  '프로덕트 디자이너 · B2B SaaS',
  'AI 엔지니어 · LLM 애플리케이션',
  '모바일 개발자 · iOS / Android',
  '데이터 분석가 · 그로스 실험',
  '예비 창업가 · 해커톤 러너',
  '백엔드 엔지니어 · 분산 시스템',
  '프론트엔드 엔지니어 · 디자인 시스템',
  'ML 리서치 인턴 · 추천 시스템',
  'UX 리서처 · 대학생 프로덕트',
]

const UK_HEADLINES = [
  'Software Engineer · Full-stack',
  'Product Designer · Fintech',
  'ML Engineer · Applied NLP',
  'iOS Developer · Consumer apps',
  'Data Scientist · Experimentation',
  'Founder-in-residence · Seed stage',
  'Backend Engineer · Platform',
  'Frontend Engineer · Design systems',
  'Research Intern · Computer Vision',
  'UX Researcher · EdTech',
]

const KR_BIOS = [
  '해커톤과 캡스톤에서 만든 프로젝트를 그냥 버리지 않고, 커리어 자산으로 쌓아가고 있습니다.',
  '팀 빌딩과 실행을 좋아합니다. 최근엔 AI로 업무 흐름을 자동화하는 실험 중이에요.',
  '디자인과 개발 사이를 오가며 빠르게 프로토타입을 만듭니다. 피드백이면 환영!',
  '오픈소스 기여와 사이드 프로젝트가 제 포트폴리오의 중심입니다.',
  '대학에서 배운 이론을 실제 제품에 붙이는 게 목표예요. BAESH에 기록을 남기는 중.',
]

const UK_BIOS = [
  'I turn hackathon prototypes into lasting career proof — shipping, learning, repeating.',
  'Building products at the intersection of AI and everyday workflows.',
  'Designer who codes. Always looking for thoughtful collaborators.',
  'Open-source contributor and weekend founder. Happy to mentor juniors.',
  'Ex-uni projects used to disappear. Now I archive every meaningful build on BAESH.',
]

const KR_POSTS = [
  '이번 주 해커톤에서 MVP까지 48시간 만에 올렸습니다. 다음엔 유저 인터뷰 10명 돌릴 예정이에요. #해커톤 #MVP',
  '캡스톤 중간 발표 끝! 교수님 피드백: “데이터가 곧 설득력이다.” 바로 BAESH에 정리해 둡니다.',
  '사이드 프로젝트 첫 유료 결제 들어왔어요. 작지만 진짜 고객이 생겼습니다. 회고 곧 공유할게요.',
  '팀원 모집합니다. React랑 Figma 가능한 분, 주 2회 저녁 스크럼 가능하면 연락 주세요.',
  '포트폴리오에 실패한 실험도 남기기로 했습니다. 배운 게 더 많았거든요.',
  '오늘 배포한 기능은 프로필 SEO입니다. 검색에 내 프로젝트 카드가 뜨는 순간이 짜릿하네요.',
  '스터디 로그 21일차. 시스템 디자인 정리 끝났고, 다음엔 실제 트래픽 가정으로 연습합니다.',
  '오픈소스 PR이 머지됐습니다. 작은 문서 수정이지만 기여 기록이 쌓이니 든든해요.',
  '면접에서 “그 프로젝트에서 네 역할은?”을 물었을 때, BAESH 타임라인이 바로 답이 됐습니다.',
  '서울 데모데이 발표 후기. 질문 세례에 정신이 없었지만 배움이 컸어요.',
  '카카오톡 봇으로 팀 출석 체크하던 사이드 프로젝트, 이번 주에 코드 정리하고 아카이빙했습니다.',
  '졸업작품 발표 D-7. 데모 영상 찍고 역할 분담표를 BAESH에 올려 뒀어요.',
  '토스 인턴십 회고 초안 쓰는 중. ‘무엇을 했는지’보다 ‘왜 그 선택이었는지’를 남기려고요.',
  '판교에서 열린 밋업에서 만난 분과 주말 해커톤 팀 꾸렸습니다. 주제는 커리어 데이터 시각화.',
  '백엔드 API 설계 실수 정리했습니다. 권한 체크를 프론트에만 맡긴 게 제일 큰 패착이었어요.',
  '디자이너 분과 첫 핸드오프 완료. Figma 토큰이랑 컴포넌트 네이밍을 맞춰 두니 속도가 확 나네요.',
  '네이버 부트캠프 과제 제출했습니다. 리뷰 코멘트 전부 BAESH에 옮겨 적는 습관 들이는 중.',
  '창업 동아리 피치데이 준비. 한 줄 가치제안이 제일 어렵습니다.',
  '부산에서 원격으로 런던 팀과 크리틱했어요. 시차는 힘들지만 피드백 밀도가 달랐습니다.',
  '이번 스프린트 회고: ‘완벽보다 기록’. 배포 못 한 기능도 왜 막혔는지 남겼습니다.',
  '오늘은 데이터베이스 인덱스 튜닝만 하루 종일 했습니다. 느린 쿼리 3개 잡았어요.',
  '모바일 앱 베타 테스터 20명 모집 마감! 피드백 시트 정리해서 다음 주 반영합니다.',
  '학교 동아리에서 AI 세미나 진행했습니다. 질문 중 “그래서 네 역할이 뭐야?”가 제일 뼈아팠어요.',
  'Git 커밋 메시지 규칙을 팀에 도입했습니다. 이력 읽기가 훨씬 편해졌어요.',
  '취업 준비하면서 프로젝트 소개서를 다시 썼습니다. 숫자와 결과를 앞에 두는 게 핵심이더라고요.',
  '주말 동안 Next.js 마이그레이션 끝. 빌드 시간이 절반으로 줄었습니다.',
  '해커톤 심사위원 질문에 막혀서 결국 데모를 다시 찍었습니다. 그 과정도 기록으로 남깁니다.',
  '멘토링 받은 내용 정리: “스펙 나열 말고, 의사결정 로그를 남겨라.”',
  '쿠팡 출신 선배와 커피챗. 실무에서는 커뮤니케이션 기록이 포트폴리오라고 하시네요.',
  '오늘은 UI 폴리싱만. 버튼 간격 4px 조정했는데 체감이 생각보다 큽니다.',
  '팀 노션이 난잡해서 BAESH로 활동 타임라인을 옮기는 실험 중입니다.',
  '알고리즘 스터디 백준 골드 구간 진입! 풀이 노트도 같이 아카이빙합니다.',
  '앱 스토어 심사 거절 사유 반영 완료. 권한 설명 문구가 문제였습니다.',
  '창업 아이템 피벗 결정. 사용자 5명 인터뷰 후 ‘기록’이 진짜 페인인 걸 확인했어요.',
  '프론트 성능 개선: LCP 3.2초 → 1.6초. 이미지 레이지로드가 효과가 컸습니다.',
  '교내 경진대회 본선 진출! 발표 자료와 데모 링크를 프로필에 연결해 뒀어요.',
  '야근보다 문서화가 이득이라는 걸 오늘 체감했습니다. 인수인계가 5분 만에 끝났거든요.',
  'React Query 도입 후 로딩 상태가 정리되면서 UX가 확 좋아졌습니다.',
  '디자인 시스템 토큰 v1 공개. 색/간격/타이포만 맞춰도 협업 속도가 달라져요.',
  '이번 주 목표: 사이드 프로젝트 온보딩 플로우 완성하고 사용자 3명에게 보여주기.',
]

const UK_POSTS = [
  'Shipped a hackathon MVP in 36 hours — now archiving every decision on BAESH before it fades.',
  'Uni group project wrap-up. We almost lost the repo history; never again.',
  'First paying user on my side project 🎉 Tiny revenue, huge motivation.',
  'Looking for a designer who likes messy early-stage product chats. London / remote.',
  'Wrote up a post-mortem of a failed pivot. Failure logs > empty portfolios.',
  'Deployed profile SEO today. Seeing my work in search hits different.',
  'System design study Day 21 done. Next: load-test assumptions for real.',
  'Open-source PR merged — docs only, but the contribution graph still matters.',
  'Interview tip: when they ask “what did YOU do?”, a verified activity timeline beats buzzwords.',
  'Demo day in London was intense — tough questions, clearer story afterward.',
]

const KR_COMMENTS = [
  '이런 기록이 쌓이면 면접에서 정말 강해지겠네요. 응원합니다!',
  '회고 잘 봤어요. 다음 스프린트도 기대됩니다.',
  '팀 빌딩 중이시면 저도 관심 있어요. 프로필 남겨둘게요.',
  '실패 로그까지 남기는 태도, 진짜 멋집니다.',
]

const UK_COMMENTS = [
  'This is exactly the kind of proof recruiters should see. Nice work.',
  'Solid write-up — archiving the messy bits is what makes it believable.',
  'If you are hiring for the next sprint, happy to chat.',
  'Love that you logged the failure too. That is real portfolio material.',
]

function pick<T>(arr: readonly T[], index: number): T {
  return arr[((index % arr.length) + arr.length) % arr.length]!
}

export function buildPersonas(count: number): SeedPersona[] {
  const personas: SeedPersona[] = []
  let malePortrait = 0
  let femalePortrait = 0

  for (let i = 0; i < count; i++) {
    // First 40% UK, remaining KR — contiguous blocks so locale never drifts
    const isUk = i < Math.round(count * 0.4)
    const locale: 'kr' | 'uk' = isUk ? 'uk' : 'kr'
    const gender: 'm' | 'f' = i % 2 === 0 ? 'm' : 'f'
    const key = `p${String(i + 1).padStart(3, '0')}`
    const portraitIndex = gender === 'm' ? malePortrait++ % 99 : femalePortrait++ % 99

    const name = isUk
      ? `${pick(gender === 'm' ? UK_FIRST_M : UK_FIRST_F, i)} ${pick(UK_LAST, i * 3 + 1)}`
      : `${pick(KR_LAST, i)}${pick(gender === 'm' ? KR_FIRST_M : KR_FIRST_F, i)}`

    const company = isUk ? pick(UK_COMPANIES, i) : pick(KR_COMPANIES, i)

    personas.push({
      key,
      name,
      locale,
      gender,
      portraitIndex,
      headline: isUk ? pick(UK_HEADLINES, i) : pick(KR_HEADLINES, i),
      bio: isUk ? pick(UK_BIOS, i) : pick(KR_BIOS, i),
      school: isUk ? pick(UK_SCHOOLS, i) : pick(KR_SCHOOLS, i),
      company,
      location: isUk ? pick(UK_LOCATIONS, i) : pick(KR_LOCATIONS, i),
      skills: pick(SKILL_POOLS, i),
      interests: isUk ? pick(INTEREST_POOLS_UK, i + 2) : pick(INTEREST_POOLS_KR, i + 2),
      career:
        i % 3 !== 2
          ? {
              company: company ?? (isUk ? 'Independent' : '프리랜서'),
              position: isUk
                ? pick(['Engineer', 'Designer', 'Analyst', 'Intern', 'Founder'], i)
                : pick(['엔지니어', '디자이너', '분석가', '인턴', '창업멤버'], i),
              description: isUk
                ? 'Shipped features end-to-end and documented outcomes for the portfolio.'
                : '기능을 끝까지 배포하고, 결과를 포트폴리오에 남겼습니다.',
            }
          : undefined,
      award:
        i % 4 === 0
          ? {
              title: isUk
                ? pick(['Hackathon Winner', 'Innovation Award', "Dean's List", 'Open Source Spotlight'], i)
                : pick(['해커톤 우수상', '혁신상', '학장상', '오픈소스 기여상'], i),
              issuer: isUk
                ? pick(['Meta AI Hackathon', 'CES Asia', 'University Board', 'BAESH'], i)
                : pick(['Meta AI 해커톤', 'CES', '대학 본부', 'BAESH'], i),
              description: isUk
                ? 'Recognised for turning a prototype into a clear career narrative.'
                : '프로토타입을 설득력 있는 커리어 스토리로 만든 점을 인정받았습니다.',
            }
          : undefined,
    })
  }

  return personas
}

export function getPostContent(persona: SeedPersona, postIndex: number): string {
  const pool = persona.locale === 'uk' ? UK_POSTS : KR_POSTS
  return pick(pool, postIndex + Number.parseInt(persona.key.replace(/\D/g, ''), 10))
}

export function getCommentContent(persona: SeedPersona, salt: number): string {
  const pool = persona.locale === 'uk' ? UK_COMMENTS : KR_COMMENTS
  return pick(pool, salt)
}

/** Portrait folder always matches gender; index is per-gender sequential. */
export function avatarUrl(persona: Pick<SeedPersona, 'gender' | 'portraitIndex'>): string {
  const folder = persona.gender === 'm' ? 'men' : 'women'
  return `https://randomuser.me/api/portraits/${folder}/${persona.portraitIndex}.jpg`
}

export function coverUrl(key: string): string {
  return `https://picsum.photos/seed/baesh-${key}/1200/400`
}

export { pick }
