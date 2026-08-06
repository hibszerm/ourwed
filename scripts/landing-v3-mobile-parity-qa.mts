/**
 * Landing V3 mobile visual parity QA — screenshots + video recordings.
 *
 * Requires a running Vite/preview server.
 *
 *   LV3_BASE_URL=http://127.0.0.1:5173/landing-v3 npx tsx scripts/landing-v3-mobile-parity-qa.mts
 *
 * Outputs under docs/landing-v3-parity/
 */
import { mkdirSync, existsSync, copyFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
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
const OUT = join(ROOT, 'docs/landing-v3-parity')
const MOBILE = join(OUT, 'mobile')
const DESKTOP = join(OUT, 'desktop')
const VIDEO = join(OUT, 'video')
const COMPARISON = join(OUT, 'comparison')
const BASE = process.env.LV3_BASE_URL ?? 'http://127.0.0.1:5173/landing-v3'

for (const dir of [MOBILE, DESKTOP, VIDEO, COMPARISON]) {
  mkdirSync(dir, { recursive: true })
}

const ARTBOARDS = [
  { name: 'import', sel: '[data-mobile-artboard="import"]' },
  { name: 'assignment', sel: '[data-mobile-artboard="assignment"]' },
  { name: 'qc', sel: '[data-mobile-artboard="qc"]' },
  { name: 'finance', sel: '[data-mobile-artboard="finance"]' },
  { name: 'wedding-day', sel: '[data-mobile-artboard="wedding-day"]' },
  { name: 'phones', sel: '[data-testid="lv3-mobile-wedding-day"]' },
  { name: 'security', sel: '[data-testid="lv3-security-section"]' },
  { name: 'calendar', sel: '[data-mobile-artboard="calendar"]' },
  { name: 'brief', sel: '[data-mobile-artboard="brief"]' },
  { name: 'sessions', sel: '[data-mobile-artboard="sessions"]' },
  { name: 'pricing', sel: '[data-mobile-artboard="pricing"]' },
] as const

async function settle(page: Page, ms = 400) {
  await page.waitForTimeout(ms)
}

async function measureArtboards(page: Page) {
  return page.evaluate(`(() => {
    const vw = document.documentElement.clientWidth;
    const artboards = [...document.querySelectorAll('[data-mobile-artboard]')].map((el) => {
      const b = el.getBoundingClientRect();
      const dominant =
        el.querySelector('[data-dominant="true"]') ||
        el.querySelector('[data-surface="contract"]') ||
        el;
      const d = dominant.getBoundingClientRect();
      return {
        type: el.getAttribute('data-mobile-artboard'),
        w: Math.round(b.width),
        h: Math.round(b.height),
        dominantW: Math.round(d.width),
        dominantPct: Math.round((d.width / Math.max(b.width, 1)) * 100),
        okWidth: b.width >= 310 && b.width <= vw,
      };
    });
    return {
      vw,
      scrollEqual:
        document.documentElement.scrollWidth ===
        document.documentElement.clientWidth,
      artboards,
    };
  })()`)
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
  if (ffmpeg.status !== 0) {
    console.warn(String(ffmpeg.stderr ?? ffmpeg.stdout ?? 'ffmpeg failed'))
  }
  return ffmpeg.status === 0 && existsSync(mp4Path)
}

async function recordScroll(
  name: string,
  scrollFn: (page: Page) => Promise<void>,
) {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    recordVideo: {
      dir: VIDEO,
      size: { width: 390, height: 844 },
    },
  })
  const page = await context.newPage()
  await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
  await page.waitForSelector('[data-landing-v3-rebuild="classic-lock-day"]', {
    timeout: 20000,
  })
  await settle(page, 800)
  await scrollFn(page)
  await settle(page, 600)
  const video = page.video()
  await context.close()
  await browser.close()
  if (!video) throw new Error(`no video for ${name}`)
  const webm = await video.path()
  const destWebm = join(VIDEO, `${name}.webm`)
  const destMp4 = join(VIDEO, `${name}.mp4`)
  copyFileSync(webm, destWebm)
  const ok = tryConvertToMp4(destWebm, destMp4)
  if (!ok) {
    throw new Error(`MP4 export failed for ${name} — required deliverable`)
  }
  console.log(`video mp4 ${name}`)
  return { webm: destWebm, mp4: destMp4 }
}

async function main() {
  const errors: string[] = []
  const browser = await chromium.launch({ headless: true })

  // Desktop baselines
  for (const vp of [
    { w: 1440, h: 1000, name: 'baseline-1440x1000' },
    { w: 1280, h: 900, name: 'baseline-1280x900' },
  ]) {
    const context = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 700)
    const mode = await page.evaluate(() =>
      document.querySelector('[data-viewport-mode]')?.getAttribute('data-viewport-mode'),
    )
    const artboards = await page.evaluate(
      () => document.querySelectorAll('[data-mobile-artboard]').length,
    )
    if (mode !== 'desktop') errors.push(`desktop mode expected at ${vp.w}, got ${mode}`)
    if (artboards !== 0) errors.push(`desktop must unmount mobile artboards at ${vp.w}`)
    await page.screenshot({
      path: join(DESKTOP, `${vp.name}.png`),
      fullPage: false,
    })
    console.log('desktop', vp.name)
    await context.close()
  }

  // Mobile static artboard screenshots + measurements
  {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    })
    const page = await context.newPage()
    await page.goto(BASE, { waitUntil: 'networkidle', timeout: 90000 })
    await settle(page, 900)

    const metrics = await measureArtboards(page)
    console.log('metrics', JSON.stringify(metrics, null, 2))
    if (!metrics.scrollEqual) errors.push('horizontal overflow at 390')
    for (const a of metrics.artboards) {
      if (!a.okWidth) errors.push(`${a.type} width ${a.w} below gate`)
      if (a.dominantPct < 72 && a.type !== 'pricing') {
        console.warn(`WARN dominant pct ${a.type}: ${a.dominantPct}%`)
      }
    }

    await page.screenshot({
      path: join(MOBILE, 'hero-390x844.png'),
      fullPage: false,
    })

    for (const shot of ARTBOARDS) {
      const loc = page.locator(shot.sel).first()
      if ((await loc.count()) === 0) {
        errors.push(`missing ${shot.name}`)
        continue
      }
      await loc.scrollIntoViewIfNeeded()
      await settle(page, shot.name === 'phones' || shot.name === 'security' || shot.name === 'qc' ? 2200 : 900)
      await page.screenshot({
        path: join(MOBILE, `artboard-${shot.name}-390x844.png`),
        fullPage: false,
      })
      console.log('shot', shot.name)
    }

    // Typography sample on import result title
    const typo = await page.evaluate(`(() => {
      const title = document.querySelector('[data-mobile-artboard="import"] h3');
      const label = document.querySelector('[data-mobile-artboard="import"] [class*="importStepLabel"]');
      const qcVal = document.querySelector('[data-mobile-artboard="qc"] [class*="qcValue"]');
      return {
        title: title ? parseFloat(getComputedStyle(title).fontSize) : 0,
        label: label ? parseFloat(getComputedStyle(label).fontSize) : 0,
        qcValue: qcVal ? parseFloat(getComputedStyle(qcVal).fontSize) : 0,
      };
    })()`)
    console.log('typography', typo)
    if (typo.title < 14) errors.push(`import title ${typo.title}px < 14`)
    if (typo.label < 10) errors.push(`import step label ${typo.label}px < 10`)
    if (typo.qcValue < 14) errors.push(`qc value ${typo.qcValue}px < 14`)

    // Side-by-side comparison sheets (desktop crop + mobile artboard)
    const pairs = [
      'import',
      'assignment',
      'qc',
      'finance',
      'wedding-day',
      'security',
      'calendar',
      'brief',
      'sessions',
    ] as const
    for (const name of pairs) {
      const mobilePath = join(MOBILE, `artboard-${name}-390x844.png`)
      const desktopPath = join(DESKTOP, 'baseline-1440x1000.png')
      if (!existsSync(mobilePath) || !existsSync(desktopPath)) continue
      const sheet = await context.newPage()
      await sheet.setViewportSize({ width: 1200, height: 900 })
      const mobileUri = `data:image/png;base64,${readFileSync(mobilePath).toString('base64')}`
      const desktopUri = `data:image/png;base64,${readFileSync(desktopPath).toString('base64')}`
      await sheet.setContent(`<!doctype html><html><head><style>
        body{margin:0;background:#111;color:#eee;font:14px/1.4 system-ui;padding:24px}
        h1{margin:0 0 16px;font-size:18px}
        .row{display:grid;grid-template-columns:1fr 390px;gap:24px;align-items:start}
        .panel{background:#1c1c1c;border-radius:12px;padding:12px}
        .panel h2{margin:0 0 8px;font-size:13px;font-weight:600;color:#aaa}
        img{width:100%;height:auto;border-radius:8px;display:block;background:#222}
        .mobile img{width:390px}
      </style></head><body>
        <h1>Landing V3 parity — ${name}</h1>
        <div class="row">
          <div class="panel"><h2>Desktop 1440×1000 (page crop)</h2><img src="${desktopUri}"/></div>
          <div class="panel mobile"><h2>Mobile artboard 390×844</h2><img src="${mobileUri}"/></div>
        </div>
      </body></html>`)
      await settle(sheet, 400)
      await sheet.screenshot({
        path: join(COMPARISON, `compare-${name}.png`),
        fullPage: true,
      })
      await sheet.close()
      console.log('compare', name)
    }

    await context.close()
  }

  await browser.close()

  // Full slow scroll recording
  await recordScroll('full-scroll-390x844', async (page) => {
    const height = await page.evaluate(
      `(() => document.documentElement.scrollHeight)()`,
    )
    for (let y = 0; y < height; y += 180) {
      await page.evaluate(`((yy) => { window.scrollTo({ top: yy, behavior: 'instant' }); })(${y})`)
      await settle(page, 520)
    }
    await page.evaluate(
      `(() => { window.scrollTo(0, document.body.scrollHeight); })()`,
    )
    await settle(page, 1200)
  })

  // Isolated recordings
  const isolates: Array<{ name: string; sel: string; wait: number }> = [
    { name: 'isolate-qc', sel: '[data-mobile-artboard="qc"]', wait: 2200 },
    { name: 'isolate-wedding-day', sel: '[data-mobile-artboard="wedding-day"]', wait: 2400 },
    { name: 'isolate-phones', sel: '[data-testid="lv3-mobile-wedding-day"]', wait: 7200 },
    { name: 'isolate-security', sel: '[data-testid="lv3-security-section"]', wait: 2200 },
  ]

  for (const iso of isolates) {
    await recordScroll(iso.name, async (page) => {
      await page.locator(iso.sel).first().scrollIntoViewIfNeeded()
      await settle(page, iso.wait)
    })
  }

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
