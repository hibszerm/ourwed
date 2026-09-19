/**
 * Phase 2J — mobile VisualViewport controller + shell geometry acceptance.
 * Updated for 2J.1 imperative apply path (cssVars helper removed).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASSISTANT_KEYBOARD_THRESHOLD_PX,
  applyAssistantMobileViewportToElement,
  computeAssistantMobileViewport,
} from './components/useAssistantMobileViewport'
import { __resetBodyScrollLockForTests } from '@/components/ui/bodyScrollLock'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import { createFakeShell } from './components/fakeShellForTests.test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2j-visual')

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

describe('Assistant UX 2J mobile viewport', () => {
  afterEach(() => {
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('MOBILE TEST 1 — keyboard closed: full available viewport', () => {
    const state = computeAssistantMobileViewport(
      bounds({ height: 844, width: 390 }),
      844,
    )
    expect(state.keyboardOpen).toBe(false)
    expect(state.viewportHeight).toBe(844)
    expect(state.keyboardHeight).toBe(0)
    const el = createFakeShell()
    applyAssistantMobileViewportToElement(el, state)
    expect(el.style.height).toBe('844px')
    expect(el.style.top).toBe('0px')
    expect(el.getAttribute('data-keyboard')).toBe('closed')
  })

  it('MOBILE TEST 2 — visualViewport shrinks: stage usable height updates', () => {
    const closed = computeAssistantMobileViewport(
      bounds({ height: 844, width: 390 }),
      844,
    )
    const open = computeAssistantMobileViewport(
      bounds({ height: 480, width: 390, top: 0 }),
      844,
    )
    expect(open.viewportHeight).toBe(480)
    expect(open.viewportHeight).toBeLessThan(closed.viewportHeight)
    const el = createFakeShell()
    applyAssistantMobileViewportToElement(el, open)
    expect(el.style.height).toBe('480px')
    expect(el.style.top).toBe('0px')
    expect(el.getAttribute('data-keyboard')).toBe('open')
  })

  it('MOBILE TEST 3 — keyboardOpen only after meaningful shrink threshold', () => {
    const tiny = computeAssistantMobileViewport(
      bounds({
        height: 844 - (ASSISTANT_KEYBOARD_THRESHOLD_PX - 1),
        width: 390,
      }),
      844,
    )
    expect(tiny.keyboardOpen).toBe(false)
    const real = computeAssistantMobileViewport(
      bounds({ height: 844 - ASSISTANT_KEYBOARD_THRESHOLD_PX, width: 390 }),
      844,
    )
    expect(real.keyboardOpen).toBe(true)
    expect(real.keyboardHeight).toBeGreaterThanOrEqual(
      ASSISTANT_KEYBOARD_THRESHOLD_PX,
    )
  })

  it('MOBILE TEST 4–5 — composer + transcript use remaining visual height', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(css).not.toContain('--assistant-usable-height')
    expect(css).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(css).toContain('overscroll-behavior: contain')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('useAssistantMobileViewport')
    expect(surface).toContain('scrollElementToBottom')
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain("setAttribute('data-keyboard'")
    expect(hook).toContain('applyAssistantStageViewportToElement')
  })

  it('MOBILE TEST 6 — no document/body scroll command in assistant scroll', () => {
    const scroll = readSrc(
      'src/features/assistant/components/assistantScroll.ts',
    )
    expect(scroll).not.toContain('window.scrollTo')
    expect(scroll).not.toContain('document.body')
    expect(scroll).toContain('el.scrollTop')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).not.toContain('window.scrollTo')
    expect(surface).not.toContain('document.documentElement.scroll')
  })

  it('MOBILE TEST 7 — closing keyboard restores geometry', () => {
    const open = computeAssistantMobileViewport(
      bounds({ height: 480, width: 390 }),
      844,
    )
    expect(open.keyboardOpen).toBe(true)
    const closed = computeAssistantMobileViewport(
      bounds({ height: 844, width: 390 }),
      844,
    )
    expect(closed.keyboardOpen).toBe(false)
    expect(closed.viewportHeight).toBe(844)
    expect(closed.keyboardHeight).toBe(0)
  })

  it('MOBILE TEST 8 — cleanup removes listeners (subscribe API)', () => {
    const vv = readSrc('src/components/ui/visualViewportBounds.ts')
    expect(vv).toContain('removeEventListener')
    expect(vv).toContain('return () =>')
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).toContain('applyAssistantViewportFrameToElement')
  })

  it('MOBILE TEST 9 — desktop geometry remains exactly Phase 2H', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
    expect(css).toContain('max-height: min(700px, calc(100dvh - 64px))')
    const desktopPanel = css.slice(
      css.indexOf('.panel {'),
      css.indexOf('@media (max-width: 767px)'),
    )
    expect(desktopPanel).toContain('min(780px, calc(100vw - 48px))')
    expect(desktopPanel).toContain('min(700px, calc(100dvh - 64px))')
    expect(desktopPanel).not.toContain('--assistant-usable-height')
    expect(desktopPanel).not.toContain('--assistant-keyboard-height')
  })

  it('MOBILE TEST 10 — mobile editable font-size >= 16px', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/\.composerInput\s*\{[^}]*font-size:\s*1rem/s)
  })

  it('MOBILE TEST 11 — multiline composer bounded; shell uses VV height', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('COMPOSER_TEXTAREA_MAX_PX')
    expect(surface).toMatch(/COMPOSER_TEXTAREA_MAX_PX\s*=\s*114/)
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('max-height: 120px')
    expect(css).not.toContain('var(--assistant-usable-height')
  })

  it('MOBILE — iOS body lock + no autofocus keyboard on open', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("initialFocus: isMobile ? 'panel' : 'first'")
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).toContain('blurActiveElement')
    expect(surface).toContain('data-phase="k31-correctness-followup"')
  })

  it('MOBILE — visual fixtures for 390 / 393 / 430', () => {
    mkdirSync(outDir, { recursive: true })
    const devices = [
      { w: 390, h: 844, kb: 336 },
      { w: 393, h: 852, kb: 340 },
      { w: 430, h: 932, kb: 360 },
    ] as const

    const measurements: Array<Record<string, unknown>> = []

    for (const d of devices) {
      const closed = computeAssistantMobileViewport(
        bounds({ height: d.h, width: d.w }),
        d.h,
      )
      const open = computeAssistantMobileViewport(
        bounds({ height: d.h - d.kb, width: d.w, top: 0 }),
        d.h,
      )
      measurements.push({
        device: `${d.w}x${d.h}`,
        closed: {
          shellHeight: closed.viewportHeight,
          shellTop: closed.viewportOffsetTop,
          keyboardOpen: closed.keyboardOpen,
          composerInside: true,
        },
        keyboard: {
          shellHeight: open.viewportHeight,
          shellTop: open.viewportOffsetTop,
          keyboardOpen: open.keyboardOpen,
          keyboardHeight: open.keyboardHeight,
          composerInside: open.viewportHeight > 64 + 54,
          note: 'Simulated VisualViewport reduction — no real iOS software keyboard',
        },
      })
    }

    writeFileSync(
      join(outDir, 'measurements.json'),
      JSON.stringify(
        {
          phase: '2j1',
          limitation:
            'No real iOS software keyboard; VisualViewport reduction simulated.',
          measurements,
        },
        null,
        2,
      ),
    )

    expect(measurements).toHaveLength(3)
  })
})
