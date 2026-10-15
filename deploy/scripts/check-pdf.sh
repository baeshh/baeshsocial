#!/usr/bin/env bash
# Usage: BAESH_ENV=staging|production check-pdf.sh [backend-dir]   (default: the live release)
# PDF smoke test: renders a Korean page through the release's own renderPdf (same Chromium, launch flags and
# font stack as the API) and fails unless the result is a PDF with a Korean-capable font embedded. A missing
# Chromium, missing system libraries or missing CJK fonts (text rendered as empty boxes) all fail it.
# deploy.sh runs it before migrating and switching; run it again on the live release after a deploy.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
. "$DIR/lib.sh"

BACKEND="${1:-${CURRENT_LINK}/backend}"
[ -f "$BACKEND/dist/src/services/pdf/renderPdf.js" ] || die "no built release at ${BACKEND}"
cd "$BACKEND"

TIMEOUT=""
if command -v timeout >/dev/null; then TIMEOUT="timeout 180"; fi

# shellcheck disable=SC2086
NODE_ENV=production APP_ENV="$BAESH_ENV" $TIMEOUT node --input-type=module -e '
let failure = null
let closePdfBrowser = async () => {}
try {
  const renderer = await import(`${process.cwd()}/dist/src/services/pdf/renderPdf.js`)
  closePdfBrowser = renderer.closePdfBrowser
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8"></head>
    <body style="font-family:${renderer.PDF_FONT_STACK}"><h1>BAESH PDF 점검</h1><p>한글 렌더링 확인: 가나다라마바사아자차카타파하</p></body></html>`
  const pdf = Buffer.from(await renderer.renderPdf(html, { footerLabel: "BAESH PDF 점검" }))
  const text = pdf.toString("latin1")
  // Chromium names embedded fonts in /BaseFont (Type0/TrueType) or only in the descriptor /FontName (Type3).
  const fonts = [...new Set([...text.matchAll(/\/(?:BaseFont|FontName)\s*\/(?:[A-Z]{6}\+)?([^\s/<>\[\]()]+)/g)].map((m) => m[1]))]
  const korean = fonts.filter((name) => /cjk|kr\b|korean|gothic|pretendard|malgun|nanum/i.test(name))
  if (!text.startsWith("%PDF-")) failure = "renderer output is not a PDF"
  else if (korean.length === 0) failure = `no Korean font embedded (fonts: ${fonts.join(", ") || "none"}); install fonts-noto-cjk`
  else console.log(`PDF ok: ${pdf.length} bytes, Korean font ${korean.join(", ")}`)
} catch (error) {
  failure = `PDF rendering failed: ${error instanceof Error ? error.message.split("\n")[0] : error}`
} finally {
  await closePdfBrowser().catch(() => {})
}
if (failure) {
  console.error(`ERROR: ${failure}`)
  process.exit(1)
}
'
