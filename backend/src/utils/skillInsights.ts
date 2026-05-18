export type SkillBreakdownItem = {
  label: string
  pct: number
  color: string
}

export type SkillInsightsPayload = {
  summary: string
  maturityLevel: 'foundation' | 'growing' | 'advanced'
  recommendedFocus: string[]
  skillBreakdown: SkillBreakdownItem[]
}

const COLORS = ['#7c3aed', '#2563eb', '#ec4899', '#0d9488', '#ea580c']

type ProjectInput = {
  skills: string[]
  status: string
  progress: number
}

export function buildSkillInsights(input: {
  profileSkills: string[]
  trustScore: number
  projects: ProjectInput[]
  verifiedCount: number
  certificateCount: number
  completedProgramCount: number
  careerCount: number
}) {
  const weights = new Map<string, number>()

  const addWeight = (skill: string, amount: number) => {
    const normalized = skill.trim()
    if (!normalized) {
      return
    }
    weights.set(normalized, (weights.get(normalized) ?? 0) + amount)
  }

  for (const skill of input.profileSkills) {
    addWeight(skill, 4)
  }

  for (const project of input.projects) {
    const statusBoost = project.status === 'COMPLETED' ? 5 : project.status === 'ACTIVE' ? 3 : 2
    const progressBoost = Math.round(project.progress / 25)
    for (const skill of project.skills) {
      addWeight(skill, statusBoost + progressBoost)
    }
  }

  const totalWeight = Array.from(weights.values()).reduce((sum, value) => sum + value, 0)
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1])
  const top = sorted.slice(0, 3)

  const skillBreakdown: SkillBreakdownItem[] = top.map(([label, weight], index) => ({
    label,
    pct: Math.min(98, Math.max(15, Math.round((weight / Math.max(totalWeight, 1)) * 100))),
    color: COLORS[index % COLORS.length],
  }))

  const coreSkills = input.profileSkills.slice(0, 4)
  const projectCount = input.projects.length
  const maturityLevel =
    input.trustScore >= 80 || input.verifiedCount >= 2
      ? 'advanced'
      : projectCount >= 2 || input.completedProgramCount >= 1
        ? 'growing'
        : 'foundation'

  const recommendedFocus =
    coreSkills.length > 0
      ? [
          `${coreSkills[0]} 관련 산출물 정리`,
          projectCount > 0 ? '프로젝트 기여도 수치화' : '첫 프로젝트 등록',
          input.completedProgramCount > 0 ? '프로그램 수료 이력 공유' : '교육·프로그램 수강 신청',
        ]
      : ['대표 기술스택 입력', '첫 프로젝트 등록', 'Jobs에서 프로그램 수강']

  const summaryParts: string[] = []
  if (coreSkills.length > 0) {
    summaryParts.push(`${coreSkills.join(', ')} 역량을 중심으로`)
  }
  if (projectCount > 0) {
    summaryParts.push(`${projectCount}개 프로젝트 경험`)
  }
  if (input.completedProgramCount > 0) {
    summaryParts.push(`${input.completedProgramCount}개 프로그램 수료 인증`)
  }
  if (input.verifiedCount > 0) {
    summaryParts.push(`${input.verifiedCount}건 검증된 기여`)
  }

  const summary =
    summaryParts.length > 0
      ? `${summaryParts.join(', ')}을 바탕으로 커리어 데이터가 구조화되고 있습니다.`
      : '프로젝트·프로그램·이력을 추가하면 실제 데이터 기반 인사이트가 생성됩니다.'

  return {
    summary,
    maturityLevel,
    recommendedFocus,
    skillBreakdown,
  } satisfies SkillInsightsPayload
}
