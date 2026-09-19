/**
 * Assistant UX Phase 2E — visual refinement acceptance (display only).
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2eAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { parseSafeMarkdown } from './components/presentation/parseSafeMarkdown'
import {
  allItemsAreScheduleRows,
  scheduleRowsFromListItems,
  scheduleRowsFromParagraphLines,
  tryParseScheduleRow,
} from './components/presentation/scheduleDisplay'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const WEDDING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function turn(
  message: string,
  references: AssistantReference[],
): AssistantPresentationTurn {
  return { message, status: 'answer', references }
}

function actionTypes(plan: ReturnType<typeof derivePresentationDisplayPlan>) {
  const fromCards = plan.displayReferences.flatMap((r) =>
    r.actions.map((a) => a.type),
  )
  return [...plan.inlineActions.map((a) => a.type), ...fromCards]
}

describe('Assistant UX 2E — visual markers + frozen 2D behavior', () => {
  it('PHASE_2E markers: processing orb, schedule CSS, composer density', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('.scheduleList')
    expect(css).toContain('.loadingOrb')
    expect(css).toContain('min-height: 0')
    expect(css).toContain('max-height: min(700px')
    expect(css).toContain('height: 38px')
    expect(css).toContain('padding: 0 13px')
    expect(css).toContain('min-height: 64px')
    expect(css).toMatch(/\.composer\s*\{[^}]*border-radius:\s*27px/)
    expect(css).not.toMatch(/\.composer\s*\{[^}]*box-shadow:\s*inset/)
    // Phase 2G.1: single soft theme focus ring
    expect(css).toMatch(/\.composer:focus-within\s*\{[^}]*0 0 0 2.5px/)

    const processing = readSrc(
      'src/features/assistant/components/AssistantProcessingIndicator.tsx',
    )
    expect(processing).toContain('AssistantThinkingOrb')
    expect(processing).toContain("variant=\"processing\"")
    expect(readSrc('src/features/assistant/components/AssistantThinkingOrb.tsx')).toContain('size={20}')
    expect(processing).toContain('assistant-processing')
    // 2F keeps Thinking Orbs; phase marker may be 2e or 2f depending on isolate generation
    expect(processing).toMatch(/data-phase="2[ef]"/)

    const pkg = readSrc('package.json')
    expect(pkg).toMatch(/"thinking-orbs"/)
    expect(pkg).not.toMatch(/border-beam|liquid-gooey|metal-fx|img-fx/)
  })

  it('CASE A — tomorrow: wedding + calendar; schedule structure when HH:MM evidence', () => {
    const message = [
      'Jutro masz ślub Martyny Napieralskiej i Damiana Urbańskiego w Kontrabas Sali Bankietowej.',
      '',
      '12:30 Przygotowania pana młodego',
      '14:00 Przygotowania panny młodej',
      '15:00 Ceremonia',
      '',
      'Nie masz zapisanych sesji na ten dzień.',
    ].join('\n')
    const refs: AssistantReference[] = [
      {
        id: 'w1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'c1',
        kind: 'calendar',
        label: '2026-09-17',
        actions: [{ type: 'open_calendar', date: '2026-09-17' }],
      },
    ]
    const plan = derivePresentationDisplayPlan({
      utterance: 'Co mam jutro?',
      presentationTurn: turn(message, refs),
    })
    expect(classifyPresentationIntent('Co mam jutro?')).toBe('calendar')
    expect(actionTypes(plan).sort()).toEqual(
      ['open_calendar', 'open_wedding'].sort(),
    )
    expect(plan.displayReferences.some((r) => r.kind === 'wedding')).toBe(true)

    const rows = scheduleRowsFromParagraphLines(
      [
        '12:30 Przygotowania pana młodego',
        '14:00 Przygotowania panny młodej',
        '15:00 Ceremonia',
      ].join('\n'),
    )
    expect(rows).toHaveLength(3)
    expect(rows?.[0]?.time).toBe('12:30')
    expect(rows?.[0]?.titleInlines).toEqual([
      { type: 'text', value: 'Przygotowania pana młodego' },
    ])
  })

  it('CASE B — phone follow-up: number once; call+SMS only', () => {
    const original = turn('Numer telefonu Martyny: **731 435 667**.', [
      {
        id: 'w1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'p1',
        kind: 'phone',
        label: 'Telefon',
        actions: [
          { type: 'call_phone', phone: '731435667' },
          { type: 'send_sms', phone: '731435667' },
        ],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'a jej numer telefonu?',
      presentationTurn: original,
    })
    expect(plan.mode).toBe('direct_inline')
    expect(plan.inlineActions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])
    expect(plan.displayReferences).toHaveLength(0)
    expect(actionTypes(plan)).not.toContain('open_wedding')
    expect(actionTypes(plan)).not.toContain('open_calendar')
  })

  it('CASE C — email: compose only', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'jaki jest mail Martyny?',
      presentationTurn: turn('Mail: martyna@example.com', [
        {
          id: 'e1',
          kind: 'email',
          label: 'Email',
          actions: [{ type: 'compose_email', email: 'martyna@example.com' }],
        },
      ]),
    })
    expect(actionTypes(plan)).toEqual(['compose_email'])
  })

  it('CASE D — single address: Nawiguj', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'gdzie jest ceremonia?',
      presentationTurn: turn('Adres: ul. Kwiatowa 1', [
        {
          id: 'a1',
          kind: 'address',
          label: 'Ceremonia',
          value: 'ul. Kwiatowa 1',
          actions: [
            { type: 'navigate_address', address: 'ul. Kwiatowa 1' },
          ],
        },
      ]),
    })
    expect(actionTypes(plan)).toContain('navigate_address')
  })

  it('CASE E — two addresses: two location objects', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'adresy na jutro',
      presentationTurn: turn('Dwa miejsca.', [
        {
          id: 'a1',
          kind: 'address',
          label: 'Ceremonia',
          value: 'ul. A 1',
          actions: [{ type: 'navigate_address', address: 'ul. A 1' }],
        },
        {
          id: 'a2',
          kind: 'address',
          label: 'Przyjęcie',
          value: 'ul. B 2',
          actions: [{ type: 'navigate_address', address: 'ul. B 2' }],
        },
      ]),
    })
    expect(plan.displayReferences.filter((r) => r.kind === 'address')).toHaveLength(
      2,
    )
  })

  it('CASE F — questionnaire: relevant action only', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'czy ankieta jest wypełniona?',
      presentationTurn: turn('Ankieta przedślubna: wypełniona.', [
        {
          id: 'w1',
          kind: 'wedding',
          label: 'Martyna Napieralska i Damian Urbański',
          entityId: WEDDING,
          actions: [
            {
              type: 'open_prewedding_questionnaire',
              weddingId: WEDDING,
            },
            { type: 'open_wedding', weddingId: WEDDING },
          ],
        },
      ]),
    })
    expect(actionTypes(plan)).toEqual(['open_prewedding_questionnaire'])
    expect(actionTypes(plan)).not.toContain('open_wedding')
  })

  it('CASE G — session object + session actions', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'opowiedz mi o najbliższej sesji',
      presentationTurn: turn('Sesja narzeczeńska w sobotę.', [
        {
          id: 's1',
          kind: 'session',
          label: 'Sesja narzeczeńska',
          entityId: SESSION,
          actions: [{ type: 'open_session', sessionId: SESSION }],
        },
        {
          id: 'c1',
          kind: 'calendar',
          label: '2026-09-20',
          actions: [{ type: 'open_calendar', date: '2026-09-20' }],
        },
      ]),
    })
    expect(plan.displayReferences.some((r) => r.kind === 'session')).toBe(true)
    expect(actionTypes(plan)).toContain('open_session')
    expect(actionTypes(plan)).not.toContain('open_calendar')
  })

  it('CASE H — finance scalar: prose-first; wedding open only if present', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'ile jeszcze do zapłaty?',
      presentationTurn: turn('Do zapłaty pozostało **2500 zł**.', [
        {
          id: 'w1',
          kind: 'wedding',
          label: 'Martyna',
          entityId: WEDDING,
          actions: [{ type: 'open_wedding', weddingId: WEDDING }],
        },
      ]),
    })
    expect(plan.intent).toBe('finance')
    expect(actionTypes(plan)).toEqual(['open_wedding'])
    expect(actionTypes(plan)).not.toContain('call_phone')
  })

  it('CASE I/J — adaptive height: max scroll + compact min', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toMatch(/\.panel\[data-mode='conversation'\][\s\S]*height:\s*auto/)
    expect(css).toContain('min-height: 0')
    expect(css).toContain('max-height: min(700px')
    expect(css).toContain('100dvh')
    expect(css).toContain('safe-area-inset-bottom')
  })

  it('schedule: do not invent from dash bullets alone', () => {
    expect(tryParseScheduleRow('- Przygotowania')).toBeNull()
    expect(allItemsAreScheduleRows(['- foo', '- bar'])).toBe(false)
    const blocks = parseSafeMarkdown('- Przygotowania\n- Ceremonia')
    expect(blocks[0]?.type).toBe('unordered_list')
    const items =
      blocks[0]?.type === 'unordered_list' ? blocks[0].items : []
    expect(scheduleRowsFromListItems(items)).toBeNull()
  })

  it('schedule: trusted list items with HH:MM become schedule rows', () => {
    const blocks = parseSafeMarkdown(
      '- 12:30 Przygotowania pana młodego\n- 14:00 Przygotowania panny młodej',
    )
    expect(blocks[0]?.type).toBe('unordered_list')
    const items =
      blocks[0]?.type === 'unordered_list' ? blocks[0].items : []
    const rows = scheduleRowsFromListItems(items)
    expect(rows).toHaveLength(2)
    expect(rows?.[0]?.time).toBe('12:30')
  })

  it('intelligence / contract / projection / executor untouched', () => {
    // Frozen paths must still exist; 2E must not rewrite agent loop.
    const project = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(project).toContain('projectV7PresentationTurn')
    const exec = readSrc(
      'src/features/assistant/v7/presentation/executeAssistantAction.ts',
    )
    expect(exec).toContain('executeAssistantAction')
    const types = readSrc('src/features/assistant/v7/presentation/types.ts')
    expect(types).toContain('AssistantPresentationTurn')
    const processing = readSrc(
      'src/features/assistant/components/AssistantProcessingIndicator.tsx',
    )
    expect(processing).not.toContain('projectV7')
    expect(processing).not.toContain('executeAssistantAction')
  })

  it('mobile action touch targets ≥44px', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.contextAction[\s\S]*min-height:\s*44px/,
    )
    expect(css).toMatch(
      /@media \(max-width: 767px\)[\s\S]*\.userUtterance[\s\S]*max-width:\s*88%/,
    )
  })
})
