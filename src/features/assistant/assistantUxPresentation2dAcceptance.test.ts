/**
 * Assistant UX Phase 2D — display policy + adaptive height acceptance.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2dAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import {
  derivePresentationDisplayPlan,
  scalarValueInMessage,
} from './components/presentation/derivePresentationDisplayPlan'
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

function kinds(plan: ReturnType<typeof derivePresentationDisplayPlan>) {
  return plan.displayReferences.map((r) => r.kind)
}

describe('Assistant UX 2D display policy', () => {
  const phoneWeddingRefs: AssistantReference[] = [
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
      label: 'Telefon panny młodej',
      actions: [
        { type: 'call_phone', phone: '731435667' },
        { type: 'send_sms', phone: '731435667' },
      ],
    },
  ]

  it('CASE A — phone: inline call/SMS only; wedding suppressed; value once', () => {
    const original = turn(
      'Numer telefonu Martyny: **731 435 667**.',
      phoneWeddingRefs,
    )
    const snapshot = JSON.stringify(original)
    const plan = derivePresentationDisplayPlan({
      utterance: 'podaj mi numer telefonu do Martyny',
      presentationTurn: original,
    })
    expect(classifyPresentationIntent('podaj mi numer telefonu do Martyny')).toBe(
      'phone',
    )
    expect(plan.mode).toBe('direct_inline')
    expect(plan.inlineActions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])
    expect(plan.displayReferences).toHaveLength(0)
    expect(actionTypes(plan)).not.toContain('open_wedding')
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(original.references?.some((r) => r.kind === 'wedding')).toBe(true)
  })

  it('CASE B — email: Napisz mail; no wedding card', () => {
    const original = turn('Mail Martyny: martyna@example.com', [
      {
        id: 'w1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'e1',
        kind: 'email',
        label: 'Email panny młodej',
        actions: [{ type: 'compose_email', email: 'martyna@example.com' }],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'jaki jest mail Martyny?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('email')
    expect(plan.mode).toBe('direct_inline')
    expect(actionTypes(plan)).toEqual(['compose_email'])
    expect(kinds(plan)).toEqual([])
  })

  it('CASE C — address: Nawiguj; no wedding', () => {
    const original = turn(
      'Ceremonia: Bolesława Chrobrego 59A, 62-060 Stęszew',
      [
        {
          id: 'w1',
          kind: 'wedding',
          entityId: WEDDING,
          actions: [{ type: 'open_wedding', weddingId: WEDDING }],
        },
        {
          id: 'a1',
          kind: 'address',
          label: 'Ceremonia',
          actions: [
            {
              type: 'navigate_address',
              address: 'Bolesława Chrobrego 59A, 62-060 Stęszew',
            },
          ],
        },
      ],
    )
    const plan = derivePresentationDisplayPlan({
      utterance: 'gdzie jest ceremonia u Martyny?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('address')
    expect(actionTypes(plan)).toEqual(['navigate_address'])
    expect(actionTypes(plan)).not.toContain('open_wedding')
  })

  it('CASE D — two addresses: two Nawiguj; no wedding', () => {
    const original = turn('Przygotowania są w dwóch miejscach.', [
      {
        id: 'w1',
        kind: 'wedding',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'a1',
        kind: 'address',
        label: 'Przygotowania panny młodej',
        actions: [
          {
            type: 'navigate_address',
            address: 'Bolesława Chrobrego 59A, 62-060 Stęszew',
          },
        ],
      },
      {
        id: 'a2',
        kind: 'address',
        label: 'Przygotowania pana młodego',
        actions: [{ type: 'navigate_address', address: 'Inna 1, Poznań' }],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance:
        'gdzie przygotowuje się panna młoda i pan młody u Martyny?',
      presentationTurn: original,
    })
    expect(plan.displayReferences).toHaveLength(2)
    expect(kinds(plan)).toEqual(['address', 'address'])
    expect(actionTypes(plan).filter((t) => t === 'navigate_address')).toHaveLength(
      2,
    )
    expect(actionTypes(plan)).not.toContain('open_wedding')
  })

  it('CASE E — questionnaire: Otwórz ankietę only', () => {
    const original = turn('Ankieta jest uzupełniona.', [
      {
        id: 'w1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        entityId: WEDDING,
        actions: [
          { type: 'open_prewedding_questionnaire', weddingId: WEDDING },
          { type: 'open_wedding', weddingId: WEDDING },
        ],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'jaki jest status ankiety przedślubnej u Martyny?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('questionnaire')
    expect(actionTypes(plan)).toEqual(['open_prewedding_questionnaire'])
    expect(actionTypes(plan)).not.toContain('open_wedding')
  })

  it('CASE F — general wedding: Otwórz zlecenie; no calendar by default', () => {
    const original = turn('Ślub Martyny jest 17 września.', [
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
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'opowiedz mi o ślubie Martyny',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('wedding')
    expect(actionTypes(plan)).toEqual(['open_wedding'])
    expect(actionTypes(plan)).not.toContain('open_calendar')
  })

  it('CASE G — co mam jutro: wedding + calendar actions', () => {
    const original = turn('Jutro masz wesele Martyny.', [
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
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'co mam jutro?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('calendar')
    expect(actionTypes(plan).sort()).toEqual(
      ['open_calendar', 'open_wedding'].sort(),
    )
  })

  it('CASE H — session: Otwórz sesję; Nawiguj only if same-entity address', () => {
    const original = turn('Najbliższa sesja to katalog Jesień.', [
      {
        id: 's1',
        kind: 'session',
        label: 'Sesja produktowa — katalog Jesień',
        entityId: SESSION,
        actions: [{ type: 'open_session', sessionId: SESSION }],
      },
      {
        id: 'a1',
        kind: 'address',
        label: 'Lokalizacja',
        entityId: SESSION,
        actions: [
          { type: 'navigate_address', address: 'Ul. Test 1, Poznań' },
        ],
      },
      {
        id: 'c1',
        kind: 'calendar',
        label: '2026-10-05',
        actions: [{ type: 'open_calendar', date: '2026-10-05' }],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'opowiedz mi o najbliższej sesji',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('session')
    expect(actionTypes(plan)).toContain('open_session')
    expect(actionTypes(plan)).toContain('navigate_address')
    expect(actionTypes(plan)).not.toContain('open_calendar')
  })

  it('CASE I — finance: Otwórz zlecenie; no phone/address', () => {
    const original = turn('Pozostało **800 zł**.', [
      {
        id: 'w1',
        kind: 'wedding',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'p1',
        kind: 'phone',
        actions: [
          { type: 'call_phone', phone: '731435667' },
          { type: 'send_sms', phone: '731435667' },
        ],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'ile zostało do zapłaty u Martyny?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('finance')
    expect(actionTypes(plan)).toEqual(['open_wedding'])
  })

  it('CASE J — aggregate: no wedding cards; optional calendar inline', () => {
    const original = turn('Masz 4 wesela we wrześniu 2026.', [
      {
        id: 'w1',
        kind: 'wedding',
        entityId: WEDDING,
        actions: [{ type: 'open_wedding', weddingId: WEDDING }],
      },
      {
        id: 'w2',
        kind: 'wedding',
        entityId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
        actions: [
          {
            type: 'open_wedding',
            weddingId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          },
        ],
      },
      {
        id: 'c1',
        kind: 'calendar',
        label: '2026-09-01',
        actions: [{ type: 'open_calendar', date: '2026-09-01' }],
      },
    ])
    const plan = derivePresentationDisplayPlan({
      utterance: 'ile mam wesel w tym miesiącu?',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('aggregate')
    expect(plan.displayReferences).toHaveLength(0)
    expect(actionTypes(plan)).toEqual(['open_calendar'])
  })

  it('CASE K — unknown: fallback preserves refs', () => {
    const original = turn('Oto odpowiedź.', phoneWeddingRefs)
    const plan = derivePresentationDisplayPlan({
      utterance: 'hmm ciekawe',
      presentationTurn: original,
    })
    expect(plan.intent).toBe('general')
    expect(plan.mode).toBe('fallback')
    expect(plan.displayReferences).toHaveLength(2)
  })

  it('phone duplication helper + contract immutability / no prose actions', () => {
    expect(
      scalarValueInMessage('Numer: 731 435 667', '731435667', 'phone'),
    ).toBe(true)
    expect(
      scalarValueInMessage('Numer: 111222333', '731435667', 'phone'),
    ).toBe(false)
    const policy = readSrc(
      'src/features/assistant/components/presentation/derivePresentationDisplayPlan.ts',
    )
    expect(policy).not.toContain('projectV7')
    expect(policy).not.toContain('executeAssistantAction')
    expect(policy).toContain('cloneRef')
  })

  it('adaptive height CSS + 2C.1 visual freeze markers', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('min-height: 0')
    expect(css).toContain('max-height: min(700px')
    expect(css).toMatch(/\.panel\[data-mode='conversation'\][\s\S]*height:\s*auto/)
    expect(css).toContain('.inlineActions')
    expect(css).toContain('.contextCard')
    expect(css).toContain('.contextAction')
    expect(css).toContain('min(780px, calc(100vw - 48px))')
    // Mobile full sheet preserved
    expect(css).toContain('100dvh')
  })

  it('transcript wires display plan; Host/contract untouched', () => {
    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(transcript).toContain('derivePresentationDisplayPlan')
    expect(transcript).toContain('assistant-inline-actions')
    expect(transcript).toContain('precedingUserUtterance')
    const types = readSrc('src/features/assistant/v7/presentation/types.ts')
    expect(types).toContain('AssistantPresentationTurn')
    const project = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(project).toContain('projectV7PresentationTurn')
  })
})
