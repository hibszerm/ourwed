/**
 * Landing V3 — mobile security handoff + vertical rhythm QA.
 *
 *   LV3_BASE_URL=http://127.0.0.1:5173/landing-v3 npx tsx scripts/landing-v3-mobile-polish-qa.mts
 */
import {
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { chromium, type Page } from 'playwright'

const require = createRequire(import.meta.url)
const ffmpegPath: string | null = (() => {
  try {
    return require('ffmpeg-static') as string
  } catch {
    return null
  }
})()

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'docs/landing-v3-parity/true-scale')
const BASE = process.env.LV3_BASE_URL ?? 'http://127.0.0.1:5173/landing-v3'

mkdirSync(OUT, { recursive: true })

function tryConvertToMp4(webmPath: string, mp4Path: string): boolean {
  const bin = ffmpegPath ?? 'ffmpeg'
  const ffmpeg = spawnSync(bin, [
    '-y',
    '-i',
    webmPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-an',
    mp4Path,
  ])
  return ffmpeg.status === 0 && existsSync(mp4Path)
}

async function settle(page: Page, ms = 400) {
  await page.waitForTimeout(ms)
}

type GapRow = { from: string; to: string; px: number }

async function measureGaps(page: Page): Promise<GapRow[]> {
  return page.evaluate(`(() => {
    const pairs = [
      ['hero', '[data-composition-id="landing-hero"], [data-composition-key="hero"]', 'import', '[data-testid="lv3-import-section"] h2, [data-testid="lv3-import-section"]'],
      ['import', '[data-testid="lv3-import-section"] [data-desktop-composition-scale]', 'assignment', '[data-testid="lv3-assignment-overview"] h2, [data-testid="lv3-assignment-overview"]'],
      ['assignment', '[data-testid="lv3-assignment-overview"] [data-desktop-composition-scale]', 'qc', '[data-testid="lv3-qc-section"] h2, [data-testid="lv3-qc-section"]'],
      ['qc', '[data-testid="lv3-qc-section"] [data-desktop-composition-scale]', 'finance', '[data-testid="lv3-finance-section"] h2, [data-testid="lv3-finance-section"]'],
      ['finance', '[data-testid="lv3-finance-section"] [data-desktop-composition-scale]', 'day', '[data-testid="lv3-day-section"] h2, [data-testid="lv3-day-section"]'],
      ['day', '[data-testid="lv3-day-section"] [data-desktop-composition-scale]', 'phones', '[data-testid="lv3-mobile-wedding-day"] h2, [data-testid="lv3-mobile-wedding-day"]'],
      ['phones', '[data-testid="lv3-mobile-wedding-day"] [data-testid="lv3-mobile-benefits"]', 'security', '[data-testid="lv3-security-section"]'],
      ['security', '[data-testid="lv3-security-section"] [data-desktop-composition-scale]', 'calendar', '[data-testid="lv3-calendar-section"] h2, [data-testid="lv3-calendar-section"]'],
      ['calendar', '[data-testid="lv3-calendar-section"] [data-desktop-composition-scale]', 'brief', '[data-testid="lv3-brief-section"] h2, [data-testid="lv3-brief-section"]'],
      ['brief', '[data-testid="lv3-brief-section"] [data-desktop-composition-scale]', 'sessions', '[data-testid="lv3-weddings-sessions"] h2, [data-testid="lv3-weddings-sessions"]'],
      ['sessions', '[data-testid="lv3-weddings-sessions"] [data-desktop-composition-scale]', 'pricing', '[data-testid="lv3-pricing"] h2, [data-testid="lv3-pricing"]'],
      ['pricing', '[data-testid="lv3-pricing"]', 'faq', '#faq-title'],
      ['faq', '#faq-title', 'cta', '[data-testid="lv3-final-cta"]'],
    ]

    const pick = (sel) => {
      for (const part of sel.split(',').map((s) => s.trim())) {
        const el = document.querySelector(part)
        if (el) return el
      }
      return null
    }

    const rows = []
    for (const [from, fromSel, to, toSel] of pairs) {
      const a = pick(fromSel)
      const b = pick(toSel)
      if (!a || !b) {
        rows.push({ from, to, px: -1 })
        continue
      }
      const ar = a.getBoundingClientRect()
      const br = b.getBoundingClientRect()
      const gap = Math.round(br.top - ar.bottom)
      rows.push({ from, to, px: gap })
    }
    return rows
  })()`) as Promise<GapRow[]>
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const report: Record<string, unknown> = {
    generatedAt: new Date().toISOString(),
    base: BASE,
  }

  // ── Desktop regression (must remain unchanged visually) ──
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 800)
    await page.screenshot({
      path: join(OUT, 'polish-desktop-1440x1000.png'),
      fullPage: false,
    })
    await page.setViewportSize({ width: 1280, height: 900 })
    await settle(page, 500)
    await page.screenshot({
      path: join(OUT, 'polish-desktop-1280x900.png'),
      fullPage: false,
    })
    await context.close()
  }

  // ── Mobile widths + spacing ──
  for (const vp of [
    { w: 390, h: 844, label: '390' },
    { w: 430, h: 932, label: '430' },
    { w: 360, h: 800, label: '360' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 700)

    await page.screenshot({
      path: join(OUT, `polish-mobile-${vp.label}.png`),
      fullPage: false,
    })

    const gaps = await measureGaps(page)
    report[`gaps-${vp.label}`] = gaps

    const tokens = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('[class*="page"]') ?? document.body)
      return {
        major: s.getPropertyValue('--lv3-mobile-section-gap-major').trim(),
        normal: s.getPropertyValue('--lv3-mobile-section-gap-normal').trim(),
        copyToProduct: s.getPropertyValue('--lv3-mobile-copy-to-product').trim(),
        productToCopy: s.getPropertyValue('--lv3-mobile-product-to-copy').trim(),
        productToNext: s.getPropertyValue('--lv3-mobile-product-to-next-section').trim(),
        headingToSupport: s.getPropertyValue('--lv3-mobile-heading-to-support').trim(),
      }
    })
    report[`tokens-${vp.label}`] = tokens

    if (vp.w === 390) {
      // Full scroll recording
      const webm = join(OUT, 'polish-mobile-390-full-scroll.webm')
      const mp4 = join(OUT, 'polish-mobile-390-full-scroll.mp4')
      await page.evaluate(() => window.scrollTo(0, 0))
      await settle(page, 400)
      const video = await page.video()?.path().catch(() => null)
      // Use CDP screencast via Playwright recordVideo on a fresh context below
      void video
      void webm
      void mp4
    }

    await context.close()
  }

  // Dedicated contexts with video for full scroll + security isolated
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 600)
    await page.evaluate(() => window.scrollTo(0, 0))
    await settle(page, 300)

    const total = await page.evaluate(() => document.body.scrollHeight)
    const step = 40
    for (let y = 0; y < total; y += step) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(55)
    }
    await settle(page, 800)
    await context.close()
    // Playwright names video by page guid — rename newest webm
    const { readdirSync, renameSync, statSync } = await import('node:fs')
    const files = readdirSync(OUT)
      .filter((f) => f.endsWith('.webm'))
      .map((f) => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
    if (files[0]) {
      const src = join(OUT, files[0].f)
      const destWebm = join(OUT, 'polish-mobile-390-full-scroll.webm')
      renameSync(src, destWebm)
      tryConvertToMp4(destWebm, join(OUT, 'polish-mobile-390-full-scroll.mp4'))
    }
  }

  // Security isolated recording + frame captures
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
      // Ensure motion runs (not reduced)
      reducedMotion: 'no-preference',
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 500)

    const visual = page.locator('[data-testid="lv3-security-visual"]').first()

    // Park visual just below trigger so initial open-state records are visible first
    await page.evaluate(() => {
      const el = document.querySelector(
        '[data-security-activation-target]',
      ) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      // Keep top below 70% so animation has not started yet
      window.scrollBy(0, rect.top - vh * 0.82)
    })
    await settle(page, 350)

    // Frame 0.0s — initial records, lock not yet closed
    await visual.screenshot({ path: join(OUT, 'security-frame-0s.png') })

    // Cross the mobile trigger (~64% VH)
    await page.evaluate(() => {
      const el = document.querySelector(
        '[data-security-activation-target]',
      ) as HTMLElement | null
      if (!el) return
      const rect = el.getBoundingClientRect()
      const vh = window.innerHeight
      window.scrollBy(0, rect.top - vh * 0.62)
    })

    const t0 = Date.now()
    for (let i = 0; i < 50; i++) {
      const phase = await page
        .locator('[data-testid="lv3-security-lock"]')
        .getAttribute('data-lock-phase')
      if (phase === 'closed') break
      await page.waitForTimeout(40)
    }
    const activatedAt = Date.now()

    const later = [0.4, 0.8, 1.05, 1.25, 1.5, 1.75]
    for (const t of later) {
      const wait = Math.max(0, t * 1000 - (Date.now() - activatedAt))
      if (wait > 0) await page.waitForTimeout(wait)
      const name = `security-frame-${String(t).replace('.', 'p')}s.png`
      await visual.screenshot({ path: join(OUT, name) })
    }
    await settle(page, 500)
    await context.close()

    const { readdirSync, renameSync, statSync } = await import('node:fs')
    const files = readdirSync(OUT)
      .filter((f) => f.endsWith('.webm'))
      .map((f) => ({ f, m: statSync(join(OUT, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m)
    const newest = files.find((f) => !f.f.startsWith('polish-mobile-390-full'))
    if (newest) {
      const src = join(OUT, newest.f)
      const destWebm = join(OUT, 'polish-security-isolated-390.webm')
      renameSync(src, destWebm)
      tryConvertToMp4(destWebm, join(OUT, 'polish-security-isolated-390.mp4'))
    }
    report.securityFrames = [
      'security-frame-0s.png',
      ...later.map((t) => `security-frame-${String(t).replace('.', 'p')}s.png`),
    ]
    report.securityActivateLagMs = activatedAt - t0
  }

  writeFileSync(join(OUT, 'polish-report.json'), JSON.stringify(report, null, 2))
  writeFileSync(
    join(OUT, 'POLISH-REPORT.md'),
    [
      '# Landing V3 — Mobile polish QA',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      '## Spacing gaps @390',
      '',
      '```json',
      JSON.stringify(report['gaps-390'], null, 2),
      '```',
      '',
      '## Tokens @390',
      '',
      '```json',
      JSON.stringify(report['tokens-390'], null, 2),
      '```',
      '',
      '## Artifacts',
      '',
      '- polish-mobile-390-full-scroll.mp4',
      '- polish-security-isolated-390.mp4',
      '- security-frame-*.png',
      '- polish-desktop-1440x1000.png / polish-desktop-1280x900.png',
      '',
    ].join('\n'),
  )

  console.log('polish QA written to', OUT)
  console.log('gaps-390', report['gaps-390'])
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
