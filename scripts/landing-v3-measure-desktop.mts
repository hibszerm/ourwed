import { chromium } from 'playwright'

async function main() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  await page.goto('http://127.0.0.1:5173/landing-v3', {
    waitUntil: 'networkidle',
    timeout: 90000,
  })
  await page.waitForTimeout(1500)

  const sels: Record<string, string> = {
    import: '[data-testid="lv3-import-section"] [data-landing-preview]',
    assignment: '[data-testid="lv3-assignment-overview"] [data-landing-preview]',
    qc: '[data-testid="lv3-qc-section"] [data-landing-preview]',
    finance: '[data-testid="lv3-finance-section"] [data-landing-preview]',
    day: '[data-testid="lv3-day-section"] [data-landing-preview]',
    security: '[data-testid="lv3-security-visual"]',
    calendar: '[data-testid="lv3-calendar-section"] [data-landing-preview]',
    brief: '[data-testid="lv3-brief-section"] [data-landing-preview]',
    sessions: '[data-testid="lv3-weddings-sessions"] [data-landing-preview]',
  }

  const out: Record<string, unknown> = {}
  for (const [k, s] of Object.entries(sels)) {
    const el = await page.$(s)
    if (!el) {
      out[k] = null
      continue
    }
    const b = await el.boundingBox()
    out[k] = b ? { w: Math.round(b.width), h: Math.round(b.height) } : null
  }

  out.importFull = await page.evaluate(() => {
    const sec = document.querySelector('[data-testid="lv3-import-section"]')
    const process = sec?.querySelector('ol')
    const compose = sec?.querySelector('[data-landing-preview]')
    if (!process || !compose) return null
    const a = process.getBoundingClientRect()
    const b = compose.getBoundingClientRect()
    const top = Math.min(a.top, b.top)
    const bottom = Math.max(a.bottom, b.bottom)
    const left = Math.min(a.left, b.left)
    const right = Math.max(a.right, b.right)
    return { w: Math.round(right - left), h: Math.round(bottom - top) }
  })

  out.sectionWidth = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="lv3-assignment-overview"]')
    return el ? Math.round(el.getBoundingClientRect().width) : null
  })

  console.log(JSON.stringify(out, null, 2))
  await browser.close()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
