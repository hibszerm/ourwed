/**
 * Phase 2K.4 — keyboard transition polish acceptance.
 * Does NOT claim to rewrite 2K.3 document-anchor architecture.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertTransitionFrameInvariants,
  keyboardPresentationMode,
  modelKeyboardClosingSequence,
  modelKeyboardOpeningSequence,
} from './components/assistantKeyboardTransition'
import {
  PHYSICAL_IPHONE_FOCUS_SCROLL,
  correctDocumentScrollAgainstAnchor,
} from './components/assistantDocumentScrollAnchor'
import {
  applyAssistantStageHeightToElement,
  stageApplyUsesOffsetTopForPosition,
} from './components/useAssistantMobileViewport'
import { layoutAssistantMobileShell } from './components/assistantMobileShellGeometry'
import { createFakePanel, createFakeShell } from './components/fakeShellForTests.test'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

function bounds(
  partial: Partial<VisualViewportBounds> &
    Pick<VisualViewportBounds, 'height' | 'width'>,
): VisualViewportBounds {
  return { top: 0, left: 0, fromVisualViewport: true, ...partial }
}

describe('Phase 2K.4 keyboard transition', () => {
  it('A. focus immediately activates compact presentation', () => {
    expect(
      keyboardPresentationMode({
        textareaFocused: true,
        keyboardOpenAttr: false,
      }),
    ).toBe('compact')
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain('.panel:focus-within .emptyHero')
    expect(mobile).toContain(
      ".surfaceRoot[data-keyboard='open'][data-mode='empty'] .emptyHero",
    )
  })

  it('B–F. opening sequence — root/header/composer continuous; same structural contract', () => {
    const seq = modelKeyboardOpeningSequence()
    expect(seq[0]!.presentation).toBe('rest')
    expect(seq[1]!.presentation).toBe('compact')
    expect(seq[1]!.focused).toBe(true)
    for (const [i, frame] of seq.entries()) {
      assertTransitionFrameInvariants(frame, `open-${i}`)
    }
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('useAssistantDocumentScrollAnchor')
  })

  it('G. document anchor remains effective during sequence', () => {
    const { before, safariAttempt } = PHYSICAL_IPHONE_FOCUS_SCROLL
    expect(correctDocumentScrollAgainstAnchor(before, safariAttempt).y).toBe(0)
    const nonzero = modelKeyboardOpeningSequence({
      openingDocumentY: 650,
      safariAttemptY: 1123,
    })
    for (const f of nonzero) expect(f.documentY).toBe(650)
  })

  it('H–I. VV height sequence without root/offsetTop positioning', () => {
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(stageApplyUsesOffsetTopForPosition(hook)).toBe(false)
    expect(hook).toContain("frame.style.top = '0px'")
    for (const h of [714, 680, 620, 560, 500, 450, 404]) {
      const g = layoutAssistantMobileShell({
        layoutWidth: 390,
        layoutHeight: 714,
        viewportWidth: 390,
        viewportHeight: h,
        offsetTop: h < 600 ? 310 : 0,
      })
      expect(g.frame.top).toBe(0)
      expect(g.header.top).toBe(0)
      expect(g.composer.bottom).toBe(h)
    }
  })

  it('J. no stage height CSS transition', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    const frameRule = mobile.slice(
      mobile.indexOf('.mobileViewportFrame'),
      mobile.indexOf('.panel,'),
    )
    expect(frameRule).toContain('transition: none')
    expect(frameRule).not.toMatch(/transition:\s*[^;]*height/)
  })

  it('K. no root transform/opacity animation during keyboard', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    const rootRule = mobile.slice(
      mobile.indexOf(".surfaceRoot[data-mobile='true']"),
      mobile.indexOf('.surfaceBackdrop'),
    )
    expect(rootRule).toContain('opacity: 1')
    expect(rootRule).toContain('transition: none')
    expect(rootRule).toContain('transform: none')
    expect(rootRule).toMatch(/background:\s*var\(--surface-primary/)
  })

  it('L. hero presentational transition only (no width/height anim on orb)', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain('Phase 2K.4')
    expect(mobile).toMatch(
      /\.thinkingOrbHero\s*\{[^}]*transition:\s*opacity 180ms/s,
    )
    expect(mobile).not.toMatch(
      /\.thinkingOrbHero\s*\{[^}]*transition:[^}]*width 1/s,
    )
    expect(mobile).toContain('.emptyHeroGroup')
    expect(mobile).toMatch(/transform 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
  })

  it('M. active conversation does not use empty-hero choreography', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain(
      ".surfaceRoot[data-mode='conversation'] .emptyHero",
    )
    expect(css).toMatch(
      /\.surfaceRoot\[data-mode='conversation'\]\s*\.emptyHero\s*\{[^}]*display:\s*none/s,
    )
  })

  it('N. closing sequence returns to rest cleanly', () => {
    const seq = modelKeyboardClosingSequence()
    const last = seq[seq.length - 1]!
    expect(last.presentation).toBe('rest')
    expect(last.keyboardAttrOpen).toBe(false)
    for (const [i, frame] of seq.entries()) {
      assertTransitionFrameInvariants(frame, `close-${i}`)
    }
  })

  it('O. 3 repeated cycles — no accumulated offset / mode flip', () => {
    for (let c = 0; c < 3; c += 1) {
      const open = modelKeyboardOpeningSequence()
      const close = modelKeyboardClosingSequence()
      expect(open.every((f) => f.rootTop === 0)).toBe(true)
      expect(close[close.length - 1]!.presentation).toBe('rest')
      expect(
        correctDocumentScrollAgainstAnchor(
          PHYSICAL_IPHONE_FOCUS_SCROLL.before,
          PHYSICAL_IPHONE_FOCUS_SCROLL.safariAttempt,
        ).y,
      ).toBe(0)
    }
  })

  it('P. CRM covered every modeled frame', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/background:\s*var\(--surface-primary/)
    expect(mobile).not.toContain('backdrop-filter')
    for (const f of modelKeyboardOpeningSequence()) {
      expect(f.rootOpaque).toBe(true)
    }
  })

  it('Q. nonzero opening document scroll preserved in model', () => {
    const seq = modelKeyboardOpeningSequence({
      openingDocumentY: 650,
      safariAttemptY: 1123,
    })
    expect(seq.every((f) => f.documentY === 650)).toBe(true)
  })

  it('2K.3 freezes still wired', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('useAssistantDocumentScrollAnchor')
    expect(surface).toContain('useAssistantMobileViewport')
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toContain('AssistantPhysicalDiagHud')
    const anchor = readSrc(
      'src/features/assistant/components/assistantDocumentScrollAnchor.ts',
    )
    expect(anchor).toContain('correctDocumentScrollAgainstAnchor')
  })

  it('duplicate same-height VV writes skipped', () => {
    const frame = createFakeShell()
    frame.appendChild(createFakePanel())
    applyAssistantStageHeightToElement(
      frame,
      bounds({ height: 404, width: 390, top: 310 }),
      714,
    )
    expect(frame.style.height).toBe('404px')
    applyAssistantStageHeightToElement(
      frame,
      bounds({ height: 404, width: 390, top: 200 }),
      714,
    )
    expect(frame.style.height).toBe('404px')
    expect(frame.style.top).toBe('0px')
  })

  it('obsolete focus-within composer padding yank removed', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).not.toMatch(
      /\.panel:focus-within\s*\.composerDock[\s\S]*?padding-bottom:\s*12px/,
    )
  })

  it('desktop freeze', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toMatch(/min\(780px,\s*calc\(100vw\s*-\s*48px\)\)/)
    expect(css).toMatch(/min\(700px,\s*calc\(100dvh\s*-\s*64px\)\)/)
  })
})
