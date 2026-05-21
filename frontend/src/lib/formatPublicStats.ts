const BETA_OPEN_LABEL = '2026년 5월 20일 베타 오픈'

export function getBetaOpenLabel() {
  return BETA_OPEN_LABEL
}

export type MemberCountDisplay =
  | { kind: 'empty' }
  | { kind: 'members'; count: number }

/** 랜딩 카피용 가입자 수 */
export function getMemberCountDisplay(count: number | undefined): MemberCountDisplay | null {
  if (count === undefined) {
    return null
  }
  if (count <= 0) {
    return { kind: 'empty' }
  }
  return { kind: 'members', count }
}
