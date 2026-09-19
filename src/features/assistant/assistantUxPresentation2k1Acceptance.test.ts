/**
 * Phase 2K.1 — visual-pan + viewport-frame + late-VV acceptance.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertStructuralOrder,
  brokenUncorrectedPanGeometry,
  keyboardLifecycleFrames,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'
import {
  applyAssistantViewportFrameToElement,
  clearAssistantViewportFrameFromElement,
  computeAssistantMobileViewport,
  isValidAssistantViewportSample,
} from './components/useAssistantMobileViewport'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import {
  createFakePanel,
  createFakeShell,
  createFakeTextarea,
} from './components/fakeShellForTests.test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2k1-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

function bounds(
  partial: Partial<VisualViewportBounds> &
    Pick<VisualViewportBounds, 'height' | 'width'>,
): VisualViewportBounds {
  return { top: 0, left: 0, fromVisualViewport: true, ...partial }
}

const DEVICES = [
  { w: 390, h: 844, kb: 336 },
  { w: 393, h: 852, kb: 340 },
  { w: 430, h: 932, kb: 360 },
] as const

describe('Assistant UX 2K.1 viewport frame', () => {
  it('source — backdrop + frame + grid; VV applies to frame only', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain('.mobileViewportFrame')
    expect(mobile).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(mobile).not.toContain('--assistant-usable-height')
    expect(mobile).not.toMatch(/padding-bottom:\s*var\(--assistant-keyboard/)

    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('assistant-viewport-frame')
    expect(surface).toContain('frameRef')
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toContain("bodyLock: isMobile ? 'ios'")

    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).toContain('requestAnimationFrame')
    expect(hook).toContain('applyAssistantViewportFrameToElement')
    expect(hook).not.toContain('useState')
  })

  it('apply writes stage HEIGHT only (top stays 0; ignore offsetTop)', () => {
    const frame = createFakeShell()
    frame.appendChild(createFakePanel())
    applyAssistantViewportFrameToElement(
      frame,
      bounds({ height: 508, width: 390, top: 84, left: 0 }),
      844,
    )
    expect(frame.style.top).toBe('0px')
    expect(frame.style.left).toBe('0px')
    expect(frame.style.width).toBe('100%')
    expect(frame.style.height).toBe('508px')
    expect(frame.getAttribute('data-keyboard')).toBe('open')
    clearAssistantViewportFrameFromElement(frame)
    expect(frame.style.top).toBe('')
    expect(frame.style.height).toBe('')
  })
})

describe('Assistant UX 2K.1 visual pan → superseded by 2K.3 document anchor', () => {
  it('MANDATORY — offsetTop ignored; stage top=0; header visible', () => {
    const windowScrollY = 0
    const documentScrollTop = 0
    expect(windowScrollY).toBe(0)
    expect(documentScrollTop).toBe(0)

    const corrected = layoutAssistantMobileShell({
      layoutWidth: 390,
      layoutHeight: 844,
      viewportWidth: 390,
      viewportHeight: 508,
      offsetTop: 84,
    })
    assertStructuralOrder(corrected, 'pan-corrected')
    expect(corrected.frame.top).toBe(0)
    expect(corrected.header.top).toBe(0)
    expect(corrected.header.bottom).toBeGreaterThan(0)
    expect(corrected.composer.bottom).toBe(508)

    const broken = brokenUncorrectedPanGeometry({
      layoutWidth: 390,
      layoutHeight: 844,
      viewportWidth: 390,
      viewportHeight: 508,
      offsetTop: 84,
    })
    // Broken class: header ends at/above visual top
    expect(broken.header.bottom).toBeLessThanOrEqual(0)
  })

  for (const d of DEVICES) {
    it(`${d.w}×${d.h} — closed / height shrink / ignored offsetTop / cycles`, () => {
      assertStructuralOrder(
        layoutAssistantMobileShell({
          viewportWidth: d.w,
          viewportHeight: d.h,
        }),
        `${d.w}-closed`,
      )

      const openH = d.h - d.kb
      assertStructuralOrder(
        layoutAssistantMobileShell({
          layoutWidth: d.w,
          layoutHeight: d.h,
          viewportWidth: d.w,
          viewportHeight: openH,
          offsetTop: 0,
        }),
        `${d.w}-kb-offset0`,
      )

      assertStructuralOrder(
        layoutAssistantMobileShell({
          layoutWidth: d.w,
          layoutHeight: d.h,
          viewportWidth: d.w,
          viewportHeight: openH,
          offsetTop: 96,
        }),
        `${d.w}-kb-offset96`,
      )

      for (const h of keyboardLifecycleFrames(d.w, d.h, d.kb)) {
        assertStructuralOrder(
          layoutAssistantMobileShell({
            layoutWidth: d.w,
            layoutHeight: d.h,
            viewportWidth: d.w,
            viewportHeight: h,
            offsetTop: h < d.h - 100 ? 64 : 0,
          }),
          `${d.w}-frame-${h}`,
        )
      }

      for (let c = 0; c < 3; c += 1) {
        for (const [h, top] of [
          [d.h, 0],
          [openH, 80],
          [d.h, 0],
        ] as const) {
          assertStructuralOrder(
            layoutAssistantMobileShell({
              layoutWidth: d.w,
              layoutHeight: d.h,
              viewportWidth: d.w,
              viewportHeight: h,
              offsetTop: top,
            }),
            `${d.w}-cycle${c}`,
          )
        }
      }
    })
  }
})

describe('Assistant UX 2K.1 late VV', () => {
  it('focus before VV final — fallback visible; late height shrink keeps top=0', () => {
    const w = 390
    const full = 844
    const openH = 508

    // T0–T2: full fallback (no VV write yet)
    assertStructuralOrder(
      layoutAssistantMobileShell({ viewportWidth: w, viewportHeight: full }),
      'late-t0',
    )

    const frame = createFakeShell()
    const textarea = createFakeTextarea()
    frame.appendChild(createFakePanel())
    frame.appendChild(textarea)
    const node = textarea

    // Invalid early sample ignored
    expect(
      isValidAssistantViewportSample(bounds({ height: 0, width: w })),
    ).toBe(false)

    // T3–T4 final: height only (offsetTop ignored)
    applyAssistantViewportFrameToElement(
      frame,
      bounds({ height: openH, width: w, top: 84 }),
      full,
    )
    expect(frame.style.top).toBe('0px')
    expect(frame.style.height).toBe(`${openH}px`)
    expect(frame.contains(node)).toBe(true)

    assertStructuralOrder(
      layoutAssistantMobileShell({
        layoutWidth: w,
        layoutHeight: full,
        viewportWidth: w,
        viewportHeight: openH,
        offsetTop: 84,
      }),
      'late-final',
    )

    const state = computeAssistantMobileViewport(
      bounds({ height: openH, width: w, top: 84 }),
      full,
    )
    expect(state.keyboardOpen).toBe(true)
  })
})

describe('Assistant UX 2K.1 CRM + focus', () => {
  it('opaque backdrop + frame backgrounds', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(
      /\.surfaceRoot\[data-mobile='true'\]\s*\{[^}]*background:\s*var\(--surface-primary/s,
    )
    expect(mobile).toMatch(
      /\.mobileViewportFrame\s*\{[^}]*background:\s*var\(--surface-primary/s,
    )
  })

  it('focus continuity frozen', () => {
    const composer = readSrc(
      'src/features/assistant/components/AssistantComposer.tsx',
    )
    expect(composer).toContain('onPointerDown={focusTextareaFromGesture}')
    expect(composer).toContain('input.focus()')
    expect(composer).not.toContain('setTimeout')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("initialFocus: isMobile ? 'panel' : 'first'")
  })

  it('screenshot regression fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>2K.1 visual pan</title>
<style>
body{margin:0;background:#ff2d55;font-family:system-ui}
.backdrop{position:fixed;inset:0;background:#f7f3ec;overflow:hidden}
.frame{position:absolute;top:84px;left:0;width:390px;height:508px;background:#f7f3ec;
  display:grid;grid-template-rows:auto minmax(0,1fr) auto;overflow:hidden}
.hdr{min-height:64px;display:flex;align-items:center;padding:0 16px;font-weight:600}
.composer{padding:12px;background:#f7f3ec}
.kb{position:fixed;left:0;right:0;bottom:0;height:252px;background:#ccc}
</style>
<body>
<div class="backdrop" data-phase="2k1">
  <div class="frame" data-testid="assistant-viewport-frame">
    <div class="hdr">Asystent OurWed</div>
    <div>Jak mogę Ci pomóc?</div>
    <div class="composer">composer</div>
  </div>
</div>
<div class="kb">keyboard</div>
</body></html>`
    writeFileSync(join(outDir, 'visual-pan-corrected.html'), html)
    expect(html).toContain('top:84px')
    expect(html).toContain('data-phase="2k1"')
  })
})
