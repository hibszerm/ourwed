/**
 * True 1:1 desktop→mobile scale QA.
 *
 * For each composition:
 * 1. Capture desktop composition
 * 2. Mathematically resize to mobile available width
 * 3. Capture real mobile scaled composition
 * 4. Produce a visual diff sheet
 *
 * Also exports full 390×844 scroll MP4 and multi-width screenshots.
 *
 *   LV3_BASE_URL=http://127.0.0.1:5173/landing-v3 npx tsx scripts/landing-v3-true-scale-qa.mts
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { chromium, type Page } from 'playwright'
import {
  COMPOSITION_VERSION,
  computeCompositionScale,
  computeScaledHeight,
  DESKTOP_COMPOSITION_METRICS,
  type CompositionKey,
} from '../src/features/landing-v3/components/desktopCompositionMetrics'

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

const COMPOSITIONS: Array<{
  key: CompositionKey
  name: string
  sel: string
}> = [
  { key: 'import', name: 'import', sel: '[data-composition-id="landing-import"]' },
  {
    key: 'assignment',
    name: 'assignment',
    sel: '[data-composition-id="landing-assignment"]',
  },
  { key: 'questionnaireContract', name: 'qc', sel: '[data-composition-id="landing-qc"]' },
  { key: 'finance', name: 'finance', sel: '[data-composition-id="landing-finance"]' },
  {
    key: 'weddingDay',
    name: 'wedding-day',
    sel: '[data-composition-id="landing-wedding-day"]',
  },
  { key: 'security', name: 'security', sel: '[data-composition-id="landing-security"]' },
  { key: 'calendar', name: 'calendar', sel: '[data-composition-id="landing-calendar"]' },
  { key: 'brief', name: 'brief', sel: '[data-composition-id="landing-brief"]' },
  { key: 'sessions', name: 'sessions', sel: '[data-composition-id="landing-sessions"]' },
]

async function settle(page: Page, ms = 500) {
  await page.waitForTimeout(ms)
}

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

async function main() {
  const errors: string[] = []
  const browser = await chromium.launch({ headless: true })
  const report: Record<string, unknown> = {
    compositionVersion: COMPOSITION_VERSION,
    scales: {} as Record<string, unknown>,
  }

  // Desktop baselines
  {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 900)

    const mode = await page.evaluate(
      `(() => document.querySelector('[data-viewport-mode]')?.getAttribute('data-viewport-mode'))()`,
    )
    if (mode !== 'desktop') errors.push(`desktop mode expected, got ${mode}`)

    await page.screenshot({
      path: join(OUT, 'desktop-baseline-1440x1000.png'),
      fullPage: false,
    })

    for (const c of COMPOSITIONS) {
      const loc = page.locator(c.sel).first()
      if ((await loc.count()) === 0) {
        // On desktop, parity canvas attr may be absent — fall back to landing-preview in section
        const fallback =
          c.name === 'security'
            ? '[data-testid="lv3-security-visual"]'
            : c.name === 'import'
              ? '[data-testid="lv3-import-section"] [data-landing-preview]'
              : c.name === 'assignment'
                ? '[data-testid="lv3-assignment-overview"] [data-landing-preview]'
                : c.name === 'qc'
                  ? '[data-testid="lv3-qc-section"] [data-landing-preview]'
                  : c.name === 'finance'
                    ? '[data-testid="lv3-finance-section"] [data-landing-preview]'
                    : c.name === 'wedding-day'
                      ? '[data-testid="lv3-day-section"] [data-landing-preview]'
                      : c.name === 'calendar'
                        ? '[data-testid="lv3-calendar-section"] [data-landing-preview]'
                        : c.name === 'brief'
                          ? '[data-testid="lv3-brief-section"] [data-landing-preview]'
                          : '[data-testid="lv3-weddings-sessions"] [data-landing-preview]'
        const fl = page.locator(fallback).first()
        if ((await fl.count()) === 0) {
          errors.push(`missing desktop ${c.name}`)
          continue
        }
        await fl.scrollIntoViewIfNeeded()
        await settle(page, 700)
        await fl.screenshot({ path: join(OUT, `${c.name}-desktop.png`) })
      } else {
        await loc.scrollIntoViewIfNeeded()
        await settle(page, 700)
        await loc.screenshot({ path: join(OUT, `${c.name}-desktop.png`) })
      }
      console.log('desktop', c.name)
    }

    // 1280 regression
    await page.setViewportSize({ width: 1280, height: 900 })
    await settle(page, 600)
    await page.screenshot({
      path: join(OUT, 'desktop-baseline-1280x900.png'),
      fullPage: false,
    })
    await context.close()
  }

  // Mobile captures + scale math at 390 / 430 / 360
  for (const vp of [
    { w: 390, h: 844 },
    { w: 430, h: 932 },
    { w: 360, h: 800 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 1000)

    const overflow = await page.evaluate(
      `(() => document.documentElement.scrollWidth === document.documentElement.clientWidth)()`,
    )
    if (!overflow) errors.push(`horizontal overflow at ${vp.w}`)

    const metrics = await page.evaluate(`(() => {
      return [...document.querySelectorAll('[data-desktop-composition-scale]')].map((el) => ({
        key: el.getAttribute('data-composition-key'),
        baseW: Number(el.getAttribute('data-base-width')),
        baseH: Number(el.getAttribute('data-base-height')),
        scale: Number(el.getAttribute('data-computed-scale')),
        active: el.getAttribute('data-scale-active'),
        version: el.querySelector('[data-composition-version]')?.getAttribute('data-composition-version'),
        id: el.querySelector('[data-composition-id]')?.getAttribute('data-composition-id'),
        outerH: Math.round(el.getBoundingClientRect().height),
        outerW: Math.round(el.getBoundingClientRect().width),
      }));
    })()`)

    ;(report.scales as Record<string, unknown>)[`${vp.w}`] = metrics

    for (const row of metrics as Array<Record<string, unknown>>) {
      const key = row.key as CompositionKey
      const m = DESKTOP_COMPOSITION_METRICS[key]
      if (!m) continue
      const expected = computeCompositionScale(m.width, Number(row.outerW), 1)
      const got = Number(row.scale)
      if (Math.abs(expected - got) > 0.002) {
        errors.push(
          `${key}@${vp.w} scale mismatch expected ${expected} got ${got}`,
        )
      }
      if (row.version !== COMPOSITION_VERSION) {
        errors.push(`${key} version mismatch`)
      }
      const expectedH = Math.round(
        computeScaledHeight(m.height, got, m.shadowPadding ?? 0),
      )
      const outerH = Number(row.outerH)
      if (Math.abs(expectedH - outerH) > 2) {
        console.warn(
          `WARN height ${key}@${vp.w}: expected≈${expectedH} got ${outerH}`,
        )
      }
    }

    for (const c of COMPOSITIONS) {
      const loc = page.locator(`[data-composition-id="${DESKTOP_COMPOSITION_METRICS[c.key].compositionId}"]`).first()
      if ((await loc.count()) === 0) {
        errors.push(`missing mobile canvas ${c.name}@${vp.w}`)
        continue
      }
      await loc.scrollIntoViewIfNeeded()
      await settle(page, c.name === 'security' || c.name === 'qc' ? 1800 : 800)
      await page.screenshot({
        path: join(OUT, `${c.name}-mobile-${vp.w}.png`),
        fullPage: false,
      })
      if (vp.w === 390) {
        const wrap = page.locator(
          `[data-desktop-composition-scale][data-composition-key="${c.key}"]`,
        ).first()
        await wrap.screenshot({ path: join(OUT, `${c.name}-mobile.png`) })
      }
      console.log(`mobile ${c.name}@${vp.w}`)
    }

    await context.close()
  }

  // Comparison sheets: desktop vs mobile vs mathematically scaled desktop
  {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 1000 },
    })
    for (const c of COMPOSITIONS) {
      const desktopPath = join(OUT, `${c.name}-desktop.png`)
      const mobilePath = join(OUT, `${c.name}-mobile.png`)
      if (!existsSync(desktopPath) || !existsSync(mobilePath)) continue

      const m = DESKTOP_COMPOSITION_METRICS[c.key]
      const available = 358
      const scale = computeCompositionScale(m.width, available, 1)
      const scaledW = Math.round(m.width * scale)
      const scaledH = Math.round(m.height * scale)

      const page = await context.newPage()
      const desktopUri = `data:image/png;base64,${readFileSync(desktopPath).toString('base64')}`
      const mobileUri = `data:image/png;base64,${readFileSync(mobilePath).toString('base64')}`
      await page.setContent(`<!doctype html><html><head><style>
        body{margin:0;background:#111;color:#eee;font:13px/1.4 system-ui;padding:20px}
        h1{margin:0 0 12px;font-size:16px}
        .row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px}
        .panel{background:#1a1a1a;border-radius:10px;padding:10px}
        .panel h2{margin:0 0 8px;font-size:12px;color:#aaa}
        .scaled{width:${scaledW}px;height:${scaledH}px;overflow:hidden;background:#222}
        .scaled img{width:${scaledW}px;height:${scaledH}px;object-fit:fill;display:block}
        .mobile img{max-width:100%;height:auto;display:block;border-radius:6px}
        .desktop img{max-width:100%;height:auto;display:block;border-radius:6px}
        .meta{margin-top:10px;color:#888;font-size:12px}
      </style></head><body>
        <h1>${c.name} — true scale parity (v${COMPOSITION_VERSION})</h1>
        <div class="row">
          <div class="panel desktop"><h2>Desktop capture</h2><img src="${desktopUri}"/></div>
          <div class="panel"><h2>Desktop resized × ${scale.toFixed(4)} → ${scaledW}×${scaledH}</h2>
            <div class="scaled"><img src="${desktopUri}"/></div>
          </div>
          <div class="panel mobile"><h2>Mobile scaled canvas</h2><img src="${mobileUri}"/></div>
        </div>
        <p class="meta">base ${m.width}×${m.height} · available ${available} · scale ${scale}</p>
      </body></html>`)
      await settle(page, 400)
      await page.screenshot({
        path: join(OUT, `${c.name}-diff.png`),
        fullPage: true,
      })
      // also write a copy named desktop-scaled for the required naming
      copyFileSync(join(OUT, `${c.name}-diff.png`), join(OUT, `${c.name}-desktop-scaled-sheet.png`))
      await page.close()
      console.log('diff', c.name)
    }
    await context.close()
  }

  await browser.close()

  // Full scroll recording
  {
    const browser2 = await chromium.launch({ headless: true })
    const context = await browser2.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      recordVideo: { dir: OUT, size: { width: 390, height: 844 } },
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 800)
    const height = await page.evaluate(
      `(() => document.documentElement.scrollHeight)()`,
    )
    for (let y = 0; y < height; y += 160) {
      await page.evaluate(
        `((yy) => { window.scrollTo({ top: yy, behavior: 'instant' }); })(${y})`,
      )
      await settle(page, 480)
    }
    await page.evaluate(
      `(() => { window.scrollTo(0, document.body.scrollHeight); })()`,
    )
    await settle(page, 1200)
    const video = page.video()
    await context.close()
    await browser2.close()
    if (!video) throw new Error('no video')
    const webm = await video.path()
    const destWebm = join(OUT, 'full-scroll-390x844.webm')
    const destMp4 = join(OUT, 'full-scroll-390x844.mp4')
    copyFileSync(webm, destWebm)
    if (!tryConvertToMp4(destWebm, destMp4)) {
      throw new Error('MP4 export failed — required deliverable')
    }
    console.log('video', destMp4)
  }

  writeFileSync(join(OUT, 'scale-report.json'), JSON.stringify(report, null, 2))

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
