/**
 * Assistant UX Phase 2A/2B — conversation shell foundation acceptance.
 *
 *   npx vitest run src/features/assistant/assistantUxShell2abAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ASSISTANT_EXAMPLE_GROUPS,
  ASSISTANT_EXAMPLES,
  ASSISTANT_EXAMPLES_V4,
  ASSISTANT_SUPPORT,
} from './copy'
import {
  isScrollNearBottom,
  scrollElementToBottom,
} from './components/assistantScroll'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const WRITE_HINT =
  /Dodaj|Stwórz ślub|stwórz ślub|Utwórz zlecenie|wykonaj prostą akcję/i

describe('Assistant UX 2A/2B shell foundation', () => {
  const surface = readSrc('src/features/assistant/components/AssistantSurface.tsx')
  const composer = readSrc(
    'src/features/assistant/components/AssistantComposer.tsx',
  )
  const css = readSrc('src/features/assistant/components/Assistant.module.css')
  const transcript = readSrc(
    'src/features/assistant/components/PresentationTranscript.tsx',
  )
  const host = readSrc('src/features/assistant/AssistantHost.tsx')
  const copy = readSrc('src/features/assistant/copy.ts')

  it('1. empty Assistant opens as calm welcome (orb + prompt + composer)', () => {
    expect(surface).toContain('data-mode={conversationMode ? \'conversation\' : \'empty\'}')
    expect(surface).toContain('assistant-empty-welcome')
    expect(surface).toContain('ASSISTANT_EMPTY_PROMPT')
    expect(surface).not.toContain('ASSISTANT_EXAMPLE_GROUPS')
    expect(surface).not.toContain('assistant-suggestion')
    expect(surface).toContain('placement="dock"')
  })

  it('2. example groups remain non-write in copy module (not rendered empty)', () => {
    const flat = ASSISTANT_EXAMPLE_GROUPS.flatMap((g) => g.examples)
    expect(ASSISTANT_EXAMPLE_GROUPS.map((g) => g.label)).toEqual([
      'Znajdź',
      'Sprawdź',
    ])
    expect(flat.length).toBeGreaterThanOrEqual(4)
    expect(flat.length).toBeLessThanOrEqual(6)
    for (const ex of flat) {
      expect(ex).not.toMatch(WRITE_HINT)
    }
    for (const ex of ASSISTANT_EXAMPLES) {
      expect(ex).not.toMatch(WRITE_HINT)
    }
    for (const ex of ASSISTANT_EXAMPLES_V4) {
      expect(ex).not.toMatch(WRITE_HINT)
    }
    expect(ASSISTANT_SUPPORT).not.toMatch(WRITE_HINT)
    expect(copy).not.toMatch(/label:\s*'Dodaj'/)
    expect(copy).not.toMatch(/Stwórz ślub/)
    expect(surface).not.toMatch(/Znajdź|Sprawdź/)
  })

  it('3. first submit enters active conversation mode (bottom composer)', () => {
    expect(surface).toContain('placement="dock"')
    expect(surface).toContain('{composer}')
    expect(surface).not.toMatch(/conversationMode \? composer/)
    expect(css).toContain('.composerDock')
    expect(css).toContain('.transcriptScroll')
    expect(css).toContain('.emptyHero')
  })

  it('4–5. user turn appears via transcript; composer dock in active mode', () => {
    expect(transcript).toContain('assistant-transcript-user')
    expect(transcript).toContain('styles.userTurn')
    expect(composer).toContain("data-placement={placement}")
    expect(composer).toContain('data-testid="assistant-composer"')
    expect(composer).toContain('data-testid="assistant-send"')
  })

  it('6–9. Enter submit / Shift+Enter newline / empty+loading blocked', () => {
    expect(composer).toContain("e.key === 'Enter' && !e.shiftKey")
    expect(composer).toContain('e.preventDefault()')
    expect(composer).toContain('onSubmit()')
    expect(surface).toContain(
      'const canSubmit = draft.trim().length > 0 && !loading && !confirming',
    )
    expect(surface).toContain('if (!text || loading || confirming) return')
    expect(composer).toContain('disabled={!canSubmit}')
  })

  it('10–12. multi-turn transcript + close clears / reopen empty (Host semantics)', () => {
    expect(host).toContain('setTranscript')
    expect(host).toMatch(/setTranscript\(\[\]\)/)
    expect(host).toContain('clearSession')
    expect(host).toContain('transcript={transcript}')
    // Transcript is presentation-only; never fed as V7 history dump
    expect(host).not.toMatch(/utterance:.*transcript/)
  })

  it('13. contextual actions still execute through existing boundary', () => {
    const control = readSrc(
      'src/features/assistant/components/presentation/AssistantActionControl.tsx',
    )
    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(control).toContain('executeAssistantAction')
    expect(control).toContain('assistant-presentation-action')
    expect(control).toContain('labelForAssistantAction')
    expect(transcript).toContain('AssistantContextCard')
  })

  it('14–15. Escape closes + focus restore via useOverlay', () => {
    expect(surface).toContain('useOverlay')
    expect(surface).toContain('closeOnEscape: true')
    const overlay = readSrc('src/components/ui/overlay/useOverlay.ts')
    expect(overlay).toContain('previouslyFocused')
    expect(overlay).toContain("event.key === 'Escape'")
    expect(overlay).toContain('setAppInert')
    expect(overlay).toContain('getFocusable')
  })

  it('16. reduced-motion path does not depend on animation', () => {
    expect(css).toContain('prefers-reduced-motion: reduce')
    expect(css).toContain('animation: none !important')
  })

  it('17. mobile structural mode at 767 breakpoint + safe areas', () => {
    expect(host).toContain("(max-width: 767px)")
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toContain('100dvh')
    expect(css).toContain('env(safe-area-inset-top')
    expect(css).toContain('env(safe-area-inset-bottom')
    expect(surface).toContain("data-mobile={isMobile ? 'true' : 'false'}")
  })

  it('auto-scroll stick rule: near bottom vs intentional scroll-up', () => {
    expect(isScrollNearBottom({ scrollTop: 900, scrollHeight: 1000, clientHeight: 100 })).toBe(
      true,
    )
    expect(
      isScrollNearBottom({ scrollTop: 100, scrollHeight: 1000, clientHeight: 100 }),
    ).toBe(false)
    const el = { scrollTop: 0, scrollHeight: 500, clientHeight: 100 }
    scrollElementToBottom(el as HTMLElement)
    expect(el.scrollTop).toBe(500)
    expect(surface).toContain('followLatestRef')
    expect(surface).toContain('isScrollNearBottom')
    expect(surface).toContain('scrollElementToBottom')
  })

  it('future voice extension point exists without mic UI', () => {
    expect(composer).toContain('data-assistant-composer-trailing')
    expect(composer).toContain('Future Voice')
    expect(composer).not.toMatch(/Microphone|Mic\b/)
  })

  it('presentation contract / projection untouched in this slice', () => {
    const types = readSrc('src/features/assistant/v7/presentation/types.ts')
    const project = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(types).toContain("type: 'open_calendar'")
    expect(project).toContain('aggregate_resources')
    // Surface must not invent actions from prose
    expect(surface).not.toContain('projectV7PresentationTurn')
  })
})
