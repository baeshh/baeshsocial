import type { GroundedClaim, Source } from '../../services/ai/grounding.js'
import type { ReportNarrative } from '../../services/ai/tasks/reportNarrative.js'
import { escapeHtml as e, PDF_FONT_STACK } from '../../services/pdf/renderPdf.js'
import type { Metric } from '../programs/programKpis.js'
import type { ReportSnapshot } from './reportData.js'

export const DEFAULT_REPORT_SECTIONS = [
  { key: 'overview', title: '사업 개요 및 핵심 운영 성과' },
  { key: 'programs', title: '프로그램별 운영 결과' },
  { key: 'projects', title: '프로젝트별 성과 및 참여 현황' },
  { key: 'evidence', title: '주요 활동 사진 및 증빙' },
  { key: 'evaluation', title: '종합 평가 및 개선 사항' },
  { key: 'appendix', title: '부록: 세부 활동내역과 증빙자료' },
] as const

const STATUS: Record<string, string> = { planning: '기획', active: '진행', completed: '완료', archived: '보관' }
const METRIC_KEYS = ['projectCompletionRate', 'participationRate', 'submissionRate', 'approvalRate', 'averageProgress', 'goalAchievementRate'] as const

const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '-')
const pct = (value: number | null) => (value === null ? '–' : `${value}%`)

function bar(value: number | null, color = '#2563eb') {
  const width = Math.max(0, Math.min(100, value ?? 0))
  return `<div class="bar"><span style="width:${width}%;background:${color}"></span></div>`
}

function claims(list: GroundedClaim[], empty = '') {
  if (!list.length) return empty ? `<p class="muted">${e(empty)}</p>` : ''
  return `<ul class="claims">${list.map((c) => `<li>${e(c.text)}<sup>${c.sourceRefs.map(e).join(',')}</sup></li>`).join('')}</ul>`
}

function metricCard(label: string, metric: Metric, unit: '%' | '건' = '%') {
  const target = metric.target === null ? '' : `<div class="target ${metric.met ? 'ok' : 'no'}">목표 ${metric.target}${unit} · ${metric.met ? '달성' : '미달'}</div>`
  const ratio = unit === '%' && metric.denominator ? `<div class="ratio">${metric.numerator} / ${metric.denominator}</div>` : ''
  const value = unit === '%' ? pct(metric.value) : `${metric.value ?? 0}${unit}`
  return `<div class="card"><div class="label">${e(label)}</div><div class="value">${value}</div>${ratio}${target}</div>`
}

function trendChart(snapshot: ReportSnapshot) {
  const buckets = snapshot.kpis.trend.buckets
  if (!buckets.length) return ''
  const max = Math.max(1, ...buckets.map((b) => Math.max(b.submissions, b.approvals)))
  const w = 520
  const h = 120
  const step = w / buckets.length
  const barW = Math.max(2, Math.min(14, step / 2 - 2))
  const bars = buckets
    .map((b, i) => {
      const x = i * step + step / 2
      const sh = (b.submissions / max) * (h - 20)
      const ah = (b.approvals / max) * (h - 20)
      return `<rect x="${x - barW - 1}" y="${h - sh}" width="${barW}" height="${sh}" fill="#93c5fd"/><rect x="${x + 1}" y="${h - ah}" width="${barW}" height="${ah}" fill="#16a34a"/>`
    })
    .join('')
  const labels = buckets
    .map((b, i) => (buckets.length <= 12 || i % Math.ceil(buckets.length / 12) === 0 ? `<text x="${i * step + step / 2}" y="${h + 12}" font-size="7" text-anchor="middle" fill="#64748b">${b.start.slice(5)}</text>` : ''))
    .join('')
  return `<h3>${snapshot.kpis.trend.granularity === 'month' ? '월별' : '주별'} 증빙 제출·승인 추이</h3>
  <svg width="${w}" height="${h + 16}" viewBox="0 0 ${w} ${h + 16}"><line x1="0" y1="${h}" x2="${w}" y2="${h}" stroke="#e2e8f0"/>${bars}${labels}</svg>
  <p class="legend"><span style="background:#93c5fd"></span>제출 <span style="background:#16a34a"></span>승인 (최대 ${max}건)</p>`
}

export function reportHtml(input: {
  title: string
  version: number
  snapshot: ReportSnapshot
  narrative: ReportNarrative
  narrativeSource: 'ai' | 'template'
  narrativeSources: Source[]
  photos: Map<string, string>
}) {
  const { snapshot, narrative, photos } = input
  const { kpis } = snapshot
  const totals = kpis.totals
  const defs = kpis.definitions
  const programTitle = new Map(snapshot.programs.map((p) => [p.id, p.title]))

  const page1 = `<section>
    <div class="cover">
      <div class="org">${e(snapshot.organization.name)}</div>
      <h1>${e(input.title)}</h1>
      <div class="meta">집계 기간 ${day(snapshot.period.from)} ~ ${day(snapshot.period.to)} · 제${input.version}판 · 생성 ${day(snapshot.generatedAt)}</div>
      <div class="meta">대상 프로그램: ${snapshot.programs.map((p) => e(p.title)).join(', ')}</div>
    </div>
    <h2>1. ${DEFAULT_REPORT_SECTIONS[0].title}</h2>
    <div class="cards">
      <div class="card"><div class="label">운영 프로젝트</div><div class="value">${totals.counts.projects}</div><div class="ratio">완료 ${totals.counts.completedProjects}</div></div>
      <div class="card"><div class="label">등록 참여자</div><div class="value">${totals.counts.uniqueStudents}</div><div class="ratio">참여 ${totals.counts.activeStudents}</div></div>
      ${metricCard(defs.submissionRate.label, totals.metrics.submissionRate)}
      ${metricCard(defs.averageProgress.label, totals.metrics.averageProgress)}
    </div>
    <div class="cards">
      ${metricCard(defs.projectCompletionRate.label, totals.metrics.projectCompletionRate)}
      ${metricCard(defs.participationRate.label, totals.metrics.participationRate)}
      ${metricCard(defs.approvalRate.label, totals.metrics.approvalRate)}
      ${metricCard(defs.goalAchievementRate.label, totals.metrics.goalAchievementRate)}
    </div>
    <p class="muted">승인 증빙 ${totals.counts.approvedEvidence}건 · 반려 ${totals.counts.rejectedEvidence}건 · 검토 대기 ${totals.counts.pendingEvidence}건 · 검증 기록 발급 ${totals.verifiedRecordsIssued}건</p>
    <h3>핵심 운영 성과</h3>
    ${claims(narrative.overview, '서술 없음')}
    <h3>지표 산출 기준</h3>
    <table class="defs"><thead><tr><th>지표</th><th>분자</th><th>분모</th><th>기준</th></tr></thead>
      ${METRIC_KEYS.map((key) => `<tr><td>${e(defs[key].label)}</td><td>${e(defs[key].numerator)}</td><td>${e(defs[key].denominator)}</td><td>${e(defs[key].basis)}</td></tr>`).join('')}
    </table>
  </section>`

  const page2 = `<section class="page">
    <h2>2. ${DEFAULT_REPORT_SECTIONS[1].title}</h2>
    <table><thead><tr><th>프로그램</th><th>프로젝트</th><th>등록 참여자</th><th>참여율</th><th>제출률</th><th>승인율</th><th>평균 진행률</th><th>목표 달성</th></tr></thead>
      ${kpis.programs
        .map(
          (p) => `<tr><td>${e(p.title)}${p.term ? `<div class="muted">${e(p.term)}</div>` : ''}</td><td>${p.counts.projects} (완료 ${p.counts.completedProjects})</td><td>${p.counts.enrollments}</td>
          <td>${pct(p.metrics.participationRate.value)}</td><td>${pct(p.metrics.submissionRate.value)}</td><td>${pct(p.metrics.approvalRate.value)}</td>
          <td>${pct(p.metrics.averageProgress.value)}</td><td>${p.metrics.goalAchievementRate.denominator ? `${p.metrics.goalAchievementRate.numerator}/${p.metrics.goalAchievementRate.denominator}` : '목표 미설정'}</td></tr>`,
        )
        .join('')}
    </table>
    ${snapshot.programs
      .map((program) => {
        const summary = narrative.programs.find((p) => p.programId === program.id)?.summary ?? []
        return `<div class="block"><h3>${e(program.title)}</h3>
          <p class="muted">기간 ${day(program.startDate)} ~ ${day(program.endDate)} · 상태 ${STATUS[program.status] ?? e(program.status)}${program.managers.length ? ` · 담당 ${program.managers.map(e).join(', ')}` : ''}</p>
          ${program.description ? `<p>${e(program.description)}</p>` : ''}
          ${claims(summary)}</div>`
      })
      .join('')}
  </section>`

  const page3 = `<section class="page">
    <h2>3. ${DEFAULT_REPORT_SECTIONS[2].title}</h2>
    <table class="compact"><thead><tr><th>팀 · 프로젝트</th><th>프로그램</th><th>상태</th><th style="width:22%">진행률</th><th>팀원</th><th>참여</th><th>태스크</th><th>활동</th><th>증빙(승인/대기)</th></tr></thead>
      ${kpis.projects
        .map(
          (p) => `<tr><td>${p.teamName ? `<strong>${e(p.teamName)}</strong><br/>` : ''}${e(p.title)}</td><td>${e(programTitle.get(p.programId) ?? '')}</td><td>${STATUS[p.status] ?? e(p.status)}</td>
          <td>${bar(p.progress)}<span class="num">${p.progress}%</span></td><td>${p.memberCount}</td><td>${p.activeContributors}</td><td>${p.tasks.done}/${p.tasks.total}</td><td>${p.activitiesInPeriod}</td><td>${p.evidence.approved}/${p.evidence.pending}</td></tr>`,
        )
        .join('') || '<tr><td colspan="9">운영 프로젝트가 없습니다.</td></tr>'}
    </table>
    <p class="muted">참여 = 기간 내 활동 기록 또는 증빙을 작성한 등록 참여자 수, 활동 = 기간 내 활동 기록 수</p>
    ${trendChart(snapshot)}
    <h3>주요 성과</h3>
    ${claims(narrative.highlights, '서술 없음')}
  </section>`

  const photoItems = snapshot.photoFileIds
    .map((fileId) => {
      const src = photos.get(fileId)
      const item = snapshot.evidence.find((ev) => ev.files.some((f) => f.id === fileId))
      if (!src || !item) return ''
      return `<figure><img src="${src}" alt=""/><figcaption><strong>${e(item.project.teamName ?? item.project.title)}</strong> · ${e(item.title)}<br/><span class="muted">${day(item.activityDate)} · 승인 ${day(item.reviewedAt)}</span></figcaption></figure>`
    })
    .join('')
  const page4 = `<section class="page">
    <h2>4. ${DEFAULT_REPORT_SECTIONS[3].title}</h2>
    ${photoItems ? `<div class="photos">${photoItems}</div>` : '<p class="muted">기간 내 승인된 사진 증빙이 없습니다.</p>'}
    <h3>승인된 주요 증빙</h3>
    <table class="compact"><thead><tr><th>활동일</th><th>팀 · 프로젝트</th><th>증빙</th><th>분류</th><th>승인</th></tr></thead>
      ${snapshot.evidence
        .slice(0, 20)
        .map((ev) => `<tr><td>${day(ev.activityDate)}</td><td>${e(ev.project.teamName ?? ev.project.title)}</td><td>${e(ev.title)}</td><td>${e(ev.category)}</td><td>${day(ev.reviewedAt)}${ev.reviewer ? `<br/><span class="muted">${e(ev.reviewer)}</span>` : ''}</td></tr>`)
        .join('') || '<tr><td colspan="5">기간 내 승인된 증빙이 없습니다.</td></tr>'}
    </table>
    <p class="muted">기관 담당자가 승인한 증빙만 수록했습니다. 전체 목록은 부록을 참고하세요.</p>
  </section>`

  const page5 = `<section class="page">
    <h2>5. ${DEFAULT_REPORT_SECTIONS[4].title}</h2>
    <h3>종합 평가</h3>
    ${claims(narrative.evaluation, '서술 없음')}
    <h3>개선 사항</h3>
    ${claims(narrative.improvements, '데이터에서 확인된 개선 사항이 없습니다.')}
    <div class="note">이 보고서의 모든 통계 수치는 BAESH 데이터베이스(PostgreSQL)의 실제 기록을 생성 시점에 집계한 값입니다.
    서술 문장은 ${input.narrativeSource === 'ai' ? 'AI가 집계 결과를 근거로 작성했으며, 근거에 없는 수치가 포함된 문장은 자동으로 제외되었습니다' : '집계 결과를 바탕으로 규칙 기반 문장으로 작성되었습니다'}.
    문장 끝의 위첨자는 부록의 서술 근거 번호입니다.</div>
  </section>`

  const appendix = `<section class="page">
    <h2>${DEFAULT_REPORT_SECTIONS[5].title}</h2>
    <h3>A. 세부 활동내역 (${snapshot.activities.length}건${snapshot.activitiesTruncated ? ', 최근 기록만 수록' : ''})</h3>
    <table class="compact"><thead><tr><th>일시</th><th>팀 · 프로젝트</th><th>작성자</th><th>활동</th></tr></thead>
      ${snapshot.activities
        .map((a) => `<tr><td>${day(a.createdAt)}</td><td>${e(a.project.teamName ?? a.project.title)}</td><td>${e(a.author)}</td><td>${e(a.title)}${a.description ? `<div class="muted">${e(a.description.slice(0, 200))}</div>` : ''}</td></tr>`)
        .join('') || '<tr><td colspan="4">기간 내 활동 기록이 없습니다.</td></tr>'}
    </table>
    <h3>B. 승인 증빙자료 (${snapshot.evidence.length}건${snapshot.evidenceTruncated ? ', 최근 승인분만 수록' : ''})</h3>
    <table class="compact"><thead><tr><th>활동일</th><th>팀 · 프로젝트</th><th>작성자</th><th>증빙</th><th>첨부 파일(SHA-256 앞 12자리)</th></tr></thead>
      ${snapshot.evidence
        .map((ev) => `<tr><td>${day(ev.activityDate)}</td><td>${e(ev.project.teamName ?? ev.project.title)}</td><td>${e(ev.author)}</td><td>${e(ev.title)}${ev.description ? `<div class="muted">${e(ev.description.slice(0, 200))}</div>` : ''}</td>
          <td>${ev.files.map((f) => `${e(f.name)} <span class="muted">${e(f.sha256.slice(0, 12))}</span>`).join('<br/>') || '-'}</td></tr>`)
        .join('') || '<tr><td colspan="5">기간 내 승인된 증빙이 없습니다.</td></tr>'}
    </table>
    <h3>C. 서술 근거</h3>
    <table class="compact"><thead><tr><th>번호</th><th>근거</th><th>내용</th></tr></thead>
      ${input.narrativeSources.map((s) => `<tr><td>${e(s.ref)}</td><td>${e(s.label)}</td><td>${e(s.text)}</td></tr>`).join('')}
    </table>
  </section>`

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>${e(input.title)}</title><style>
  * { box-sizing: border-box; }
  body { font-family: ${PDF_FONT_STACK}; color: #0f172a; font-size: 9.5pt; line-height: 1.55; margin: 0; }
  .page { page-break-before: always; }
  .cover { border-left: 4px solid #2563eb; padding: 4px 0 4px 14px; margin-bottom: 18px; }
  .cover .org { color: #2563eb; font-weight: 700; font-size: 10pt; }
  h1 { font-size: 20pt; margin: 4px 0; }
  h2 { font-size: 14pt; color: #1e3a8a; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; margin: 0 0 10px; }
  h3 { font-size: 10.5pt; margin: 14px 0 6px; color: #1e293b; break-after: avoid; page-break-after: avoid; }
  thead { display: table-header-group; }
  .meta { color: #475569; font-size: 8.5pt; }
  .muted { color: #64748b; font-size: 8pt; }
  .cards { display: flex; gap: 8px; margin-bottom: 8px; }
  .card { flex: 1; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; }
  .card .label { font-size: 8pt; color: #64748b; }
  .card .value { font-size: 17pt; font-weight: 700; color: #1e3a8a; }
  .card .ratio { font-size: 7.5pt; color: #64748b; }
  .target { font-size: 7.5pt; margin-top: 2px; }
  .target.ok { color: #15803d; } .target.no { color: #b91c1c; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
  th { background: #f1f5f9; font-weight: 600; text-align: left; }
  th, td { border: 1px solid #e2e8f0; padding: 4px 6px; vertical-align: top; font-size: 8.5pt; }
  table.compact th, table.compact td { font-size: 7.5pt; padding: 3px 5px; }
  table.defs td, table.defs th { font-size: 7.5pt; }
  tr { page-break-inside: avoid; }
  .bar { display: inline-block; width: 70%; height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden; vertical-align: middle; }
  .bar span { display: block; height: 100%; }
  .num { font-size: 7.5pt; margin-left: 4px; }
  .claims { padding-left: 16px; margin: 4px 0; }
  .claims li { margin-bottom: 3px; }
  sup { color: #94a3b8; font-size: 6pt; margin-left: 2px; }
  .block { margin-top: 10px; page-break-inside: avoid; }
  .photos { display: flex; flex-wrap: wrap; gap: 8px; }
  figure { width: calc(50% - 4px); margin: 0; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
  figure img { width: 100%; height: 150px; object-fit: cover; display: block; }
  figcaption { padding: 5px 7px; font-size: 7.5pt; }
  .legend { font-size: 7.5pt; color: #64748b; }
  .legend span { display: inline-block; width: 8px; height: 8px; margin: 0 3px 0 8px; }
  .note { margin-top: 18px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; font-size: 8pt; color: #475569; }
</style></head><body>${page1}${page2}${page3}${page4}${page5}${appendix}</body></html>`
}
