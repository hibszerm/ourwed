/**
 * Assistant UX Phase 2I — multi-turn result semantics.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2iAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { deriveCollectionItems } from './components/presentation/deriveCollectionItems'
import { messageWithoutDuplicateCollectionList } from './components/presentation/suppressDuplicateCollectionList'
import {
  isSelectionPresentationUtterance,
  selectCombinedChronologicalTopK,
  selectPresentationResultRefs,
} from './components/presentation/selectPresentationResultRefs'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2i-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const W1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const W2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const W3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const S1 = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'

function turn(
  message: string,
  references: AssistantReference[],
): AssistantPresentationTurn {
  return { message, status: 'answer', references }
}

const top3Mixed: AssistantReference[] = [
  {
    id: 'w1',
    kind: 'wedding',
    label: 'Martyna Napieralska i Damian Urbański',
    detail: '2026-09-17',
    entityId: W1,
    actions: [{ type: 'open_wedding', weddingId: W1 }],
  },
  {
    id: 'w2',
    kind: 'wedding',
    label: 'Karolina Kot i Jan Wojciechowski',
    detail: '2026-09-19',
    entityId: W2,
    actions: [{ type: 'open_wedding', weddingId: W2 }],
  },
  {
    id: 's1',
    kind: 'session',
    label: 'Sesja produktowa — katalog Jesień',
    detail: '2026-10-05',
    entityId: S1,
    actions: [{ type: 'open_session', sessionId: S1 }],
  },
]

const evidenceWithWinner: AssistantReference[] = [
  {
    id: 'w3',
    kind: 'wedding',
    label: 'Ccx Xxcx i Hdhshs Jdjsnz',
    detail: '2026-11-30',
    entityId: W3,
    actions: [{ type: 'open_wedding', weddingId: W3 }],
  },
  {
    id: 's1',
    kind: 'session',
    label: 'Sesja produktowa — katalog Jesień',
    detail: '2026-10-05',
    entityId: S1,
    actions: [{ type: 'open_session', sessionId: S1 }],
  },
]

describe('Assistant UX 2I result semantics', () => {
  it('combined top-K is globally chronological (Oct 5 before Nov 30)', () => {
    const candidates = [
      { id: 'w1', date: '2026-09-17', kind: 'wedding' as const },
      { id: 'w2', date: '2026-09-19', kind: 'wedding' as const },
      { id: 'w3', date: '2026-11-30', kind: 'wedding' as const },
      { id: 's1', date: '2026-10-05', kind: 'session' as const },
    ]
    const top = selectCombinedChronologicalTopK(candidates, 3)
    expect(top.map((c) => c.id)).toEqual(['w1', 'w2', 's1'])
    expect(top.map((c) => c.date)).toEqual([
      '2026-09-17',
      '2026-09-19',
      '2026-10-05',
    ])
    expect(top.some((c) => c.id === 'w3')).toBe(false)
  })

  it('follow-up soft wording still uses collection UI when structured results ≥2', () => {
    const original = turn(
      'Jasne — wliczając wesela i sesje, trzy najbliższe zlecenia to:\n\n1. 17.09.2026 — Martyna Napieralska i Damian Urbański\n2. 19.09.2026 — Karolina Kot i Jan Wojciechowski\n3. 05.10.2026 — Sesja produktowa — katalog Jesień',
      top3Mixed,
    )
    const snapshot = JSON.stringify(original)

    const plan = derivePresentationDisplayPlan({
      utterance: 'mam na myśli wesela i sesje razem',
      presentationTurn: original,
      previousEffectiveIntent: 'collection',
    })
    expect(plan.mode).toBe('collection')
    expect(plan.displayReferences).toHaveLength(3)
    const items = deriveCollectionItems(plan.displayReferences)
    expect(items.map((i) => i.date)).toEqual([
      '2026-09-17',
      '2026-09-19',
      '2026-10-05',
    ])
    expect(items.some((i) => i.kind === 'session')).toBe(true)
    expect(
      items.find((i) => i.kind === 'session')?.action?.type,
    ).toBe('open_session')

    const prose = messageWithoutDuplicateCollectionList(
      original.message,
      top3Mixed.map((r) => r.label!).filter(Boolean),
    )
    expect(prose.suppressed).toBe(true)
    expect(prose.text).not.toContain('17.09.2026')
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('selection query: evidence [wedding,session] → display wedding only', () => {
    expect(isSelectionPresentationUtterance('a które jest najdroższe?')).toBe(
      true,
    )
    const original = turn(
      'Najdroższe jest wesele Ccx Xxcx i Hdhshs Jdjsnz — 10 400 PLN (30.11.2026).',
      evidenceWithWinner,
    )
    const snapshot = JSON.stringify(original)

    const selection = selectPresentationResultRefs({
      utterance: 'a które jest najdroższe?',
      evidenceReferences: evidenceWithWinner,
      selectionQuery: true,
    })
    expect(selection.evidenceReferences).toHaveLength(2)
    expect(selection.resultReferences).toHaveLength(1)
    expect(selection.resultReferences[0]?.entityId).toBe(W3)
    expect(selection.cardinality).toBe('one')

    const plan = derivePresentationDisplayPlan({
      utterance: 'a które jest najdroższe?',
      presentationTurn: original,
      previousEffectiveIntent: 'collection',
    })
    expect(plan.mode).toBe('context_cards')
    expect(plan.displayReferences).toHaveLength(1)
    expect(plan.displayReferences[0]?.kind).toBe('wedding')
    expect(plan.displayReferences[0]?.entityId).toBe(W3)
    expect(
      plan.displayReferences.some((r) => r.kind === 'session'),
    ).toBe(false)
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('never infers display membership solely from evidence count for selection', () => {
    const evidence = [...top3Mixed, evidenceWithWinner[0]!]
    const selection = selectPresentationResultRefs({
      utterance: 'które jest najdroższe?',
      evidenceReferences: evidence,
      selectionQuery: true,
    })
    // Multiple weddings in evidence — suppress structured dump (prose owns answer)
    expect(selection.resultReferences).toHaveLength(0)
    expect(selection.cardinality).toBe('zero')
  })

  it('phone inheritance + geometry + open_session preserved; markers', () => {
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
    expect(transcript).toContain('previousEffectiveIntent')

    const collection = readSrc(
      'src/features/assistant/components/presentation/AssistantCollectionResult.tsx',
    )
    expect(collection).toContain('data-phase="2h2"')
    expect(collection).toContain('deriveCollectionItems')
    const itemsHelper = readSrc(
      'src/features/assistant/components/presentation/deriveCollectionItems.ts',
    )
    expect(itemsHelper).toContain("a.type === 'open_wedding' || a.type === 'open_session'")

    const projection = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(projection).toContain('Phase 2I')
    // describe collections always projected (not gated solely behind else-of-aggregate)
    expect(projection).toMatch(
      /projectCollectionFromDescribe\([\s\S]*?\n  \)/,
    )

    const prompt = readSrc('src/features/assistant/v7/agent/prompt.ts')
    expect(prompt).toContain('top-K')
    expect(prompt).toContain('select_nearest_assignments')
    expect(prompt).toContain('PO merge')
  })

  it('writes multi-turn visual fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const followUp = derivePresentationDisplayPlan({
      utterance: 'mam na myśli wesela i sesje razem',
      presentationTurn: turn('Trzy najbliższe zlecenia:', top3Mixed),
    })
    const winner = derivePresentationDisplayPlan({
      utterance: 'a które jest najdroższe?',
      presentationTurn: turn(
        'Najdroższe jest wesele Ccx — 10 400 PLN.',
        evidenceWithWinner,
      ),
    })
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2I</title></head><body>
<div data-phase="2i1" data-fixture="follow-up-collection" data-mode="${followUp.mode}" data-count="${followUp.displayReferences.length}"></div>
<div data-phase="2i1" data-fixture="single-winner" data-mode="${winner.mode}" data-count="${winner.displayReferences.length}" data-kind="${winner.displayReferences[0]?.kind ?? ''}"></div>
</body></html>`
    writeFileSync(join(outDir, 'multi-turn-result-semantics.html'), html)
    expect(html).toContain('data-mode="collection"')
    expect(html).toContain('data-count="3"')
    expect(html).toContain('data-mode="context_cards"')
    expect(html).toContain('data-count="1"')
    expect(html).toContain('data-kind="wedding"')
  })
})
