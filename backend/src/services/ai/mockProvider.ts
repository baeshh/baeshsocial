import type { AIProvider, AIRequest, AIResponse } from './aiProvider.js'

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function profileInsight(input: Record<string, unknown>): AIResponse {
  const skills = asStringArray(input.skills)
  const projects = Array.isArray(input.projects) ? input.projects.length : 0

  return {
    summary:
      skills.length > 0
        ? `${skills.slice(0, 4).join(', ')} 역량을 중심으로 ${projects}개의 프로젝트 경험을 커리어 자산으로 전환할 수 있습니다.`
        : '기술스택과 프로젝트 기록을 추가하면 강점 분석의 정확도가 올라갑니다.',
    strengths: skills.slice(0, 3).map((skill) => `${skill} 기반 실행 경험`),
    gaps: ['성과 지표 수치화', '역할별 기여도 증거 정리', '외부 검증 기록 확보'],
    recommendations: ['대표 프로젝트 1개를 상세화하세요', '산출물 링크를 포트폴리오에 연결하세요', '기술스택별 성장 목표를 기록하세요'],
  }
}

function projectInsight(input: Record<string, unknown>): AIResponse {
  const progress = typeof input.progress === 'number' ? input.progress : 0
  const skills = asStringArray(input.skills)

  return {
    summary: `현재 프로젝트 진행률은 ${progress}%입니다. 활동 기록과 파일이 누적될수록 Project Health 신뢰도가 높아집니다.`,
    strengths: ['프로젝트 목표가 커리어 데이터로 구조화됨', ...skills.slice(0, 2).map((skill) => `${skill} 활용 경험`)],
    gaps: ['최근 활동 기록 부족 가능성', '팀원별 기여도 정량화 필요'],
    recommendations: ['태스크를 Done/Blocked로 명확히 관리하세요', '주요 산출물 URL을 Files에 추가하세요', '마일스톤별 활동 기록을 남기세요'],
  }
}

function opportunityMatch(input: Record<string, unknown>): AIResponse {
  const profileSkills = new Set(asStringArray(input.profileSkills).map((skill) => skill.toLowerCase()))
  const opportunitySkills = asStringArray(input.opportunitySkills)
  const matched = opportunitySkills.filter((skill) => profileSkills.has(skill.toLowerCase()))
  const matchScore = opportunitySkills.length > 0 ? Math.round((matched.length / opportunitySkills.length) * 100) : 50

  return {
    summary: `요구 기술 ${opportunitySkills.length}개 중 ${matched.length}개가 현재 프로필과 일치합니다.`,
    strengths: matched.length > 0 ? matched.map((skill) => `${skill} 요구 역량 충족`) : ['프로젝트 기반 지원 스토리 구성 가능'],
    gaps: opportunitySkills.filter((skill) => !profileSkills.has(skill.toLowerCase())).map((skill) => `${skill} 보강 필요`),
    recommendations: ['관련 프로젝트를 지원서 상단에 배치하세요', '부족한 기술은 학습 계획과 연결하세요', '프로젝트 산출물 URL을 함께 제출하세요'],
    matchScore,
  }
}

function portfolioGenerator(input: Record<string, unknown>): AIResponse {
  const title = typeof input.title === 'string' ? input.title : '프로젝트'
  const skills = asStringArray(input.skills)
  const generatedText = `${title}에서 ${skills.slice(0, 3).join(', ') || '핵심 기술'}을 활용해 문제 정의부터 구현, 산출물 정리까지 주도했습니다. 프로젝트 목표와 실행 기록을 바탕으로 실무형 기여도를 증명할 수 있습니다.`

  return {
    summary: '프로젝트 데이터를 기반으로 포트폴리오 문장을 생성했습니다.',
    strengths: ['문제 해결 흐름 강조', '기술스택과 기여도 연결', '커리어 문장으로 재사용 가능'],
    gaps: ['정량 성과가 추가되면 문장 설득력이 높아집니다'],
    recommendations: ['성과 수치 추가', '사용자 문제 명시', '팀 내 역할 구체화'],
    generatedText,
  }
}

export const mockProvider: AIProvider = {
  name: 'mock',
  model: 'baesh-mock-v1',
  async generate(request: AIRequest) {
    if (request.type === 'profile-insight') return profileInsight(request.input)
    if (request.type === 'project-insight') return projectInsight(request.input)
    if (request.type === 'opportunity-match') return opportunityMatch(request.input)
    return portfolioGenerator(request.input)
  },
}
