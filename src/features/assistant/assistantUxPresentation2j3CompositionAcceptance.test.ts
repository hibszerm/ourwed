/**
 * Phase 2J.3 regressions under Phase 2K architecture.
 * Behavioral intents preserved; obsolete usable-height assertions removed.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  applyAssistantStageViewportToElement,
  computeAssistantMobileViewport,
} from './components/useAssistantMobileViewport'
import { __resetBodyScrollLockForTests } from '@/components/ui/bodyScrollLock'
import type { VisualViewportBounds } from '@/components/ui/visualViewportBounds'
import { createFakeShell } from './components/fakeShellForTests.test'
import {
  assertStructuralOrder,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'

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

describe('Assistant UX 2J.3 composition (2K successor)', () => {
  afterEach(() => {
    __resetBodyScrollLockForTests()
    vi.restoreAllMocks()
  })

  it('opaque inset:0 dialog + 3-row grid; no usable-height engine', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toContain('grid-template-rows: auto minmax(0, 1fr) auto')
    expect(mobile).toContain('inset: 0')
    expect(mobile).not.toContain('--assistant-usable-height')
    expect(mobile).toMatch(/background:\s*var\(--surface-primary/)
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain("bodyLock: 'overflow'")
  })

  it('keyboard open shrinks available height without reordering rows', () => {
    for (const h of [844, 700, 508]) {
      assertStructuralOrder(
        layoutAssistantMobileShell({ viewportWidth: 390, viewportHeight: h }),
        `2j3-${h}`,
      )
    }
    const el = createFakeShell()
    applyAssistantStageViewportToElement(
      el,
      computeAssistantMobileViewport(bounds({ height: 508, width: 390 }), 844),
    )
    expect(el.style.height).toBe('508px')
    expect(el.style.top).toBe('0px')
  })

  it('desktop freeze', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
  })
})

describe('Assistant UX 2J.3 CRM isolation (2K successor)', () => {
  it('opaque coverage', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(
      /\.surfaceRoot\[data-mobile='true'\]\s*\{[^}]*background:\s*var\(--surface-primary/s,
    )
  })
})

describe('Assistant UX 2J.3 scroll ownership (2K successor)', () => {
  it('transcript-only scroll; overflow body lock', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/\.transcriptScroll\s*\{[^}]*overflow-y:\s*auto/s)
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toContain('window.scrollTo')
  })
})
