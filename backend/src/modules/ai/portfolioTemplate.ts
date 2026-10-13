import { escapeHtml as e, PDF_FONT_STACK } from '../../services/pdf/renderPdf.js'
import type { GroundedClaim } from '../../services/ai/grounding.js'
import type { PortfolioResult } from '../../services/ai/tasks/portfolio.js'

const SECTIONS = [
  ['contributions', '담당 업무와 기여'],
  ['process', '수행 과정'],
  ['technicalResults', '기술적 결과'],
  ['outcomes', '결과'],
] as const

function claimItem(claim: GroundedClaim) {
  return `<li>${e(claim.text)}${claim.verified ? ' <span class="badge">기관 검증</span>' : ''} <span class="refs">[${claim.sourceRefs.map(e).join(', ')}]</span></li>`
}

export function portfolioHtml(portfolio: PortfolioResult, meta: { name: string; generatedAt: Date }) {
  const projects = portfolio.projects
    .map((project) => {
      const sections = SECTIONS.filter(([key]) => project[key].length)
        .map(([key, label]) => `<h4>${label}</h4><ul>${project[key].map(claimItem).join('')}</ul>`)
        .join('')
      const evidence = project.verifiedEvidence.length
        ? `<div class="verified"><strong>기관 검증 기록</strong><ul>${project.verifiedEvidence
            .map((item) => `<li>${e(item.label)} — ${e(item.text)} <span class="refs">[${e(item.ref)}]</span></li>`)
            .join('')}</ul></div>`
        : ''
      const links = project.links.length
        ? `<p class="links">${project.links.map((link) => `${e(link.label)}: ${e(link.url)}`).join('<br/>')}</p>`
        : ''
      return `<section class="project">
        <h3>${e(project.title)} <span class="role">${e(project.role)}</span>${project.isProgramProject ? '<span class="tag">기관 프로그램</span>' : ''}</h3>
        ${project.intro ? `<p class="intro">${e(project.intro.text)}</p>` : ''}
        ${project.roleSummary ? `<p><strong>역할</strong> ${e(project.roleSummary.text)}</p>` : ''}
        ${sections}${evidence}${links}
      </section>`
    })
    .join('')

  const sourceRows = portfolio.sources
    .filter((source) => source.kind !== 'fact')
    .map(
      (source) =>
        `<tr><td>${e(source.ref)}</td><td>${e(source.label)}${source.verified ? ' <span class="badge">검증</span>' : ''}</td><td>${e(source.text)}</td></tr>`,
    )
    .join('')

  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><title>${e(meta.name)} 포트폴리오</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: ${PDF_FONT_STACK}; color: #0f172a; font-size: 10.5pt; line-height: 1.6; margin: 0; }
  header { border-bottom: 2px solid #2563eb; padding-bottom: 10px; margin-bottom: 16px; }
  h1 { font-size: 20pt; margin: 0; }
  .headline { color: #334155; margin: 4px 0 0; }
  .meta { color: #64748b; font-size: 8.5pt; margin-top: 6px; }
  h2 { font-size: 13pt; color: #1d4ed8; margin: 18px 0 8px; }
  h3 { font-size: 12pt; margin: 0 0 6px; }
  h4 { font-size: 10pt; color: #475569; margin: 10px 0 4px; }
  .role { font-size: 9pt; font-weight: 500; color: #475569; margin-left: 6px; }
  .tag { font-size: 8pt; background: #eff6ff; color: #1d4ed8; border-radius: 4px; padding: 1px 6px; margin-left: 6px; }
  .project { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; page-break-inside: avoid; }
  .intro { margin: 0 0 6px; }
  ul { margin: 0; padding-left: 18px; }
  .badge { font-size: 7.5pt; background: #dcfce7; color: #166534; border-radius: 4px; padding: 0 5px; }
  .refs { font-size: 7.5pt; color: #94a3b8; }
  .verified { background: #f0fdf4; border-radius: 6px; padding: 8px 10px; margin-top: 8px; font-size: 9pt; }
  .links { font-size: 8.5pt; color: #475569; margin: 8px 0 0; word-break: break-all; }
  .skills span { display: inline-block; border: 1px solid #cbd5e1; border-radius: 999px; padding: 1px 8px; margin: 0 4px 4px 0; font-size: 9pt; }
  table { width: 100%; border-collapse: collapse; font-size: 8pt; }
  td { border-top: 1px solid #e2e8f0; padding: 4px; vertical-align: top; }
  td:first-child { width: 36px; color: #64748b; }
  td:nth-child(2) { width: 30%; }
  .appendix { page-break-before: always; }
  .note { font-size: 8pt; color: #64748b; }
</style></head><body>
<header>
  <h1>${e(meta.name)}</h1>
  <p class="headline">${e(portfolio.headline)}</p>
  <p class="meta">BAESH 기록 기반 자동 생성 · ${meta.generatedAt.toISOString().slice(0, 10)} · 기관 검증 문장 ${portfolio.stats.verifiedClaims}/${portfolio.stats.totalClaims}</p>
</header>
${portfolio.resumeSummary.length ? `<h2>요약</h2><ul>${portfolio.resumeSummary.map(claimItem).join('')}</ul>` : ''}
${portfolio.skills.length ? `<h2>기술</h2><div class="skills">${portfolio.skills.map((skill) => `<span>${e(skill.name)}${skill.verified ? ' ✓' : ''}</span>`).join('')}</div>` : ''}
<h2>프로젝트</h2>
${projects || '<p>포트폴리오에 포함할 프로젝트가 없습니다.</p>'}
<section class="appendix">
  <h2>근거 자료</h2>
  <p class="note">각 문장 끝의 [ref]는 아래 BAESH 기록을 가리킵니다. "검증" 표시는 기관 담당자가 승인한 증빙이며, 그 외는 본인이 입력한 기록입니다.</p>
  <table>${sourceRows}</table>
</section>
</body></html>`
}
