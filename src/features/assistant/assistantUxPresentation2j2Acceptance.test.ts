/**
 * Phase 2J.2 — P0 visibility (preserved under Phase 2K shell rebuild).
 *
 * Invariant: open=true ⇒ CSS alone guarantees a visible full-screen Assistant.
 * VisualViewport is NOT required for visibility or layout.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyAssistantStageViewportToElement,
  clearAssistantMobileViewportFromElement,
  computeAssistantMobileViewport,
  isValidAssistantViewportSample,
} from './components/useAssistantMobileViewport'
import { __resetBodyScrollLockForTests } from '@/components/ui/bodyScrollLock'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import {
  createFakePanel,
  createFakeShell,
  createFakeTextarea,
} from './components/fakeShellForTests.test'
import {
  assertStructuralOrder,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2j2-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

function bounds(
  partial: Partial<VisualViewportBounds> &
    Pick<VisualViewportBounds, 'height' | 'width'>,
): VisualViewportBounds {
  return {
    top: 0,
    left: 0,
    fromVisualViewport: true,
    ...partial,
  }
}

describe('Assistant UX 2J.2 P0 visibility', () => {
  afterEach(() => {
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('P0 — CSS alone renders initial Assistant (no VV required)', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain(".surfaceRoot[data-mobile='true']")
    expect(mobile).toContain('inset: 0')
    expect(mobile).not.toContain('--assistant-usable-height')
    expect(mobile).not.toContain('--assistant-keyboard-height')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).not.toContain('mobileViewportStyle')
  })

  it('P0 — apply sets height only; top stays 0 (never hides shell)', () => {
    const el = createFakeShell()
    el.appendChild(createFakePanel())
    applyAssistantStageViewportToElement(
      el,
      computeAssistantMobileViewport(
        bounds({ height: 508, width: 390, top: 120 }),
        844,
      ),
    )
    expect(el.style.top).toBe('0px')
    expect(el.style.height).toBe('508px')
    expect(el.style.getPropertyValue('--assistant-keyboard-height')).toBe('')
    expect(el.style.getPropertyValue('--assistant-vv-top')).toBe('')
  })

  it('P0 — invalid/zero VV samples are rejected', () => {
    expect(isValidAssistantViewportSample(bounds({ height: 0, width: 0 }))).toBe(
      false,
    )
    expect(
      isValidAssistantViewportSample(bounds({ height: 50, width: 390 })),
    ).toBe(false)
    expect(
      isValidAssistantViewportSample(bounds({ height: 844, width: 390 })),
    ).toBe(true)
  })

  it('P0 — delayed/missing VV leaves shell CSS-visible', () => {
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).not.toMatch(/el\.style\.(top|left|width|height)\s*=/)
    assertStructuralOrder(
      layoutAssistantMobileShell({ viewportWidth: 390, viewportHeight: 844 }),
      'p0-no-vv',
    )
  })

  it('P0 — body lock independent of shell geometry (overflow, not ios fixed)', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toContain("bodyLock: isMobile ? 'ios'")
  })

  it('P0 fixture — open before any VV update', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html><body>
<div style="position:fixed;inset:0;background:#f7f3ec;display:grid;grid-template-rows:auto minmax(0,1fr) auto" data-phase="2k1" data-vv="none">
<div>Asystent</div><div>Jak mogę Ci pomóc?</div><div>composer</div>
</div></body></html>`
    writeFileSync(join(outDir, 'p0-open-before-vv.html'), html)
    expect(html).toContain('data-vv="none"')
  })
})

describe('Assistant UX 2J.2 keyboard lifecycle', () => {
  afterEach(() => {
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('opening sequence — frame tracks VV height; structure ordered', () => {
    const el = createFakeShell()
    const textarea = createFakeTextarea()
    el.appendChild(createFakePanel())
    el.appendChild(textarea)
    for (const h of [844, 790, 700, 620, 560, 508]) {
      applyAssistantStageViewportToElement(
        el,
        computeAssistantMobileViewport(bounds({ height: h, width: 390 }), 844),
      )
      expect(el.style.height).toBe(`${h}px`)
      expect(el.contains(textarea)).toBe(true)
      assertStructuralOrder(
        layoutAssistantMobileShell({ viewportWidth: 390, viewportHeight: h }),
        `lifecycle-${h}`,
      )
    }
  })

  it('non-zero offsetTop is ignored for stage top (2K.3)', () => {
    const el = createFakeShell()
    applyAssistantStageViewportToElement(
      el,
      computeAssistantMobileViewport(
        bounds({ height: 508, width: 390, top: 64 }),
        844,
      ),
    )
    expect(el.style.top).toBe('0px')
    expect(el.style.height).toBe('508px')
  })

  it('cleanup clears legacy attrs', () => {
    const el = createFakeShell()
    applyAssistantStageViewportToElement(
      el,
      computeAssistantMobileViewport(bounds({ height: 508, width: 390 }), 844),
    )
    clearAssistantMobileViewportFromElement(el)
    expect(el.getAttribute('data-keyboard')).toBeNull()
  })

  it('first-tap focus preserved from 2J.1', () => {
    const composer = readSrc(
      'src/features/assistant/components/AssistantComposer.tsx',
    )
    expect(composer).toContain('onPointerDown={focusTextareaFromGesture}')
    expect(composer).toContain('input.focus()')
    expect(composer).not.toContain('setTimeout')
  })

  it('desktop geometry unchanged', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
  })
})
