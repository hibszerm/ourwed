/**
 * Capture Landing V2 device snapshots for compact flattened theaters.
 * Marketing demo UI only — no CRM/auth data.
 *
 * Usage (dev server on :5173):
 *   npx tsx --tsconfig tsconfig.app.json scripts/captureLandingDeviceSnapshots.ts
 */

import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium, type Page } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/landing-v2/devices')
const BASE = process.env.LANDING_CAPTURE_BASE ?? 'http://127.0.0.1:5173'

type Shot = {
  name: string
  url: string
  selector: string
  /** Optional downscale width for encoded PNG. */
  width?: number
}

const SHOTS: Shot[] = [
  {
    name: 'hero-tablet-light',
    url: `${BASE}/dev/landing-device-capture?board=hero-light`,
    selector: '[data-capture-target="hero-tablet"]',
    width: 1200,
  },
  {
    name: 'hero-tablet-dark',
    url: `${BASE}/dev/landing-device-capture?board=hero-dark`,
    selector: '[data-capture-target="hero-tablet"]',
    width: 1200,
  },
  {
    name: 'product-tablet-overview',
    url: `${BASE}/dev/landing-device-capture?board=product-overview`,
    selector: '[data-capture-target="product-tablet"]',
    width: 1200,
  },
  {
    name: 'phone-dashboard',
    url: `${BASE}/dev/landing-device-capture?board=phone&p=0.08`,
    selector: '[data-capture-target="phone-app"]',
    width: 780,
  },
  {
    name: 'phone-dashboard-end',
    url: `${BASE}/dev/landing-device-capture?board=phone&p=0.48`,
    selector: '[data-capture-target="phone-app"]',
    width: 780,
  },
  {
    name: 'phone-day',
    url: `${BASE}/dev/landing-device-capture?board=phone&p=0.72`,
    selector: '[data-capture-target="phone-app"]',
    width: 780,
  },
  {
    name: 'phone-nav',
    url: `${BASE}/dev/landing-device-capture?board=phone&p=0.86`,
    selector: '[data-capture-target="phone-app"]',
    width: 780,
  },
  {
    name: 'phone-brief',
    url: `${BASE}/dev/landing-device-capture?board=phone&p=0.97`,
    selector: '[data-capture-target="phone-app"]',
    width: 780,
  },
]

async function captureOne(page: Page, shot: Shot) {
  await page.goto(shot.url, { waitUntil: 'networkidle', timeout: 60000 })
  await page.waitForTimeout(700)
  const el = page.locator(shot.selector).first()
  await el.waitFor({ state: 'visible', timeout: 30000 })
  const buf = await el.screenshot({ type: 'png', animations: 'disabled' })
  const outPath = join(OUT, `${shot.name}.png`)
  writeFileSync(outPath, buf)
  const bytes = statSync(outPath).size
  const box = await el.boundingBox()
  console.log(
    `OK  ${shot.name}.png  ${bytes} bytes  css=${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}`,
  )
  return { name: shot.name, bytes, box }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  })
  const results = []
  for (const shot of SHOTS) {
    results.push(await captureOne(page, shot))
  }
  await browser.close()
  writeFileSync(
    join(OUT, 'manifest.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2),
  )
  console.log(`Wrote ${results.length} snapshots → ${OUT}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
