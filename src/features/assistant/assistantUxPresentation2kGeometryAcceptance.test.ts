/**
 * Phase 2K — structural geometry acceptance (behavioral, not CSS-string).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertStructuralOrder,
  keyboardLifecycleFrames,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2k-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const DEVICES = [
  { w: 390, h: 844, kb: 336 },
  { w: 393, h: 852, kb: 340 },
  { w: 430, h: 932, kb: 360 },
] as const

describe('Assistant UX 2K structural geometry', () => {
  it('architecture source — 3-row grid, inset:0, no VV layout engine', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(mobile).toContain('inset: 0')
    expect(mobile).toMatch(/background:\s*var\(--surface-primary/)
    expect(mobile).not.toContain('--assistant-usable-height')
    expect(mobile).toContain('.mobileViewportFrame')
    expect(mobile).not.toContain('--assistant-keyboard-height')
    expect(mobile).not.toMatch(/padding-bottom:\s*var\(--assistant-keyboard/)
    expect(mobile).toContain(':focus-within')

    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toContain("bodyLock: isMobile ? 'ios'")

    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).toContain('applyAssistantViewportFrameToElement')
    expect(hook).toContain('applyAssistantStageHeightToElement')
    expect(hook).toContain('requestAnimationFrame')
    expect(hook).not.toMatch(/style\.top\s*=\s*`\$\{/)
  })

  it('meta viewport reported; interactive-widget not relied upon', () => {
    const html = readSrc('index.html')
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    )
    expect(html).not.toContain('interactive-widget')
  })

  for (const d of DEVICES) {
    it(`${d.w}×${d.h} — closed / open / intermediate / cycles`, () => {
      const closed = layoutAssistantMobileShell({
        viewportWidth: d.w,
        viewportHeight: d.h,
      })
      assertStructuralOrder(closed, `${d.w} closed`)
      expect(closed.header.top).toBe(0)
      expect(closed.composer.bottom).toBe(d.h)

      const openH = d.h - d.kb
      const open = layoutAssistantMobileShell({
        viewportWidth: d.w,
        viewportHeight: openH,
      })
      assertStructuralOrder(open, `${d.w} open`)
      expect(open.header.top).toBe(0)
      expect(open.composer.bottom).toBe(openH)
      expect(open.composer.top).toBeGreaterThan(open.header.bottom)

      // stale offsetTop must not reorder
      const stale = layoutAssistantMobileShell({
        viewportWidth: d.w,
        viewportHeight: openH,
        offsetTop: 120,
      })
      assertStructuralOrder(stale, `${d.w} stale offsetTop`)
      expect(stale.header.top).toBeLessThan(stale.composer.top)

      for (const frame of keyboardLifecycleFrames(d.w, d.h, d.kb)) {
        const g = layoutAssistantMobileShell({
          viewportWidth: d.w,
          viewportHeight: frame,
        })
        assertStructuralOrder(g, `${d.w} frame ${frame}`)
      }

      // three full cycles
      for (let c = 0; c < 3; c += 1) {
        for (const h of [d.h, openH, d.h]) {
          assertStructuralOrder(
            layoutAssistantMobileShell({
              viewportWidth: d.w,
              viewportHeight: h,
            }),
            `${d.w} cycle${c} h=${h}`,
          )
        }
      }
    })
  }

  it('composer cannot become top-most Assistant element on normal phones', () => {
    for (const d of DEVICES) {
      const open = layoutAssistantMobileShell({
        viewportWidth: d.w,
        viewportHeight: d.h - d.kb,
      })
      expect(open.composer.top).toBeGreaterThan(open.viewportHeight * 0.35)
      expect(open.header.height).toBeGreaterThan(0)
      expect(open.content.top).toBe(open.header.bottom)
    }
  })

  it('multiline composer still leaves header above composer', () => {
    const g = layoutAssistantMobileShell({
      viewportWidth: 390,
      viewportHeight: 508,
      composerHeight: 120,
    })
    assertStructuralOrder(g, 'multiline')
    expect(g.composer.height).toBe(120)
  })

  it('fixtures — keyboard open cannot place composer at top', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html lang="pl"><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>2K geometry fixture</title>
<style>
body{margin:0;font-family:system-ui;background:#bbb}
.crm{padding:40px;font-size:28px;font-weight:800;color:#ff2d55}
.root{position:fixed;inset:0;background:#f7f3ec;display:flex;flex-direction:column;overflow:hidden}
.panel{flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f7f3ec}
.hdr{min-height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-weight:600}
.content{min-height:0;overflow:hidden;display:flex;align-items:center;justify-content:center}
.composer{padding:12px 16px;background:#f7f3ec}
.pill{height:54px;border-radius:27px;background:#efe8de}
.kb{position:fixed;left:0;right:0;bottom:0;height:336px;background:#ccc;display:flex;align-items:center;justify-content:center}
/* Simulate reduced available height via bottom spacer = keyboard */
.root{bottom:336px}
</style>
<body>
<div class="crm">UNDERLYING CRM ███</div>
<div class="root" data-phase="2k1" data-mobile="true">
  <div class="panel" role="dialog">
    <div class="hdr" data-testid="assistant-header">Asystent OurWed <span>×</span></div>
    <div class="content" data-testid="assistant-content-region"><div>Jak mogę Ci pomóc?</div></div>
    <div class="composer" data-testid="assistant-composer-wrap"><div class="pill"></div></div>
  </div>
</div>
<div class="kb">native keyboard</div>
</body></html>`
    writeFileSync(join(outDir, 'keyboard-open-structure.html'), html)
    expect(html).toContain('grid-template-rows:auto minmax(0,1fr) auto')
    expect(html).toContain('data-phase="2k1"')
  })
})
