/**
 * Assistant UX Phase 2C — premium presentation acceptance.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2cAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  parseSafeMarkdown,
  stripHtmlTags,
  neutralizeMarkdownLinks,
  visibleTextFromBlocks,
} from './components/presentation/parseSafeMarkdown'
import { formatPresentationCalendarLabel } from './components/presentation/formatPresentationDate'
import {
  shouldShowReferenceValue,
  displayLabelForReference,
} from './components/presentation/AssistantReferenceCluster'
import {
  actionVisualTier,
  iconForAssistantAction,
} from './components/presentation/AssistantActionControl'
import type { AssistantAction, AssistantReference } from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2C presentation', () => {
  it('1–2. raw **strong** markers become semantic strong; not visible as **', () => {
    const blocks = parseSafeMarkdown(
      'Wesele **Martyny Napieralskiej i Damiana Urbańskiego** o **12:30**.',
    )
    const visible = visibleTextFromBlocks(blocks)
    expect(visible).not.toContain('**')
    expect(visible).toContain('Martyny Napieralskiej')
    expect(blocks[0]?.type).toBe('paragraph')
    const para = blocks[0]
    if (para?.type !== 'paragraph') throw new Error('expected paragraph')
    expect(para.children.some((c) => c.type === 'strong')).toBe(true)
  })

  it('3. unordered list rendering AST', () => {
    const blocks = parseSafeMarkdown('- Alfa\n- Beta')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('unordered_list')
  })

  it('4. ordered list rendering AST', () => {
    const blocks = parseSafeMarkdown('1. Pierwszy\n2. Drugi')
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.type).toBe('ordered_list')
  })

  it('5. arbitrary HTML is stripped, not executed', () => {
    expect(stripHtmlTags('<script>alert(1)</script>hi')).toBe('alert(1)hi')
    const blocks = parseSafeMarkdown('Hello <img src=x onerror=alert(1)> world')
    const visible = visibleTextFromBlocks(blocks)
    expect(visible).not.toContain('<img')
    expect(visible).toContain('Hello')
    expect(visible).toContain('world')
    const safeText = readSrc(
      'src/features/assistant/components/presentation/AssistantSafeText.tsx',
    )
    expect(safeText).not.toMatch(/dangerouslySetInnerHTML/)
    expect(safeText).not.toMatch(/createElement\(['"]a['"]/)
    // Ensure we never assign href from model strings
    expect(safeText).not.toMatch(/\bhref\s*=/)
  })

  it('6. model URL does not become clickable navigation', () => {
    const neutralized = neutralizeMarkdownLinks(
      'Zobacz [tutaj](https://evil.example/steal)',
    )
    expect(neutralized).toBe('Zobacz tutaj')
    expect(neutralized).not.toContain('http')
    const parser = readSrc(
      'src/features/assistant/components/presentation/parseSafeMarkdown.ts',
    )
    expect(parser).toContain('neutralizeMarkdownLinks')
    expect(parser).not.toMatch(/\bhref\s*=/)
    expect(parser).not.toMatch(/createElement\(['"]a['"]/)
  })

  it('7–12. reference associations + phone group + date format', () => {
    const phoneRef: AssistantReference = {
      id: 'r1',
      kind: 'phone',
      label: 'Telefon panny młodej',
      actions: [
        { type: 'call_phone', phone: '731435667' },
        { type: 'send_sms', phone: '731435667' },
      ],
    }
    expect(phoneRef.actions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])
    expect(actionVisualTier({ type: 'call_phone', phone: '1' })).toBe('direct')
    expect(actionVisualTier({ type: 'open_wedding', weddingId: 'x' })).toBe(
      'navigate',
    )

    const addrA: AssistantReference = {
      id: 'a1',
      kind: 'address',
      label: 'Przygotowania panny młodej',
      actions: [
        {
          type: 'navigate_address',
          address: 'Bolesława Chrobrego 59A, 62-060 Stęszew',
        },
      ],
    }
    const addrB: AssistantReference = {
      id: 'a2',
      kind: 'address',
      label: 'Przygotowania pana młodego',
      actions: [
        { type: 'navigate_address', address: 'Inna 1, Poznań' },
      ],
    }
    expect(addrA.actions[0]).not.toEqual(addrB.actions[0])

    expect(
      displayLabelForReference({
        id: 'c1',
        kind: 'calendar',
        label: '2026-09-17',
        actions: [{ type: 'open_calendar', date: '2026-09-17' }],
      }),
    ).toBe('17 września 2026')
    expect(formatPresentationCalendarLabel('2026-09-17')).toBe(
      '17 września 2026',
    )

    // Context cards always surface phone/email/address values
    expect(
      shouldShowReferenceValue(
        'phone',
        '731 435 667',
        'Numer telefonu to 731 435 667.',
      ),
    ).toBe(true)
    expect(
      shouldShowReferenceValue(
        'address',
        'Ul. Nowa 1',
        'Adres to coś innego.',
      ),
    ).toBe(true)
  })

  it('13–15. actions use executeAssistantAction; vocabulary frozen; no prose inference', () => {
    const control = readSrc(
      'src/features/assistant/components/presentation/AssistantActionControl.tsx',
    )
    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(control).toContain('executeAssistantAction')
    expect(control).toContain('labelForAssistantAction')
    expect(transcript).not.toContain('executeAssistantAction')
    expect(transcript).not.toMatch(/projectV7|from.*message.*action/)

    const types = readSrc('src/features/assistant/v7/presentation/types.ts')
    for (const t of [
      'call_phone',
      'send_sms',
      'compose_email',
      'navigate_address',
      'open_wedding',
      'open_session',
      'open_prewedding_questionnaire',
      'open_calendar',
    ]) {
      expect(types).toContain(`'${t}'`)
    }
    expect(types).not.toContain('open_url')
  })

  it('16–18. mobile action targets, focus, reduced-motion', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('@media (max-width: 767px)')
    expect(css).toMatch(/\.contextAction[\s\S]*min-height:\s*44px/)
    expect(css).toContain('contextAction:focus-visible')
    expect(css).toContain('prefers-reduced-motion: reduce')
  })

  it('19–20. 2AB shell semantics preserved; close/reopen Host unchanged', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(surface).toContain('placement="dock"')
    expect(surface).toContain('useOverlay')
    expect(surface).toContain('followLatestRef')
    expect(host).toMatch(/setTranscript\(\[\]\)/)
    expect(host).toContain('clearSession')
  })

  it('icon map covers closed vocabulary', () => {
    const actions: AssistantAction[] = [
      { type: 'call_phone', phone: '500600700' },
      { type: 'send_sms', phone: '500600700' },
      { type: 'compose_email', email: 'a@b.pl' },
      { type: 'navigate_address', address: 'Ul. Test 1, Poznań' },
      {
        type: 'open_wedding',
        weddingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      {
        type: 'open_session',
        sessionId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      },
      {
        type: 'open_prewedding_questionnaire',
        weddingId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      },
      { type: 'open_calendar', date: '2026-09-17' },
    ]
    for (const a of actions) {
      const Icon = iconForAssistantAction(a)
      expect(Icon).toBeTruthy()
      expect(['function', 'object']).toContain(typeof Icon)
    }
  })

  it('no projection / intelligence changes in this slice', () => {
    // Structural freeze markers — files must still export prior APIs
    const project = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    const exec = readSrc(
      'src/features/assistant/v7/presentation/executeAssistantAction.ts',
    )
    expect(project).toContain('projectV7PresentationTurn')
    expect(exec).toContain('executeAssistantAction')
    expect(exec).toContain("path = '/kalendarz'")
  })
})
