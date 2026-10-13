import { chromium, type Browser } from 'playwright'
import { env } from '../../config/env.js'

let browserPromise: Promise<Browser> | null = null

function getBrowser() {
  if (!browserPromise) {
    browserPromise = chromium.launch({ headless: true, args: ['--disable-dev-shm-usage'] }).catch((error) => {
      browserPromise = null
      throw error
    })
  }
  return browserPromise
}

export async function closePdfBrowser() {
  if (!browserPromise) return
  const browser = await browserPromise.catch(() => null)
  browserPromise = null
  await browser?.close()
}

export const escapeHtml = (value: unknown) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Korean-capable font stack: Apple SD Gothic Neo on macOS, Noto Sans CJK (fonts-noto-cjk) on Linux. */
export const PDF_FONT_STACK = "'Pretendard', 'Apple SD Gothic Neo', 'Noto Sans CJK KR', 'Noto Sans KR', 'Malgun Gothic', sans-serif"

/**
 * Renders self-contained HTML (images inlined as data URIs) to an A4 PDF. JavaScript is disabled
 * and every network request is blocked, so user-provided text cannot load remote resources.
 */
export async function renderPdf(html: string, options: { footerLabel?: string } = {}) {
  const browser = await getBrowser()
  const context = await browser.newContext({ javaScriptEnabled: false })
  try {
    await context.route('**/*', (route) => {
      const url = route.request().url()
      return url.startsWith('data:') || url === 'about:blank' ? route.continue() : route.abort()
    })
    const page = await context.newPage()
    page.setDefaultTimeout(env.REPORT_RENDER_TIMEOUT_MS)
    await page.setContent(html, { waitUntil: 'load', timeout: env.REPORT_RENDER_TIMEOUT_MS })
    const footer = escapeHtml(options.footerLabel ?? 'BAESH')
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', bottom: '18mm', left: '14mm', right: '14mm' },
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: `<div style="width:100%;font-size:8px;color:#94a3b8;padding:0 14mm;display:flex;justify-content:space-between;font-family:${PDF_FONT_STACK.replace(/'/g, '')}"><span>${footer}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    })
  } finally {
    await context.close()
  }
}
