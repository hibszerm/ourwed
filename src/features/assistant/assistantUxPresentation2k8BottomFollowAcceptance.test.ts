/**
 * Phase 2K.8 — mobile transcript bottom-follow on viewport height change.
 * Does not change keyboard/modal architecture (2K.7 core stays).
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_SCROLL_STICK_THRESHOLD_PX,
  applyTranscriptBottomFollowOnHeightChange,
  distanceFromBottom,
  isScrollNearBottom,
  scrollElementToBottom,
} from './components/assistantScroll'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

/** Fake transcript scroll box — mutable clientHeight models keyboard resize. */
function createTranscriptBox(opts: {
  scrollHeight: number
  clientHeight: number
  scrollTop: number
}) {
  const box = {
    scrollHeight: opts.scrollHeight,
    clientHeight: opts.clientHeight,
    scrollTop: opts.scrollTop,
  }
  return box as unknown as HTMLElement & {
    scrollHeight: number
    clientHeight: number
    scrollTop: number
  }
}

describe('Phase 2K.8 mobile transcript bottom anchor', () => {
  it('threshold is ~48px; distanceFromBottom math', () => {
    expect(ASSISTANT_SCROLL_STICK_THRESHOLD_PX).toBe(48)
    const atBottom = { scrollTop: 952, scrollHeight: 1000, clientHeight: 48 }
    expect(distanceFromBottom(atBottom)).toBe(0)
    expect(isScrollNearBottom(atBottom)).toBe(true)

    const near = { scrollTop: 904, scrollHeight: 1000, clientHeight: 48 }
    expect(distanceFromBottom(near)).toBe(48)
    expect(isScrollNearBottom(near)).toBe(true)

    const up = { scrollTop: 903, scrollHeight: 1000, clientHeight: 48 }
    expect(distanceFromBottom(up)).toBe(49)
    expect(isScrollNearBottom(up)).toBe(false)
  })

  it('A — long conversation at bottom + height shrink → stay bottom', () => {
    const el = createTranscriptBox({
      scrollHeight: 2000,
      clientHeight: 600,
      scrollTop: 1400, // exactly at bottom: 2000-1400-600=0
    })
    expect(isScrollNearBottom(el)).toBe(true)
    // Keyboard opens: viewport shorter, scrollTop unchanged → appears scrolled up
    el.clientHeight = 320
    expect(distanceFromBottom(el)).toBeGreaterThan(48)
    applyTranscriptBottomFollowOnHeightChange(el, true)
    expect(el.scrollTop).toBe(el.scrollHeight)
    // After real DOM, scrollTop would clamp; model: we set scrollHeight as target
    expect(distanceFromBottom({ ...el, scrollTop: 2000 - 320, clientHeight: 320, scrollHeight: 2000 })).toBe(0)
  })

  it('B — keyboard closes while following → remain at bottom', () => {
    const el = createTranscriptBox({
      scrollHeight: 2000,
      clientHeight: 320,
      scrollTop: 1680,
    })
    expect(isScrollNearBottom(el)).toBe(true)
    el.clientHeight = 600
    applyTranscriptBottomFollowOnHeightChange(el, true)
    expect(el.scrollTop).toBe(2000)
  })

  it('C — user scrolled upward + height shrink → do NOT force bottom', () => {
    const el = createTranscriptBox({
      scrollHeight: 2000,
      clientHeight: 600,
      scrollTop: 200, // reading early messages
    })
    expect(isScrollNearBottom(el)).toBe(false)
    const before = el.scrollTop
    el.clientHeight = 320
    const applied = applyTranscriptBottomFollowOnHeightChange(el, false)
    expect(applied).toBe(false)
    expect(el.scrollTop).toBe(before)
  })

  it('D — new user message forces bottom (followLatest=true path)', () => {
    const el = createTranscriptBox({
      scrollHeight: 1800,
      clientHeight: 400,
      scrollTop: 100,
    })
    // submit() sets followLatestRef=true then content grows
    el.scrollHeight = 2100
    applyTranscriptBottomFollowOnHeightChange(el, true)
    expect(el.scrollTop).toBe(2100)
  })

  it('E — assistant response while following → bottom; while reading up → no force', () => {
    const following = createTranscriptBox({
      scrollHeight: 2200,
      clientHeight: 400,
      scrollTop: 1800,
    })
    expect(isScrollNearBottom(following)).toBe(true)
    following.scrollHeight = 2500
    applyTranscriptBottomFollowOnHeightChange(following, true)
    expect(following.scrollTop).toBe(2500)

    const reading = createTranscriptBox({
      scrollHeight: 2200,
      clientHeight: 400,
      scrollTop: 50,
    })
    reading.scrollHeight = 2500
    expect(applyTranscriptBottomFollowOnHeightChange(reading, false)).toBe(false)
    expect(reading.scrollTop).toBe(50)
  })

  it('F — repeat keyboard open/close 3× while following → still bottom', () => {
    const el = createTranscriptBox({
      scrollHeight: 2000,
      clientHeight: 600,
      scrollTop: 1400,
    })
    for (let i = 0; i < 3; i++) {
      el.clientHeight = 320
      applyTranscriptBottomFollowOnHeightChange(el, true)
      el.scrollTop = el.scrollHeight - el.clientHeight // clamp model
      expect(distanceFromBottom(el)).toBe(0)

      el.clientHeight = 600
      applyTranscriptBottomFollowOnHeightChange(el, true)
      el.scrollTop = el.scrollHeight - el.clientHeight
      expect(distanceFromBottom(el)).toBe(0)
    }
  })

  it('source — ResizeObserver bottom-follow; no keyboardOpen scroll coupling; 2k8', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const scroll = readSrc(
      'src/features/assistant/components/assistantScroll.ts',
    )
    const viewport = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    const anchor = readSrc(
      'src/features/assistant/components/useAssistantDocumentScrollAnchor.ts',
    )

    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('ResizeObserver')
    expect(surface).toContain('scrollElementToBottom')
    expect(surface).toContain('followLatestRef')
    expect(surface).toContain('isScrollNearBottom')
    // Must not couple scroll-to-bottom to keyboardOpen flag (2J.1 invariant).
    expect(surface).not.toMatch(
      /useLayoutEffect\([\s\S]*keyboardOpen[\s\S]*scrollElementToBottom/,
    )
    expect(surface).not.toContain('scrollIntoView')
    // Keyboard architecture untouched
    expect(viewport).toContain('applyAssistantStageHeightToElement')
    expect(viewport).not.toContain('SettleGate')
    expect(anchor).toContain('restoreDocumentScrollAnchor')
    expect(anchor).not.toContain('armFixedRootSettleGate')
    expect(scroll).toContain('ASSISTANT_SCROLL_STICK_THRESHOLD_PX = 48')
    expect(scroll).toContain('applyTranscriptBottomFollowOnHeightChange')
    expect(scroll).not.toContain('behavior')
    expect(scroll).not.toContain('smooth')
  })
})
