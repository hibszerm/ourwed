/**
 * Phase 2J.1 — real iOS mobile interaction stabilization acceptance.
 *
 * Physical iPhone QA remains authoritative; these tests prove architecture
 * invariants that 2J violated (React thrash, remount, delayed focus).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ASSISTANT_KEYBOARD_THRESHOLD_PX,
  applyAssistantMobileViewportToElement,
  clearAssistantMobileViewportFromElement,
  computeAssistantMobileViewport,
} from './components/useAssistantMobileViewport'
import { isScrollNearBottom } from './components/assistantScroll'
import { __resetBodyScrollLockForTests } from '@/components/ui/bodyScrollLock'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import {
  createFakePanel,
  createFakeShell,
  createFakeTextarea,
} from './components/fakeShellForTests.test'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2j1-visual')

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

describe('Assistant UX 2J.1 iOS interaction stabilization', () => {
  afterEach(() => {
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('A — open closed 390×844 geometry', () => {
    const state = computeAssistantMobileViewport(
      bounds({ height: 844, width: 390 }),
      844,
    )
    expect(state.keyboardOpen).toBe(false)
    expect(state.viewportHeight).toBe(844)
    const el = createFakeShell()
    const panel = createFakeShell()
    panel.setAttribute('role', 'dialog')
    el.appendChild(panel)
    applyAssistantMobileViewportToElement(el, state)
    expect(el.style.height).toBe('844px')
    expect(el.style.top).toBe('0px')
    expect(el.getAttribute('data-keyboard')).toBe('closed')
    expect(panel.getAttribute('data-keyboard')).toBe('closed')
  })

  it('B — first-tap strategy is native + sync gesture (no timers)', () => {
    const composer = readSrc(
      'src/features/assistant/components/AssistantComposer.tsx',
    )
    expect(composer).toContain('onPointerDown={focusTextareaFromGesture}')
    expect(composer).toContain('input.focus()')
    expect(composer).not.toContain('setTimeout')
    expect(composer).not.toContain('focus({ preventScroll')
    expect(composer).not.toContain('focusWithoutScroll')
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('pointer-events: none')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    // Mobile must not programmatically open keyboard.
    expect(surface).toMatch(/if \(isMobile\) return/)
  })

  it('C — keyboard opening sequence keeps shell geometry coherent', () => {
    const frames = [844, 790, 700, 620, 560, 508]
    const el = createFakeShell()
    const panel = createFakePanel()
    el.appendChild(panel)
    // Stable "textarea" stand-in identity across frames
    const textarea = createFakeTextarea()
    el.appendChild(textarea)
    const nodeBefore = textarea

    for (const h of frames) {
      const state = computeAssistantMobileViewport(
        bounds({ height: h, width: 390 }),
        844,
      )
      applyAssistantMobileViewportToElement(el, state)
      expect(el.style.height).toBe(`${h}px`)
      expect(el.contains(nodeBefore)).toBe(true)
      expect(el.querySelector('textarea')).toBe(nodeBefore)
      if (h <= 844 - ASSISTANT_KEYBOARD_THRESHOLD_PX) {
        expect(el.getAttribute('data-keyboard')).toBe('open')
      }
    }
    expect(el.getAttribute('data-keyboard')).toBe('open')
    expect(el.getAttribute('data-keyboard')).toBe('open')
  })

  it('D — non-zero offsetTop ignored for stage top (2K.3)', () => {
    const el = createFakeShell()
    const state = computeAssistantMobileViewport(
      bounds({ height: 508, width: 390, top: 47 }),
      844,
    )
    applyAssistantMobileViewportToElement(el, state, 0)
    expect(el.style.top).toBe('0px')
    expect(el.style.getPropertyValue('--assistant-vv-top')).toBe('')
    expect(el.style.height).toBe('508px')
    expect(state.keyboardOpen).toBe(true)
  })

  it('E — keyboard closing sequence restores closed geometry', () => {
    const frames = [508, 560, 650, 760, 844]
    const el = createFakeShell()
    for (const h of frames) {
      applyAssistantMobileViewportToElement(
        el,
        computeAssistantMobileViewport(bounds({ height: h, width: 390 }), 844),
      )
    }
    expect(el.style.height).toBe('844px')
    expect(el.getAttribute('data-keyboard')).toBe('closed')
  })

  it('F/G/H — transcript scroll semantics preserved', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('followLatestRef')
    expect(surface).toContain('isScrollNearBottom')
    expect(surface).toContain('scrollElementToBottom')
    // Keyboard open is not a scroll dependency.
    expect(surface).not.toMatch(
      /useLayoutEffect\([\s\S]*keyboardOpen[\s\S]*scrollElementToBottom/,
    )
    const near = { scrollTop: 900, scrollHeight: 1000, clientHeight: 100 }
    const up = { scrollTop: 10, scrollHeight: 1000, clientHeight: 100 }
    expect(isScrollNearBottom(near)).toBe(true)
    expect(isScrollNearBottom(up)).toBe(false)
  })

  it('I — multiline composer bounded', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('COMPOSER_TEXTAREA_MAX_PX = 114')
  })

  it('J — repeated open/close cycles leave clean attributes', () => {
    const el = createFakeShell()
    for (let i = 0; i < 3; i++) {
      applyAssistantMobileViewportToElement(
        el,
        computeAssistantMobileViewport(
          bounds({ height: 508, width: 390 }),
          844,
        ),
      )
      expect(el.getAttribute('data-keyboard')).toBe('open')
      applyAssistantMobileViewportToElement(
        el,
        computeAssistantMobileViewport(
          bounds({ height: 844, width: 390 }),
          844,
        ),
      )
      expect(el.getAttribute('data-keyboard')).toBe('closed')
    }
  })

  it('K — cleanup clears VV styles (close while keyboard open)', () => {
    const el = createFakeShell()
    applyAssistantMobileViewportToElement(
      el,
      computeAssistantMobileViewport(bounds({ height: 508, width: 390 }), 844),
    )
    expect(el.getAttribute('data-keyboard')).toBe('open')
    clearAssistantMobileViewportFromElement(el)
    expect(el.getAttribute('data-keyboard')).toBeNull()
    expect(el.getAttribute('data-keyboard')).toBeNull()
  })

  it('L — reopen path keeps first-tap native (no mobile autofocus effect)', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("initialFocus: isMobile ? 'panel' : 'first'")
    expect(surface).toContain('if (isMobile) return')
  })

  it('M/N — 393×852 and 430×932 open/closed', () => {
    for (const [w, h, kb] of [
      [393, 852, 340],
      [430, 932, 360],
    ] as const) {
      const closed = computeAssistantMobileViewport(
        bounds({ height: h, width: w }),
        h,
      )
      const open = computeAssistantMobileViewport(
        bounds({ height: h - kb, width: w }),
        h,
      )
      expect(closed.keyboardOpen).toBe(false)
      expect(open.keyboardOpen).toBe(true)
      expect(open.viewportHeight).toBe(h - kb)
    }
  })

  it('O — VisualViewport unavailable fallback still computable', () => {
    const state = computeAssistantMobileViewport(
      {
        top: 0,
        left: 0,
        width: 390,
        height: 844,
        fromVisualViewport: false,
      },
      844,
    )
    expect(state.fromVisualViewport).toBe(false)
    expect(state.keyboardOpen).toBe(false)
  })

  it('architecture — no React setState on every VV frame', () => {
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('applyAssistantStageViewportToElement')
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).not.toContain('useState')
    expect(hook).not.toContain('setState')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).not.toContain('mobileViewportStyle')
    expect(surface).not.toContain('style={isMobile ? mobileViewportStyle')
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    // Composer not keyed/branched on keyboard
    expect(surface).not.toMatch(/key=\{[^}]*keyboard/)
    expect(surface).not.toContain('data-composing')
  })

  it('architecture — no CSS transitions fighting keyboard geometry', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    const rootBlock = mobile.slice(
      mobile.indexOf(".surfaceRoot[data-mobile='true']"),
      mobile.indexOf('.surfaceBackdrop'),
    )
    // Backdrop/stage geometry must not animate height/top (Safari keyboard owns motion).
    expect(rootBlock).not.toMatch(/transition:[^;]*(height|top|transform)/)
    expect(mobile).not.toMatch(
      /\.panel[^{]*\{[^}]*transition:[^;]*height/s,
    )
    // 2J.3 allows subtle hero presentation transitions (<=200ms), not geometry.
    expect(mobile).toMatch(/\.emptyHero\s*\{[^}]*transition:/s)
  })

  it('desktop geometry unchanged', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
  })

  it('visual fixtures 2J.1', () => {
    mkdirSync(outDir, { recursive: true })
    const devices = [
      { w: 390, h: 844, kb: 336, label: 'empty-closed' },
      { w: 390, h: 844, kb: 336, label: 'empty-open', open: true },
      { w: 390, h: 844, kb: 336, label: 'conversation-open', open: true, convo: true },
      { w: 393, h: 852, kb: 340, label: 'open-393', open: true },
      { w: 430, h: 932, kb: 360, label: 'open-430', open: true },
      { w: 390, h: 844, kb: 336, label: 'multiline-open', open: true, multi: true },
      { w: 390, h: 844, kb: 200, label: 'closing-intermediate', open: true, mid: true },
    ] as const

    const rows: string[] = []
    for (const d of devices) {
      const shellH = d.open ? (d.mid ? d.h - d.kb : d.h - d.kb) : d.h
      const state = computeAssistantMobileViewport(
        bounds({ height: shellH, width: d.w }),
        d.h,
      )
      rows.push(
        `<section data-fixture="${d.label}" data-phase="2k1" data-keyboard="${state.keyboardOpen ? 'open' : 'closed'}" style="width:${d.w}px;height:${shellH}px;margin:16px;background:#f7f3ec;display:grid;grid-template-rows:64px 1fr auto;overflow:hidden">` +
          `<header style="display:flex;align-items:center;padding:0 16px;font-weight:600">Asystent</header>` +
          `<main style="overflow:auto;padding:12px;${'convo' in d && d.convo ? '' : 'display:flex;align-items:center;justify-content:center'}">${
            'convo' in d && d.convo
              ? '<p>User…</p><p>Assistant…</p>'.repeat(8)
              : `<div style="text-align:center"><div style="width:${state.keyboardOpen ? 36 : 64}px;height:${state.keyboardOpen ? 36 : 64}px;margin:0 auto 12px;border-radius:50%;background:#c4b8a8"></div><p style="font-size:${state.keyboardOpen ? 18 : 26}px;margin:0">Jak mogę Ci pomóc?</p></div>`
          }</main>` +
          `<footer style="padding:12px 16px;border-top:1px solid rgba(0,0,0,.06)"><div style="height:${'multi' in d && d.multi ? 88 : 54}px;border-radius:27px;background:#efe8de;font-size:16px;padding:12px 18px">Zapytaj…</div></footer>` +
          `</section>`,
      )
    }
    writeFileSync(
      join(outDir, 'fixtures.html'),
      `<!doctype html><html lang="pl"><meta charset="utf-8"/><title>2J.1 fixtures</title><body style="font-family:system-ui;background:#ddd">${rows.join('\n')}<p style="max-width:480px;margin:24px;font-size:12px">Simulated VV only — does not replace physical iPhone QA.</p></body></html>`,
    )
    expect(rows.length).toBe(7)
  })
})
