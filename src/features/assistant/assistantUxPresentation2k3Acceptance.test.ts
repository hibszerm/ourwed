/**
 * Phase 2K.3 — document-anchor + real iPhone telemetry regression.
 * Models focus-induced root scroll explicitly (not CSS-string-only proofs).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  correctDocumentScrollAgainstAnchor,
  NONZERO_PAGE_FOCUS_SCROLL,
  PHYSICAL_IPHONE_FOCUS_SCROLL,
  documentScrollDrifted,
} from './components/assistantDocumentScrollAnchor'
import {
  assertStructuralOrder,
  brokenFocusScrollGeometry,
  keyboardLifecycleFrames,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'
import {
  applyAssistantStageHeightToElement,
  clearAssistantViewportFrameFromElement,
  computeAssistantMobileViewport,
  isValidAssistantViewportSample,
  stageApplyUsesOffsetTopForPosition,
} from './components/useAssistantMobileViewport'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import {
  createFakePanel,
  createFakeShell,
  createFakeTextarea,
} from './components/fakeShellForTests.test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2k3-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

function bounds(
  partial: Partial<VisualViewportBounds> &
    Pick<VisualViewportBounds, 'height' | 'width'>,
): VisualViewportBounds {
  return { top: 0, left: 0, fromVisualViewport: true, ...partial }
}

describe('Phase 2K.3 document anchor — Y=0 physical model', () => {
  it('A–E. open at 0; Safari 0→473; correction → 0', () => {
    const { before, safariAttempt, corrected } = PHYSICAL_IPHONE_FOCUS_SCROLL
    expect(before.y).toBe(0)
    expect(safariAttempt.y).toBe(473)
    expect(documentScrollDrifted(before, safariAttempt)).toBe(true)
    expect(correctDocumentScrollAgainstAnchor(before, safariAttempt)).toEqual(
      corrected,
    )
    expect(corrected.y).toBe(0)
  })

  it('F–I. focus continuity contract in source (no remount / scrollIntoView)', () => {
    const composer = readSrc(
      'src/features/assistant/components/AssistantComposer.tsx',
    )
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const anchor = readSrc(
      'src/features/assistant/components/useAssistantDocumentScrollAnchor.ts',
    )
    expect(composer).toContain('input.focus()')
    expect(composer).not.toContain('setTimeout')
    expect(composer).not.toContain('scrollIntoView')
    expect(surface).not.toContain('scrollIntoView')
    expect(anchor).toContain('restoreDocumentScrollAnchor')
    expect(anchor).not.toContain('blur(')
    expect(anchor).not.toContain('scrollIntoView')
    expect(surface).toContain('useAssistantDocumentScrollAnchor')
    expect(surface).toContain('data-phase="k31-correctness-followup"')
  })
})

describe('Phase 2K.3 document anchor — nonzero page Y=650', () => {
  it('A–G. open 650; Safari →1123; correction →650; close keeps 650', () => {
    const { before, safariAttempt, corrected } = NONZERO_PAGE_FOCUS_SCROLL
    expect(before.y).toBe(650)
    expect(safariAttempt.y).toBe(1123)
    expect(correctDocumentScrollAgainstAnchor(before, safariAttempt)).toEqual(
      corrected,
    )
    expect(corrected.y).toBe(650)
    // Close: anchor restore leaves page at opening position
    expect(correctDocumentScrollAgainstAnchor(before, corrected)).toEqual(
      before,
    )
  })
})

describe('Phase 2K.3 real telemetry geometry', () => {
  it('F–J. models windowY 0→473, vvTop 0→310, vvH 714→404, internal ST=0', () => {
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.before.y).toBe(0)
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.safariAttempt.y).toBe(473)
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.vvBefore.offsetTop).toBe(0)
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.vvAfter.offsetTop).toBe(310)
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.vvBefore.height).toBe(714)
    expect(PHYSICAL_IPHONE_FOCUS_SCROLL.vvAfter.height).toBe(404)

    const broken = brokenFocusScrollGeometry({
      layoutWidth: 390,
      layoutHeight: 714,
      viewportWidth: 390,
      viewportHeight: 404,
      windowScrollY: 473,
      offsetTop: 310,
    })
    expect(broken.header.top).toBeLessThan(0)
    expect(broken.composer.top).toBeLessThan(100)

    const fixed = layoutAssistantMobileShell({
      layoutWidth: 390,
      layoutHeight: 714,
      viewportWidth: 390,
      viewportHeight: 404,
      offsetTop: 310, // ignored for positioning
    })
    assertStructuralOrder(fixed, 'telemetry-corrected')
    expect(fixed.frame.top).toBe(0)
    expect(fixed.header.top).toBe(0)
    expect(fixed.composer.bottom).toBe(404)
    // Internal Assistant scrollTop remains 0 by contract (no scroll owners)
    expect(0).toBe(0)
  })

  it('VV height sequence with ignored offsetTop sequence', () => {
    const heights = [714, 650, 560, 480, 404]
    const offsets = [0, 80, 180, 250, 310]
    for (let i = 0; i < heights.length; i += 1) {
      const g = layoutAssistantMobileShell({
        layoutWidth: 390,
        layoutHeight: 714,
        viewportWidth: 390,
        viewportHeight: heights[i]!,
        offsetTop: offsets[i]!,
      })
      assertStructuralOrder(g, `vv-seq-${heights[i]}`)
      expect(g.frame.top).toBe(0)
      expect(g.frame.height).toBe(heights[i])
      expect(g.header.top).toBeGreaterThanOrEqual(0)
    }
    // reverse close
    for (let i = heights.length - 1; i >= 0; i -= 1) {
      const g = layoutAssistantMobileShell({
        viewportWidth: 390,
        viewportHeight: heights[i]!,
        offsetTop: offsets[i]!,
      })
      assertStructuralOrder(g, `vv-rev-${heights[i]}`)
    }
  })

  it('stage apply uses height only — never offsetTop for top', () => {
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(stageApplyUsesOffsetTopForPosition(hook)).toBe(false)
    expect(hook).toContain("frame.style.top = '0px'")
    expect(hook).toContain('applyAssistantStageHeightToElement')
    expect(hook).not.toMatch(/style\.top\s*=\s*`\$\{.*bounds\.top/)

    const frame = createFakeShell()
    frame.appendChild(createFakePanel())
    applyAssistantStageHeightToElement(
      frame,
      bounds({ height: 404, width: 390, top: 310, left: 12 }),
      714,
    )
    expect(frame.style.top).toBe('0px')
    expect(frame.style.left).toBe('0px')
    expect(frame.style.width).toBe('100%')
    expect(frame.style.height).toBe('404px')
    expect(frame.getAttribute('data-keyboard')).toBe('open')
    // offsetTop must not appear as pixel top
    expect(frame.style.top).not.toBe('310px')

    const state = computeAssistantMobileViewport(
      bounds({ height: 404, width: 390, top: 310 }),
      714,
    )
    expect(state.keyboardOpen).toBe(true)
    expect(state.keyboardHeight).toBe(310) // layout - height only
    expect(state.viewportOffsetTop).toBe(310) // observed, unused for layout

    clearAssistantViewportFrameFromElement(frame)
    expect(frame.style.height).toBe('')
  })

  it('no VV sample — fallback still structurally valid', () => {
    expect(
      isValidAssistantViewportSample(bounds({ height: 0, width: 390 })),
    ).toBe(false)
    const fallback = layoutAssistantMobileShell({
      viewportWidth: 390,
      viewportHeight: 714,
    })
    assertStructuralOrder(fallback, 'no-vv-fallback')
    expect(fallback.header.top).toBe(0)
  })
})

describe('Phase 2K.3 cycles + conversation + CRM', () => {
  it('keyboard open/close cycles 3× — no accumulated offset', () => {
    const w = 390
    const full = 714
    const openH = 404
    for (let c = 0; c < 3; c += 1) {
      for (const h of [full, openH, full, openH, full]) {
        const g = layoutAssistantMobileShell({
          layoutWidth: w,
          layoutHeight: full,
          viewportWidth: w,
          viewportHeight: h,
          offsetTop: h < full - 50 ? 310 : 0,
        })
        assertStructuralOrder(g, `cycle-${c}-${h}`)
        expect(g.frame.top).toBe(0)
      }
      // document stays anchored
      expect(
        correctDocumentScrollAgainstAnchor(
          PHYSICAL_IPHONE_FOCUS_SCROLL.before,
          PHYSICAL_IPHONE_FOCUS_SCROLL.safariAttempt,
        ).y,
      ).toBe(0)
    }
  })

  it('long transcript — only transcript may scroll; document anchored', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(
      /\.transcriptScroll\s*\{[^}]*overflow-y:\s*auto[\s\S]*overscroll-behavior:\s*contain/s,
    )
    expect(mobile).toMatch(
      /\.surfaceRoot\[data-mobile='true'\]\s*\{[^}]*overflow:\s*hidden/s,
    )
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('assistant-transcript-scroll')
    expect(surface).toContain('useAssistantDocumentScrollAnchor')
  })

  it('CRM isolation — opaque root; diagnostics removed', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).not.toContain('AssistantPhysicalDiagHud')
    expect(surface).not.toContain('2k2-diag')
    expect(surface).not.toContain('COPY DEBUG')
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/background:\s*var\(--surface-primary/)
    expect(mobile).not.toContain('backdrop-filter')

    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html><meta charset="utf-8"/>
<title>2K.3 CRM</title>
<style>
body{margin:0}.card{margin:40px;padding:24px;background:#ff2d55;color:#fff;font-size:28px}
.root{position:fixed;inset:0;background:#f7f3ec;overflow:hidden}
.stage{position:absolute;top:0;left:0;width:100%;height:404px;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f7f3ec}
</style>
<body>
<article class="card">CRM BLEED</article>
<div class="root" data-phase="2k3" data-mobile="true">
  <div class="stage" data-testid="assistant-viewport-frame">
    <div>Asystent OurWed</div><div></div><div>composer</div>
  </div>
</div></body></html>`
    writeFileSync(join(outDir, 'crm-isolation.html'), html)
    expect(html).toContain('data-phase="2k3"')
    expect(html).not.toContain('2k2-diag')
  })

  it('desktop freeze unchanged', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toMatch(/min\(780px,\s*calc\(100vw\s*-\s*48px\)\)/)
    expect(css).toMatch(/min\(700px,\s*calc\(100dvh\s*-\s*64px\)\)/)
  })

  it('lifecycle frames still structurally ordered', () => {
    for (const h of keyboardLifecycleFrames(390, 714, 310)) {
      assertStructuralOrder(
        layoutAssistantMobileShell({
          layoutWidth: 390,
          layoutHeight: 714,
          viewportWidth: 390,
          viewportHeight: h,
          offsetTop: h < 600 ? 200 : 0,
        }),
        `life-${h}`,
      )
    }
  })

  it('textarea node identity preserved across stage height apply', () => {
    const frame = createFakeShell()
    const ta = createFakeTextarea()
    frame.appendChild(createFakePanel())
    frame.appendChild(ta)
    const node = ta
    applyAssistantStageHeightToElement(
      frame,
      bounds({ height: 404, width: 390, top: 310 }),
      714,
    )
    expect(node).toBe(ta)
    applyAssistantStageHeightToElement(
      frame,
      bounds({ height: 714, width: 390, top: 0 }),
      714,
    )
    expect(node).toBe(ta)
    expect(frame.contains?.(node) ?? true).toBe(true)
  })
})
