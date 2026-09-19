/**
 * Phase 2K — late WebKit VisualViewport resize class.
 *
 * Focus happens BEFORE any VV height change. Structure must stay valid.
 * Final reduced height arrives late. Structure must stay valid.
 * VV is not required for structural correctness.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  assertStructuralOrder,
  layoutAssistantMobileShell,
} from './components/assistantMobileShellGeometry'
import {
  applyAssistantStageViewportToElement,
  clearAssistantMobileViewportFromElement,
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

describe('Assistant UX 2K late-WebKit-resize', () => {
  it('source — layout does not subscribe to VV', () => {
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    expect(hook).toContain('subscribeVisualViewport')
    expect(hook).toContain('applyAssistantViewportFrameToElement')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).not.toContain('mobileViewportStyle')
  })

  it('T critical — focus without VV resize keeps structure; late resize keeps structure', () => {
    const w = 390
    const full = 844
    const openH = 508

    // 1–3: Assistant open, focus textarea, no VV change yet
    const beforeVv = layoutAssistantMobileShell({
      viewportWidth: w,
      viewportHeight: full,
    })
    assertStructuralOrder(beforeVv, 'focus-before-vv')
    expect(beforeVv.header.top).toBe(0)
    expect(beforeVv.composer.top).toBeGreaterThan(beforeVv.header.bottom)

    // Simulated activeElement = textarea (identity stable)
    const shell = createFakeShell()
    const panel = createFakePanel()
    const textarea = createFakeTextarea()
    shell.appendChild(panel)
    shell.appendChild(textarea)
    const node = textarea

    // Apply path is geometry no-op even if something calls it early
    applyAssistantStageViewportToElement(
      shell,
      computeAssistantMobileViewport(bounds({ height: full, width: w }), full),
    )
    expect(shell.contains(node)).toBe(true)

    // Intermediate: still full height (VV late)
    assertStructuralOrder(
      layoutAssistantMobileShell({ viewportWidth: w, viewportHeight: full }),
      'intermediate-no-vv',
    )

    // 7–8: final reduced measurement arrives late
    const afterVv = layoutAssistantMobileShell({
      viewportWidth: w,
      viewportHeight: openH,
    })
    assertStructuralOrder(afterVv, 'late-vv-final')
    expect(afterVv.header.top).toBe(0)
    expect(afterVv.composer.top).toBeGreaterThan(afterVv.header.bottom)
    expect(afterVv.composer.top).toBeGreaterThan(afterVv.viewportHeight * 0.25)

    applyAssistantStageViewportToElement(
      shell,
      computeAssistantMobileViewport(bounds({ height: openH, width: w }), full),
    )
    expect(shell.style.height).toBe(`${openH}px`)
    expect(shell.contains(node)).toBe(true)

    // Invalid / zero samples never collapse geometry writes
    expect(
      isValidAssistantViewportSample(bounds({ height: 0, width: w })),
    ).toBe(false)
    clearAssistantMobileViewportFromElement(shell)
    expect(shell.style.height).toBe('')
  })

  it('stale offsetTop cannot place composer above header', () => {
    const g = layoutAssistantMobileShell({
      viewportWidth: 390,
      viewportHeight: 508,
      offsetTop: 200,
    })
    assertStructuralOrder(g, 'stale-offset')
    expect(g.header.top).toBeLessThan(g.composer.top)
  })

  it('VV unavailable — full CSS fallback structure valid', () => {
    const g = layoutAssistantMobileShell({
      viewportWidth: 390,
      viewportHeight: 844,
    })
    assertStructuralOrder(g, 'vv-unavailable')
  })
})
