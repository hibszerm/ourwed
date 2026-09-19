/**
 * V7 Presentation Foundation V1 — deterministic contract tests.
 *
 *   npx vitest run src/features/assistant/v7/presentation/presentationFoundationAcceptance.test.ts
 */

import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { V7ResourceSetStore } from '../resourceSet/store'
import type { V7TurnResult } from '../agent/loop'
import {
  executeAssistantAction,
  labelForAssistantAction,
} from './executeAssistantAction'
import {
  presentationContainsForbiddenLeak,
  projectProseOnlyPresentation,
  projectV7PresentationTurn,
} from './projectV7Presentation'
import type { AssistantPresentationTurn } from './types'
import { ASSISTANT_API_FAILURE } from '../../copy'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../../')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const WEDDING_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WEDDING_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const SESSION_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function emptyLatency(): V7TurnResult['latency'] {
  return {
    firstModelMs: null,
    toolExecutionMs: [],
    subsequentModelMs: [],
    finalResponseMs: null,
    totalMs: 1,
  }
}

function baseResult(
  overrides: Partial<V7TurnResult> & { toolCalls: V7TurnResult['toolCalls'] },
): V7TurnResult {
  return {
    ok: true,
    userText: 'Odpowiedź pomocnicza.',
    toolCallCount: overrides.toolCalls.length,
    stoppedReason: 'final',
    latency: emptyLatency(),
    model: 'gpt-5.6-terra',
    ...overrides,
  }
}

function makeStore(memberIds: string[], resourceType: 'wedding' | 'session' = 'wedding') {
  const store = new V7ResourceSetStore({
    sessionId: 'v7-test-session',
    tenantKey: 'tenant-test',
  })
  const record = store.create({
    resourceType,
    memberIds,
    description: 'test set',
  })
  return { store, handle: record.handle, binding: store.binding }
}

function allActions(p: AssistantPresentationTurn) {
  return (p.references ?? []).flatMap((r) => r.actions)
}

function actionTypes(p: AssistantPresentationTurn) {
  return allActions(p).map((a) => a.type)
}

describe('V7 presentation foundation — projection', () => {
  it('1. model prose alone never creates an action', () => {
    const { store, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        userText: `Zadzwoń pod +48 501 222 333 do ${WEDDING_A} przy ul. Kwiatowej 1. rs_abc123 inspect_resource CONTACT.BRIDE_PHONE`,
        toolCalls: [],
      }),
      store,
      binding,
      utterance: 'podaj telefon',
    })
    expect(p.status).toBe('answer')
    expect(p.references ?? []).toEqual([])
    expect(actionTypes(p)).toEqual([])
    // sanitize strips internals from message
    expect(p.message).not.toMatch(/rs_/)
    expect(p.message).not.toMatch(/inspect_resource/)
  })

  it('2. canonical phone → call_phone + send_sms', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        userText: 'Numer telefonu to +48 501 222 333.',
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['CONTACT.BRIDE_PHONE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Anna i Piotr',
              fields: [
                {
                  concept: 'CONTACT.BRIDE_PHONE',
                  value: '+48 501 222 333',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'telefon',
    })
    expect(actionTypes(p).sort()).toEqual(['call_phone', 'open_wedding', 'send_sms'].sort())
    const phone = allActions(p).find((a) => a.type === 'call_phone')
    expect(phone).toEqual({ type: 'call_phone', phone: '+48 501 222 333' })
  })

  it('3. malformed phone → no external phone action', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['CONTACT.BRIDE_PHONE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'CONTACT.BRIDE_PHONE',
                  value: 'abc',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'telefon',
    })
    expect(actionTypes(p).includes('call_phone')).toBe(false)
    expect(actionTypes(p).includes('send_sms')).toBe(false)
  })

  it('4. canonical email → compose_email', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['CONTACT.BRIDE_EMAIL'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'CONTACT.BRIDE_EMAIL',
                  value: 'anna@example.com',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'email',
    })
    expect(actionTypes(p)).toContain('compose_email')
  })

  it('5. malformed email → no compose action', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['CONTACT.BRIDE_EMAIL'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'CONTACT.BRIDE_EMAIL',
                  value: 'not-an-email',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'email',
    })
    expect(actionTypes(p).includes('compose_email')).toBe(false)
  })

  it('6. canonical address → navigate_address', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: {
              handle,
              ordinal: 1,
              concepts: ['PLACE.CEREMONY_ADDRESS'],
            },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'PLACE.CEREMONY_ADDRESS',
                  value: 'ul. Kwiatowa 1, Kraków',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'adres',
    })
    expect(actionTypes(p)).toContain('navigate_address')
  })

  it('7. two canonical addresses → two associated Navigate actions', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: {
              handle,
              ordinal: 1,
              concepts: [
                'PLACE.BRIDE_PREP_ADDRESS',
                'PLACE.GROOM_PREP_ADDRESS',
              ],
            },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'PLACE.BRIDE_PREP_ADDRESS',
                  value: 'ul. A 1, Kraków',
                  filled: true,
                  privacy: 'PII',
                },
                {
                  concept: 'PLACE.GROOM_PREP_ADDRESS',
                  value: 'ul. B 2, Kraków',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'przygotowania',
    })
    const nav = allActions(p).filter((a) => a.type === 'navigate_address')
    expect(nav).toHaveLength(2)
    expect(nav.map((a) => (a.type === 'navigate_address' ? a.address : '')).sort()).toEqual([
      'ul. A 1, Kraków',
      'ul. B 2, Kraków',
    ])
    const labels = (p.references ?? [])
      .filter((r) => r.kind === 'address')
      .map((r) => r.label)
    expect(labels).toContain('Przygotowania panny młodej')
    expect(labels).toContain('Przygotowania pana młodego')
  })

  it('8. wedding reference → exact wedding UUID', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['WEDDING.DATE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Anna',
              fields: [
                {
                  concept: 'WEDDING.DATE',
                  value: '2026-09-20',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'data',
    })
    const open = allActions(p).find((a) => a.type === 'open_wedding')
    expect(open).toEqual({ type: 'open_wedding', weddingId: WEDDING_A })
    expect(JSON.stringify(p)).not.toMatch(/rs_/)
  })

  it('9. session reference → exact session UUID', () => {
    const { store, handle, binding } = makeStore([SESSION_A], 'session')
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['SESSION.DATE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Sesja',
              fields: [
                {
                  concept: 'SESSION.DATE',
                  value: '2026-10-01',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'sesja',
    })
    expect(allActions(p).find((a) => a.type === 'open_session')).toEqual({
      type: 'open_session',
      sessionId: SESSION_A,
    })
  })

  it('10. questionnaire evidence → open_prewedding_questionnaire', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: {
              handle,
              ordinal: 1,
              concepts: ['Q.PREWEDDING_STATUS'],
            },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Anna',
              fields: [
                {
                  concept: 'Q.PREWEDDING_STATUS',
                  value: 'submitted',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'ankieta',
    })
    expect(actionTypes(p)).toContain('open_prewedding_questionnaire')
    expect(
      allActions(p).find((a) => a.type === 'open_prewedding_questionnaire'),
    ).toEqual({
      type: 'open_prewedding_questionnaire',
      weddingId: WEDDING_A,
    })
  })

  it('11. calendar context → safe open_calendar', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['WEDDING.DATE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'Anna',
              fields: [
                {
                  concept: 'WEDDING.DATE',
                  value: '2026-09-20',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'data',
    })
    expect(actionTypes(p)).toContain('open_calendar')
    const r = executeAssistantAction(
      { type: 'open_calendar', date: '2026-09-20' },
      { apply: false },
    )
    expect(r).toEqual({ ok: true, mode: 'navigate', path: '/kalendarz' })
  })

  it('12. multi-member describe preview → collection OPEN rows (Phase 2G)', () => {
    const { store, handle, binding } = makeStore([WEDDING_A, WEDDING_B])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'search_resources',
            args: {},
            result: {
              ok: true,
              handle,
              count: 2,
              description: 'two',
              resource_type: 'wedding',
            },
          },
          {
            name: 'describe_resource_set',
            args: { handle },
            result: {
              ok: true,
              handle,
              count: 2,
              description: 'two',
              preview: [
                { ordinal: 1, display_name: 'A', date: '2026-01-01' },
                { ordinal: 2, display_name: 'B', date: '2026-02-01' },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'lista',
    })
    expect(actionTypes(p).filter((t) => t === 'open_wedding')).toEqual([
      'open_wedding',
      'open_wedding',
    ])
    expect(p.references?.map((r) => r.label)).toEqual(['A', 'B'])
    expect(p.references?.map((r) => r.detail)).toEqual([
      '2026-01-01',
      '2026-02-01',
    ])
  })

  it('12b. mixed wedding+session describe → both OPEN rows (Phase 2H.2)', () => {
    const store = new V7ResourceSetStore({
      sessionId: 'v7-test-session',
      tenantKey: 'tenant-test',
    })
    const weddings = store.create({
      resourceType: 'wedding',
      memberIds: [WEDDING_A, WEDDING_B],
      description: 'weddings',
    })
    const sessions = store.create({
      resourceType: 'session',
      memberIds: [SESSION_A],
      description: 'sessions',
    })
    const binding = store.binding
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'describe_resource_set',
            args: { handle: weddings.handle },
            result: {
              ok: true,
              handle: weddings.handle,
              count: 2,
              description: 'weddings',
              preview: [
                { ordinal: 1, display_name: 'W1', date: '2026-09-17' },
                { ordinal: 2, display_name: 'W2', date: '2026-09-19' },
              ],
            },
          },
          {
            name: 'describe_resource_set',
            args: { handle: sessions.handle },
            result: {
              ok: true,
              handle: sessions.handle,
              count: 1,
              description: 'sessions',
              preview: [
                {
                  ordinal: 1,
                  display_name: 'Sesja produktowa',
                  date: '2026-10-05',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'jakie mam zlecenia do końca roku?',
    })
    expect(p.references?.map((r) => r.kind)).toEqual([
      'wedding',
      'wedding',
      'session',
    ])
    expect(actionTypes(p)).toEqual([
      'open_wedding',
      'open_wedding',
      'open_session',
    ])
    expect(
      allActions(p).find((a) => a.type === 'open_session'),
    ).toEqual({ type: 'open_session', sessionId: SESSION_A })
  })

  it('12c. aggregate + describe still projects collection OPEN (Phase 2I)', () => {
    const { store, handle, binding } = makeStore([WEDDING_A, WEDDING_B])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'aggregate_resources',
            args: { handle, operation: 'count' },
            result: {
              ok: true,
              handle,
              operation: 'count',
              concept: 'WEDDING.DATE',
              value: 2,
              member_count: 2,
              set_unchanged: true,
            },
          },
          {
            name: 'describe_resource_set',
            args: { handle },
            result: {
              ok: true,
              handle,
              count: 2,
              description: 'two',
              preview: [
                { ordinal: 1, display_name: 'A', date: '2026-01-01' },
                { ordinal: 2, display_name: 'B', date: '2026-02-01' },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'ile i jakie',
    })
    expect(actionTypes(p).filter((t) => t === 'open_wedding')).toEqual([
      'open_wedding',
      'open_wedding',
    ])
  })

  it('13. aggregate collection → no arbitrary OPEN action', () => {
    const { store, handle, binding } = makeStore([WEDDING_A, WEDDING_B])
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'aggregate_resources',
            args: { handle, operation: 'count' },
            result: {
              ok: true,
              handle,
              operation: 'count',
              concept: 'WEDDING.DATE',
              value: 2,
              member_count: 2,
              set_unchanged: true,
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'ile',
    })
    expect(actionTypes(p)).toEqual([])
  })

  it('14. ambiguous evidence (two inspected weddings) → no OPEN', () => {
    const store = new V7ResourceSetStore({
      sessionId: 'v7-test-session',
      tenantKey: 'tenant-test',
    })
    const a = store.create({
      resourceType: 'wedding',
      memberIds: [WEDDING_A],
      description: 'a',
    })
    const b = store.create({
      resourceType: 'wedding',
      memberIds: [WEDDING_B],
      description: 'b',
    })
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle: a.handle, ordinal: 1, concepts: ['WEDDING.DATE'] },
            result: {
              ok: true,
              handle: a.handle,
              ordinal: 1,
              display_name: 'A',
              fields: [
                {
                  concept: 'WEDDING.DATE',
                  value: '2026-01-01',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
          {
            name: 'inspect_resource',
            args: { handle: b.handle, ordinal: 1, concepts: ['WEDDING.DATE'] },
            result: {
              ok: true,
              handle: b.handle,
              ordinal: 1,
              display_name: 'B',
              fields: [
                {
                  concept: 'WEDDING.DATE',
                  value: '2026-02-01',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding: store.binding,
      utterance: 'porownaj',
    })
    expect(actionTypes(p).includes('open_wedding')).toBe(false)
  })

  it('15–17. no handles / tool names / registry keys / ownerId in presentation', () => {
    const { store, handle, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: baseResult({
        userText: 'ok',
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle, ordinal: 1, concepts: ['CONTACT.BRIDE_PHONE'] },
            result: {
              ok: true,
              handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'CONTACT.BRIDE_PHONE',
                  value: '+48 501 222 333',
                  filled: true,
                  privacy: 'PII',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding,
      utterance: 'x',
    })
    const blob = JSON.stringify(p)
    expect(blob).not.toMatch(/rs_/)
    expect(blob).not.toMatch(/inspect_resource/)
    expect(blob).not.toMatch(/CONTACT\.BRIDE_PHONE/)
    expect(blob).not.toMatch(/ownerId|userId|tenantId|tenantKey/)
    expect(blob).not.toMatch(/gpt-5\.6-terra/)
    expect(presentationContainsForbiddenLeak(p)).toBe(false)
  })
})

describe('V7 presentation foundation — executor', () => {
  it('18–19. arbitrary URL / unsupported protocol impossible', () => {
    const smuggled = {
      type: 'open_wedding',
      weddingId: WEDDING_A,
      url: 'https://evil.example',
      href: 'javascript:alert(1)',
    } as Parameters<typeof executeAssistantAction>[0]
    const r = executeAssistantAction(smuggled, { apply: false })
    expect(r.ok).toBe(false)

    const badPhone = executeAssistantAction(
      { type: 'call_phone', phone: 'javascript:alert(1)' },
      { apply: false },
    )
    expect(badPhone.ok).toBe(false)

    expect(labelForAssistantAction({ type: 'call_phone', phone: '+48111' })).toBe(
      'Zadzwoń',
    )
  })

  it('routes are closed and validated', () => {
    expect(
      executeAssistantAction(
        { type: 'open_wedding', weddingId: WEDDING_A },
        { apply: false },
      ),
    ).toEqual({
      ok: true,
      mode: 'navigate',
      path: `/sluby/${WEDDING_A}`,
    })
    expect(
      executeAssistantAction(
        { type: 'open_session', sessionId: SESSION_A },
        { apply: false },
      ),
    ).toEqual({
      ok: true,
      mode: 'navigate',
      path: `/sesje/${SESSION_A}`,
    })
    expect(
      executeAssistantAction(
        { type: 'open_prewedding_questionnaire', weddingId: WEDDING_A },
        { apply: false },
      ),
    ).toEqual({
      ok: true,
      mode: 'navigate',
      path: `/sluby/${WEDDING_A}?tab=pre_wedding_questionnaire`,
    })
    expect(
      executeAssistantAction(
        { type: 'compose_email', email: 'a@b.co' },
        { apply: false },
      ),
    ).toEqual({ ok: true, mode: 'external', href: 'mailto:a@b.co' })
  })
})

describe('V7 presentation foundation — privacy / wiring', () => {
  it('20. presentation PII absent from diagnostics emitter signature usage', () => {
    const emit = readSrc('src/features/assistant/v7/diagnostics/emit.ts')
    expect(emit).not.toMatch(/presentation|references|phone|email|address/)
    const host = readSrc('src/features/assistant/v7/host.ts')
    const diagBlock = host.match(/emitV7Diagnostic\(\{[\s\S]*?\}\)/)?.[0] ?? ''
    expect(diagBlock).toMatch(/emitV7Diagnostic/)
    expect(diagBlock).not.toMatch(/presentation|references|phone|email|address|weddingId/)
    expect(host).toMatch(/projectV7PresentationTurn/)
  })

  it('21–25. Host transcript append / close / not fed to V7', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const immediate = readSrc(
      'src/features/assistant/v7/presentation/immediateWorkingState.ts',
    )
    expect(host).toMatch(/setTranscript/)
    expect(host).toMatch(/appendImmediatePendingUser/)
    expect(host).toMatch(/completePendingUserWithPresentation/)
    expect(immediate).toMatch(/role: 'user'/)
    expect(immediate).toMatch(/role: 'assistant'/)
    expect(host).toMatch(/setTranscript\(\[\]\)/)
    expect(host).toMatch(/retryUtterance|completePendingUserWithApiFailure/)
    // utterance into V7 is raw userText only — not transcript dump
    expect(host).toMatch(/utterance: userText/)
    expect(host).not.toMatch(/utterance:.*transcript/)
    expect(host).toMatch(/destroyV7OwnerSession/)
  })

  it('26. V6 emergency path still present; transcript wiped on non-V7', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(host).toMatch(/isV6OwnerCanaryVisible/)
    expect(host).toMatch(/Non-V7 engines: legacy single-turn UI/)
    expect(host).toMatch(/setTranscript\(\[\]\)/)
  })

  it('prose-only helper has no actions', () => {
    const p = projectProseOnlyPresentation(
      'Zadzwoń +48 111 222 333 ul. Test 1',
    )
    expect(p.references).toBeUndefined()
  })

  it('error presentation includes retry', () => {
    const { store, binding } = makeStore([WEDDING_A])
    const p = projectV7PresentationTurn({
      result: {
        ok: false,
        userText: '',
        toolCalls: [],
        toolCallCount: 0,
        stoppedReason: 'provider_error',
        latency: emptyLatency(),
        model: 'gpt-5.6-terra',
      },
      store,
      binding,
      utterance: 'pytanie',
    })
    expect(p.status).toBe('error')
    expect(p.message).toBe(ASSISTANT_API_FAILURE)
    expect(p.retryUtterance).toBe('pytanie')
  })
})

describe('V7 presentation foundation — ResourceSet isolation unchanged', () => {
  it('27–28. cross-session / cross-tenant still rejected by store', () => {
    const store = new V7ResourceSetStore({
      sessionId: 's1',
      tenantKey: 't1',
    })
    const rec = store.create({
      resourceType: 'wedding',
      memberIds: [WEDDING_A],
      description: 'x',
    })
    expect(
      store.get(rec.handle, { sessionId: 'other', tenantKey: 't1' }).ok,
    ).toBe(false)
    expect(
      store.get(rec.handle, { sessionId: 's1', tenantKey: 'other' }).ok,
    ).toBe(false)

    // Projection cannot resolve foreign handle binding
    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'inspect_resource',
            args: { handle: rec.handle, ordinal: 1, concepts: ['WEDDING.DATE'] },
            result: {
              ok: true,
              handle: rec.handle,
              ordinal: 1,
              display_name: 'X',
              fields: [
                {
                  concept: 'WEDDING.DATE',
                  value: '2026-09-20',
                  filled: true,
                  privacy: 'BIZ',
                },
              ],
            },
          },
        ],
      }),
      store,
      binding: { sessionId: 'other', tenantKey: 't1' },
      utterance: 'x',
    })
    expect(actionTypes(p)).toEqual([])
  })
})

describe('V7 presentation foundation — no decorative AI libraries / voice', () => {
  it('package bans decorative libraries.dev effects; thinking-orbs allowed for processing + empty hero', () => {
    const pkg = readSrc('package.json')
    expect(pkg).not.toMatch(/liquid-metal|liquid-gooey|border-beam|metal-fx|img-fx/i)
    expect(pkg).toMatch(/thinking-orbs/)
  })
})

// silence unused vi if needed
void vi
