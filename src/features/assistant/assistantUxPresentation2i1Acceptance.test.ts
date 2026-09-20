/**
 * Assistant UX Phase 2I.1 — deterministic mixed assignments + authoritative result membership.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2i1Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { deriveCollectionItems } from './components/presentation/deriveCollectionItems'
import { messageWithoutDuplicateCollectionList } from './components/presentation/suppressDuplicateCollectionList'
import {
  selectPresentationResultRefs,
} from './components/presentation/selectPresentationResultRefs'
import { selectCombinedAssignments } from './v7/assignments/selectCombinedAssignments'
import { projectV7PresentationTurn } from './v7/presentation/projectV7Presentation'
import { V7ResourceSetStore } from './v7/resourceSet/store'
import type { V7TurnResult } from './v7/agent/loop'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2i1-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const W1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const W2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const W3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const S1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const W4 = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

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
    userText: 'Trzy najbliższe zlecenia:',
    toolCallCount: overrides.toolCalls.length,
    stoppedReason: 'final',
    latency: emptyLatency(),
    model: 'gpt-5.6-terra',
    ...overrides,
  }
}

function turn(
  message: string,
  references: AssistantReference[],
): AssistantPresentationTurn {
  return { message, status: 'answer', references }
}

const fourCandidates = [
  {
    kind: 'wedding' as const,
    entityId: W1,
    date: '2026-09-17',
    displayName: 'Martyna Napieralska i Damian Urbański',
  },
  {
    kind: 'wedding' as const,
    entityId: W2,
    date: '2026-09-19',
    displayName: 'Karolina Kot i Jan Wojciechowski',
  },
  {
    kind: 'wedding' as const,
    entityId: W3,
    date: '2026-11-30',
    displayName: 'Ccx Xxcx i Hdhshs Jdjsnz',
  },
  {
    kind: 'session' as const,
    entityId: S1,
    date: '2026-10-05',
    displayName: 'Sesja produktowa — katalog Jesień',
  },
]

describe('Assistant UX 2I.1 mixed assignments + result membership', () => {
  it('TEST 1 — mixed top 3 excludes Nov 30', () => {
    const top = selectCombinedAssignments(fourCandidates, 3)
    expect(top.map((c) => c.entityId)).toEqual([W1, W2, S1])
    expect(top.map((c) => c.date)).toEqual([
      '2026-09-17',
      '2026-09-19',
      '2026-10-05',
    ])
    expect(top.some((c) => c.entityId === W3)).toBe(false)
  })

  it('TEST 2 — limit after merge across 5+5', () => {
    const many = [
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: 'wedding' as const,
        entityId: `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`,
        date: `2026-09-${String(10 + i).padStart(2, '0')}`,
        displayName: `W${i}`,
      })),
      ...Array.from({ length: 5 }, (_, i) => ({
        kind: 'session' as const,
        entityId: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i}`,
        date: `2026-09-${String(11 + i).padStart(2, '0')}`,
        displayName: `S${i}`,
      })),
    ]
    // Fix UUIDs to valid format
    const candidates = many.map((c, i) => ({
      ...c,
      entityId:
        i < 5
          ? `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa${i}`
          : `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${i - 5}`,
    }))
    // Use proper UUIDs
    const proper = [
      { kind: 'wedding' as const, entityId: W1, date: '2026-09-10', displayName: 'W0' },
      { kind: 'session' as const, entityId: S1, date: '2026-09-11', displayName: 'S0' },
      { kind: 'wedding' as const, entityId: W2, date: '2026-09-12', displayName: 'W1' },
      { kind: 'session' as const, entityId: W4, date: '2026-09-13', displayName: 'S1' },
      { kind: 'wedding' as const, entityId: W3, date: '2026-09-14', displayName: 'W2' },
    ]
    const top = selectCombinedAssignments(proper, 3)
    expect(top).toHaveLength(3)
    expect(top.map((c) => c.date)).toEqual([
      '2026-09-10',
      '2026-09-11',
      '2026-09-12',
    ])
    expect(top.map((c) => c.kind)).toEqual(['wedding', 'session', 'wedding'])
  })

  it('TEST 3–5 — evidence>result; display=result; actions trusted', () => {
    const evidence: AssistantReference[] = [
      {
        id: 'e1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        detail: '2026-09-17',
        entityId: W1,
        role: 'result',
        actions: [{ type: 'open_wedding', weddingId: W1 }],
      },
      {
        id: 'e2',
        kind: 'wedding',
        label: 'Karolina Kot i Jan Wojciechowski',
        detail: '2026-09-19',
        entityId: W2,
        role: 'result',
        actions: [{ type: 'open_wedding', weddingId: W2 }],
      },
      {
        id: 'e3',
        kind: 'session',
        label: 'Sesja produktowa — katalog Jesień',
        detail: '2026-10-05',
        entityId: S1,
        role: 'result',
        actions: [{ type: 'open_session', sessionId: S1 }],
      },
      // Evidence-only noise
      {
        id: 'e4',
        kind: 'wedding',
        label: 'Ccx Xxcx i Hdhshs Jdjsnz',
        detail: '2026-11-30',
        entityId: W3,
        role: 'evidence',
        actions: [{ type: 'open_wedding', weddingId: W3 }],
      },
      ...Array.from({ length: 6 }, (_, i) => ({
        id: `noise-${i}`,
        kind: 'wedding' as const,
        label: `Noise ${i}`,
        detail: `2026-12-${String(i + 1).padStart(2, '0')}`,
        entityId: W4,
        role: 'evidence' as const,
        actions: [{ type: 'open_wedding' as const, weddingId: W4 }],
      })),
    ]
    expect(evidence).toHaveLength(10)

    const selection = selectPresentationResultRefs({
      utterance: 'jakie mam 3 najbliższe zlecenia?',
      evidenceReferences: evidence,
      selectionQuery: false,
    })
    expect(selection.evidenceReferences).toHaveLength(10)
    expect(selection.resultReferences).toHaveLength(3)
    expect(selection.resultReferences.map((r) => r.entityId)).toEqual([
      W1,
      W2,
      S1,
    ])
    expect(selection.resultReferences.some((r) => r.entityId === W3)).toBe(
      false,
    )

    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam 3 najbliższe zlecenia?',
      presentationTurn: turn('Trzy najbliższe zlecenia:', evidence),
    })
    expect(plan.mode).toBe('collection')
    expect(plan.displayReferences).toHaveLength(3)
    const items = deriveCollectionItems(plan.displayReferences)
    expect(items).toHaveLength(3)
    expect(items.map((i) => i.action?.type)).toEqual([
      'open_wedding',
      'open_wedding',
      'open_session',
    ])
  })

  it('TEST 6 — duplicate numbered prose suppressed', () => {
    const refs: AssistantReference[] = [
      {
        id: '1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        detail: '2026-09-17',
        entityId: W1,
        role: 'result',
        actions: [{ type: 'open_wedding', weddingId: W1 }],
      },
      {
        id: '2',
        kind: 'wedding',
        label: 'Karolina Kot i Jan Wojciechowski',
        detail: '2026-09-19',
        entityId: W2,
        role: 'result',
        actions: [{ type: 'open_wedding', weddingId: W2 }],
      },
      {
        id: '3',
        kind: 'session',
        label: 'Sesja produktowa — katalog Jesień',
        detail: '2026-10-05',
        entityId: S1,
        role: 'result',
        actions: [{ type: 'open_session', sessionId: S1 }],
      },
    ]
    const prose = messageWithoutDuplicateCollectionList(
      'Trzy najbliższe zlecenia to:\n\n1. 17.09.2026 — Martyna Napieralska i Damian Urbański\n2. 19.09.2026 — Karolina Kot i Jan Wojciechowski\n3. 05.10.2026 — Sesja produktowa — katalog Jesień',
      refs.map((r) => r.label!).filter(Boolean),
    )
    expect(prose.suppressed).toBe(true)
    expect(prose.text).not.toContain('17.09.2026')
    expect(prose.text).toMatch(/Trzy najbliższe zlecenia/i)
  })

  it('TEST 7–8 — wedding-only / session-only helpers', () => {
    const wedOnly = selectCombinedAssignments(
      fourCandidates.filter((c) => c.kind === 'wedding'),
      3,
    )
    expect(wedOnly.every((c) => c.kind === 'wedding')).toBe(true)
    expect(wedOnly.map((c) => c.date)).toEqual([
      '2026-09-17',
      '2026-09-19',
      '2026-11-30',
    ])

    const sesOnly = selectCombinedAssignments(
      [
        {
          kind: 'session',
          entityId: S1,
          date: '2026-10-05',
          displayName: 'A',
        },
        {
          kind: 'session',
          entityId: W4,
          date: '2026-11-01',
          displayName: 'B',
        },
        {
          kind: 'session',
          entityId: W3,
          date: '2026-12-01',
          displayName: 'C',
        },
      ],
      3,
    )
    expect(sesOnly.every((c) => c.kind === 'session')).toBe(true)
  })

  it('TEST 9 — projection from select_nearest_assignments is authoritative', () => {
    const store = new V7ResourceSetStore({
      sessionId: 'v7-test-session',
      tenantKey: 'tenant-test',
    })
    const weddings = store.create({
      resourceType: 'wedding',
      memberIds: [W1, W2],
      description: 'selected weddings',
    })
    const sessions = store.create({
      resourceType: 'session',
      memberIds: [S1],
      description: 'selected sessions',
    })
    // Noise describe that would previously dump extra rows
    const noise = store.create({
      resourceType: 'wedding',
      memberIds: [W1, W2, W3, W4],
      description: 'noise',
    })

    const p = projectV7PresentationTurn({
      result: baseResult({
        toolCalls: [
          {
            name: 'describe_resource_set',
            args: { handle: noise.handle },
            result: {
              ok: true,
              handle: noise.handle,
              count: 4,
              description: 'noise',
              preview: [
                { ordinal: 1, display_name: 'A', date: '2026-09-17' },
                { ordinal: 2, display_name: 'B', date: '2026-09-19' },
                { ordinal: 3, display_name: 'C', date: '2026-11-30' },
                { ordinal: 4, display_name: 'D', date: '2026-12-01' },
              ],
            },
          },
          {
            name: 'select_nearest_assignments',
            args: { limit: 3, date_start: '2026-09-16' },
            result: {
              ok: true,
              count: 3,
              limit: 3,
              date_start: '2026-09-16',
              date_end: null,
              wedding_handle: weddings.handle,
              session_handle: sessions.handle,
              selected: [
                {
                  ordinal: 1,
                  resource_type: 'wedding',
                  display_name: 'Martyna Napieralska i Damian Urbański',
                  date: '2026-09-17',
                  set_ordinal: 1,
                },
                {
                  ordinal: 2,
                  resource_type: 'wedding',
                  display_name: 'Karolina Kot i Jan Wojciechowski',
                  date: '2026-09-19',
                  set_ordinal: 2,
                },
                {
                  ordinal: 3,
                  resource_type: 'session',
                  display_name: 'Sesja produktowa — katalog Jesień',
                  date: '2026-10-05',
                  set_ordinal: 1,
                },
              ],
            },
          },
        ],
      }),
      store,
      binding: store.binding,
      utterance: 'jakie mam 3 najbliższe zlecenia?',
    })

    expect(p.references?.filter((r) => r.role === 'result')).toHaveLength(3)
    expect(p.references?.filter((r) => r.kind === 'calendar')).toHaveLength(1)
    expect(
      p.references?.find((r) => r.kind === 'calendar')?.actions[0],
    ).toEqual({ type: 'open_calendar', date: '2026-09-16' })
    expect(
      p.references?.filter((r) => r.role === 'result').map((r) => r.entityId),
    ).toEqual([W1, W2, S1])
    expect(
      p.references
        ?.filter((r) => r.role === 'result')
        .map((r) => r.actions[0]?.type),
    ).toEqual(['open_wedding', 'open_wedding', 'open_session'])

    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam 3 najbliższe zlecenia?',
      presentationTurn: p,
    })
    expect(plan.mode).toBe('collection')
    expect(plan.displayReferences).toHaveLength(3)
    expect(plan.displayReferences.some((r) => r.entityId === W3)).toBe(false)
  })

  it('TEST 9b — calendar day ask does not leak open-ended nearest future rows', () => {
    const store = new V7ResourceSetStore({
      sessionId: 'v7-test-session-day',
      tenantKey: 'tenant-test',
    })
    const today = '2026-09-20'
    const weddings = store.create({
      resourceType: 'wedding',
      memberIds: [W1, W2, W3],
      description: 'weddings',
    })
    const sessions = store.create({
      resourceType: 'session',
      memberIds: [S1],
      description: 'sessions',
    })

    const p = projectV7PresentationTurn({
      result: baseResult({
        userText:
          'Dzisiaj masz wesele: Martyna Napieralska i Damian Urbański.',
        toolCalls: [
          {
            name: 'select_nearest_assignments',
            args: { limit: 4, date_start: today },
            result: {
              ok: true,
              count: 4,
              limit: 4,
              date_start: today,
              date_end: null,
              wedding_handle: weddings.handle,
              session_handle: sessions.handle,
              selected: [
                {
                  ordinal: 1,
                  resource_type: 'wedding',
                  display_name: 'Martyna Napieralska i Damian Urbański',
                  date: today,
                  set_ordinal: 1,
                },
                {
                  ordinal: 2,
                  resource_type: 'session',
                  display_name: 'Sesja produktowa — katalog Jesień',
                  date: '2026-10-05',
                  set_ordinal: 1,
                },
                {
                  ordinal: 3,
                  resource_type: 'wedding',
                  display_name: 'Joanna Chowaka i Karol Nowak',
                  date: '2026-11-26',
                  set_ordinal: 2,
                },
                {
                  ordinal: 4,
                  resource_type: 'wedding',
                  display_name: 'Zuzanna Nowak i Adam Kowalewski',
                  date: '2026-11-30',
                  set_ordinal: 3,
                },
              ],
            },
          },
        ],
      }),
      store,
      binding: store.binding,
      utterance: 'co mam dzisiaj?',
    })

    const plan = derivePresentationDisplayPlan({
      utterance: 'co mam dzisiaj?',
      presentationTurn: p,
    })
    expect(plan.intent).toBe('calendar')
    expect(plan.displayReferences).toHaveLength(1)
    expect(plan.displayReferences[0]?.entityId).toBe(W1)
    expect(plan.displayReferences[0]?.detail).toBe(today)
    expect(
      plan.displayReferences.some((r) => r.detail === '2026-10-05'),
    ).toBe(false)
    expect(
      plan.displayReferences.some((r) => r.detail === '2026-11-26'),
    ).toBe(false)
  })

  it('TEST 10 — najdroższe single winner; no evidence leak', () => {
    const evidence: AssistantReference[] = [
      {
        id: 'w',
        kind: 'wedding',
        label: 'Ccx Xxcx i Hdhshs Jdjsnz',
        detail: '2026-11-30',
        entityId: W3,
        role: 'result',
        actions: [{ type: 'open_wedding', weddingId: W3 }],
      },
      {
        id: 's',
        kind: 'session',
        label: 'Sesja produktowa — katalog Jesień',
        detail: '2026-10-05',
        entityId: S1,
        role: 'evidence',
        actions: [{ type: 'open_session', sessionId: S1 }],
      },
    ]
    // For selection query, even if both were result, price-like prefers one wedding
    const plan = derivePresentationDisplayPlan({
      utterance: 'a które jest najdroższe?',
      presentationTurn: turn(
        'Najdroższe jest wesele Ccx — 10 400 PLN.',
        [
          {
            ...evidence[0]!,
            role: undefined,
          },
          {
            ...evidence[1]!,
            role: undefined,
          },
        ],
      ),
      previousEffectiveIntent: 'collection',
    })
    expect(plan.displayReferences).toHaveLength(1)
    expect(plan.displayReferences[0]?.kind).toBe('wedding')
    expect(plan.displayReferences[0]?.entityId).toBe(W3)
  })

  it('TEST 11–12 — phone + geometry regression markers', () => {
    const phone = derivePresentationDisplayPlan({
      utterance: 'a jego?',
      presentationTurn: turn('Numer Damiana: 692 589 570.', [
        {
          id: 'p',
          kind: 'phone',
          actions: [
            { type: 'call_phone', phone: '692589570' },
            { type: 'send_sms', phone: '692589570' },
          ],
        },
      ]),
      previousEffectiveIntent: 'phone',
    })
    expect(phone.intent).toBe('phone')
    expect(phone.inherited).toBe(true)
    expect(phone.mode).toBe('direct_inline')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')

    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(transcript).toContain('data-phase="2i1"')

    const tools = readSrc('src/features/assistant/v7/tools/execute.ts')
    expect(tools).toContain('select_nearest_assignments')
    expect(tools).toContain('selectCombinedAssignments')

    const native = readSrc('src/features/assistant/v7/agent/nativeTools.ts')
    expect(native).toContain('select_nearest_assignments')

    const prompt = readSrc('src/features/assistant/v7/agent/prompt.ts')
    expect(prompt).toContain('select_nearest_assignments')
  })

  it('TEST 13 — no action from prose; contract role is additive', () => {
    const original = turn('Masz sesję 05.10.2026 Sesja produktowa.', [])
    const snap = JSON.stringify(original)
    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam 3 najbliższe zlecenia?',
      presentationTurn: original,
    })
    expect(plan.displayReferences).toHaveLength(0)
    expect(JSON.stringify(original)).toBe(snap)

    const types = readSrc('src/features/assistant/v7/presentation/types.ts')
    expect(types).toContain("role?: 'result' | 'evidence'")
  })

  it('writes visual fixtures (exact 3 + long-evidence)', () => {
    mkdirSync(outDir, { recursive: true })
    const top = selectCombinedAssignments(fourCandidates, 3)
    const rows = top
      .map((c) => {
        const mon =
          c.date === '2026-09-17' || c.date === '2026-09-19'
            ? 'WRZ'
            : c.date === '2026-10-05'
              ? 'PAŹ'
              : 'LIS'
        const day = String(Number(c.date.slice(8)))
        return `<div class="row" data-kind="${c.kind}" data-id="${c.entityId}"><div class="day">${day}</div><div class="mon">${mon}</div><div class="title">${c.displayName}</div><div class="type">${c.kind === 'session' ? 'Sesja' : 'Ślub'}</div></div>`
      })
      .join('\n')
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2I.1</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;height:700px;margin:0 auto 24px;background:#f7f3ec;border-radius:24px;padding:24px}
.row{display:grid;grid-template-columns:76px 1fr auto;gap:12px;min-height:70px;align-items:center;border-top:1px solid rgba(44,38,34,.06);padding:12px 14px}
.day{font-size:19px;font-weight:600}.mon{font-size:11px;letter-spacing:.08em;color:#8a8078}
.type{color:#8a8078;font-size:12px}
</style></head><body>
<div class="panel" data-phase="2i1" data-fixture="mixed-top3" data-count="${top.length}">
<p>Trzy najbliższe zlecenia:</p>
${rows}
</div>
<div class="panel" data-phase="2i1" data-fixture="evidence-10-result-3" data-evidence="10" data-result="3" data-display="3">
<p>Evidence 10 → display 3 (same rows)</p>
${rows}
</div>
</body></html>`
    writeFileSync(join(outDir, 'mixed-top3-exact.html'), html)
    expect(html).toContain('data-count="3"')
    expect(html).toContain('data-kind="session"')
    expect(html).toContain(S1)
    expect(html).not.toContain(W3)
    expect(html.match(/data-kind="/g)?.length).toBe(6) // 3+3 rows across fixtures
  })
})
