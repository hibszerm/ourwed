/**
 * Classic lock / wedding-day QA screenshots.
 * LV3_BASE_URL=http://127.0.0.1:4173/landing-v3 npx tsx scripts/landing-v3-static-screenshots.mts
 */
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'tmp/landing-v3-classic-lock-qa')
const BASE = process.env.LV3_BASE_URL ?? 'http://localhost:5173/landing-v3'

mkdirSync(OUT, { recursive: true })

const shots = [
  {
    name: '01-security-records',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-security-visual"]',
    waitMs: 300,
    forceOpen: true,
  },
  {
    name: '02-security-package',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-security-visual"]',
    waitMs: 1750,
  },
  {
    name: '03-security-open-lock',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-security-visual"]',
    waitMs: 2300,
  },
  {
    name: '04-security-closed',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-security-visual"]',
    waitMs: 3200,
  },
  {
    name: '05-security-keyhole',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-security-visual"]',
    waitMs: 3900,
  },
  {
    name: '06-day-initial',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-day-section"]',
    waitMs: 200,
    freezeDay: true,
  },
  {
    name: '07-day-final',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-day-section"]',
    waitMs: 2700,
  },
  {
    name: '08-calendar',
    width: 1440,
    height: 1000,
    scroll: '[data-testid="lv3-calendar-section"]',
    waitMs: 800,
  },
  {
    name: '09-security-mobile',
    width: 390,
    height: 844,
    scroll: '[data-testid="lv3-security-section"]',
    waitMs: 400,
    reducedMotion: true,
  },
  {
    name: '10-day-mobile',
    width: 390,
    height: 844,
    scroll: '[data-testid="lv3-day-section"]',
    waitMs: 400,
    reducedMotion: true,
  },
] as const

async function main() {
  const browser = await chromium.launch({ headless: true })
  const errors: string[] = []

  for (const shot of shots) {
    const context = await browser.newContext({
      viewport: { width: shot.width, height: shot.height },
      reducedMotion:
        'reducedMotion' in shot && shot.reducedMotion ? 'reduce' : 'no-preference',
    })
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(`${shot.name}: ${err.message}`))
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    await page.waitForSelector(
      '[data-landing-v3-rebuild="classic-lock-day"]',
      { timeout: 15000 },
    )

    if ('freezeDay' in shot && shot.freezeDay) {
      await page.addStyleTag({
        content: `
          [data-testid="lv3-day-totals"] { opacity: 0.25 !important; }
          [data-testid="lv3-day-section"] [data-route-leg] {
            opacity: 0.4 !important;
            transform: scaleY(0.15) !important;
          }
          [data-testid="lv3-day-status"] { opacity: 0.35 !important; }
        `,
      })
    }

    if (shot.scroll) {
      await page.locator(shot.scroll).first().scrollIntoViewIfNeeded().catch(() => undefined)
      await page.waitForTimeout(shot.waitMs ?? 350)
    } else {
      await page.waitForTimeout(shot.waitMs ?? 200)
    }

    if ('forceOpen' in shot && shot.forceOpen) {
      await page.addStyleTag({
        content: `
          [data-testid="lv3-security-lock"] [class*="lockShell"] {
            opacity: 0 !important;
            pointer-events: none !important;
          }
          [data-testid="lv3-security-lock"] [class*="sealLabel"] {
            opacity: 0 !important;
          }
          [data-testid="lv3-security-lock"] [class*="record"] {
            opacity: 1 !important;
            transform: none !important;
          }
        `,
      })
      await page.evaluate(() => {
        const root = document.querySelector('[data-testid="lv3-security-lock"]')
        if (root) root.setAttribute('data-lock-phase', 'open')
      })
      await page.waitForTimeout(80)
    }

    await page.screenshot({ path: join(OUT, `${shot.name}.png`) })
    console.log('wrote', shot.name)
    await context.close()
  }

  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(`scroll: ${err.message}`))
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    const height = await page.evaluate(() => document.documentElement.scrollHeight)
    let step = 0
    for (let y = 0; y < height; y += 900) {
      await page.evaluate((yy) => window.scrollTo(0, yy), y)
      await page.waitForTimeout(240)
      await page.screenshot({
        path: join(OUT, `scroll-${String(step).padStart(2, '0')}.png`),
      })
      step += 1
    }
    console.log('scroll frames', step)
    await context.close()
  }

  for (const vp of [
    { w: 1440, h: 1000 },
    { w: 1280, h: 900 },
    { w: 1024, h: 768 },
    { w: 768, h: 1024 },
    { w: 430, h: 932 },
    { w: 390, h: 844 },
    { w: 360, h: 800 },
  ]) {
    const context = await browser.newContext({ viewport: { width: vp.w, height: vp.h } })
    const page = await context.newPage()
    page.on('pageerror', (err) => errors.push(`vp ${vp.w}: ${err.message}`))
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 60000 })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
    )
    if (overflow) errors.push(`overflow ${vp.w}x${vp.h}`)
    await page.screenshot({ path: join(OUT, `vp-${vp.w}x${vp.h}.png`) })
    await context.close()
  }

  await browser.close()
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
  console.log('PASS →', OUT)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
