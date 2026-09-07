/**
 * Capture Product Story tab snapshots only (Iteration 2.1).
 */
import { mkdirSync, writeFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/landing-v2/devices')
const BASE = process.env.LANDING_CAPTURE_BASE ?? 'http://127.0.0.1:5173'

const SHOTS = [
  { name: 'product-tablet-overview', board: 'product-overview' },
  { name: 'product-tablet-logistics', board: 'product-logistics' },
  { name: 'product-tablet-finance', board: 'product-finance' },
  { name: 'product-tablet-questionnaire', board: 'product-questionnaire' },
] as const

async function main() {
  mkdirSync(OUT, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
  })
  for (const shot of SHOTS) {
    await page.goto(`${BASE}/dev/landing-device-capture?board=${shot.board}`, {
      waitUntil: 'networkidle',
      timeout: 60000,
    })
    await page.waitForTimeout(900)
    const el = page.locator('[data-capture-target="product-tablet"]').first()
    await el.waitFor({ state: 'visible', timeout: 30000 })
    const buf = await el.screenshot({ type: 'png', animations: 'disabled' })
    const outPath = join(OUT, `${shot.name}.png`)
    writeFileSync(outPath, buf)
    const box = await el.boundingBox()
    console.log(
      `OK  ${shot.name}.png  ${statSync(outPath).size}b  css=${box?.width?.toFixed(0)}x${box?.height?.toFixed(0)}`,
    )
  }
  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
