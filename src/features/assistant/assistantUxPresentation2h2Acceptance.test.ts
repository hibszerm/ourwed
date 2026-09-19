/**
 * Assistant UX Phase 2H.2 — unified chronological mixed collection results.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2h2Acceptance.test.ts
 */

import { describe, expect, it, vi } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { deriveCollectionItems } from './components/presentation/deriveCollectionItems'
import {
  formatCollectionDateParts,
} from './components/presentation/AssistantCollectionResult'
import { messageWithoutDuplicateCollectionList } from './components/presentation/suppressDuplicateCollectionList'
import {
  executeAssistantAction,
} from './v7/presentation/executeAssistantAction'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2h2-visual')

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

const mixedRefs: AssistantReference[] = [
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
    label: 'Sesja produktowa „katalog Jesień”',
    detail: '2026-10-05',
    entityId: S1,
    actions: [{ type: 'open_session', sessionId: S1 }],
  },
  {
    id: 'w3',
    kind: 'wedding',
    label: 'Ccx Xxcx i Hdhshs Jdjsnz',
    detail: '2026-11-30',
    entityId: W3,
    actions: [{ type: 'open_wedding', weddingId: W3 }],
  },
]

describe('Assistant UX 2H.2 mixed collection', () => {
  it('mixed results: count, chronological sort, shared row component', () => {
    expect(
      classifyPresentationIntent('jakie mam zlecenia do końca roku?'),
    ).toBe('collection')

    const original = turn(
      'Do końca roku masz zapisane:\n\nWesela\n\nSesja\n\n- 05.10 — Sesja produktowa „katalog Jesień”',
      mixedRefs,
    )
    const snapshot = JSON.stringify(original)

    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam zlecenia do końca roku?',
      presentationTurn: original,
    })
    expect(plan.mode).toBe('collection')
    expect(plan.displayReferences).toHaveLength(4)

    const items = deriveCollectionItems(plan.displayReferences)
    expect(items).toHaveLength(4)
    expect(items.map((i) => i.date)).toEqual([
      '2026-09-17',
      '2026-09-19',
      '2026-10-05',
      '2026-11-30',
    ])
    expect(items.map((i) => i.kind)).toEqual([
      'wedding',
      'wedding',
      'session',
      'wedding',
    ])
    expect(items.map((i) => i.typeLabel)).toEqual([
      'Ślub',
      'Ślub',
      'Sesja',
      'Ślub',
    ])
    expect(formatCollectionDateParts('2026-10-05')).toEqual({
      day: '5',
      month: 'PAŹ',
    })

    // Shared row component — no separate session bullet path
    const collectionSrc = readSrc(
      'src/features/assistant/components/presentation/AssistantCollectionResult.tsx',
    )
    expect(collectionSrc).toContain('deriveCollectionItems')
    expect(collectionSrc).toContain('data-phase="2h2"')
    expect(collectionSrc).toContain('collectionType')
    expect(collectionSrc).not.toMatch(/bullet|unordered_list/)

    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('no Wesela/Sesja section headings; session interactive via trusted action', () => {
    const labels = mixedRefs.map((r) => r.label!).filter(Boolean)
    const prose = messageWithoutDuplicateCollectionList(
      'Do końca roku masz 4 zlecenia:\n\nWesela\n\nSesja\n\n- 05.10 — Sesja produktowa „katalog Jesień”\n- 17.09 — Martyna Napieralska i Damian Urbański',
      labels,
    )
    expect(prose.suppressed).toBe(true)
    expect(prose.text.toLowerCase()).not.toMatch(/^wesela$/m)
    expect(prose.text).not.toMatch(/\bWesela\b/)
    expect(prose.text).not.toMatch(/^Sesja$/m)
    expect(prose.text).not.toContain('Sesja produktowa')

    const items = deriveCollectionItems(mixedRefs)
    const session = items.find((i) => i.kind === 'session')!
    expect(session.action).toEqual({ type: 'open_session', sessionId: S1 })
    const wedding = items[0]!
    expect(wedding.action).toEqual({ type: 'open_wedding', weddingId: W1 })

    const navigate = vi.fn()
    const sResult = executeAssistantAction(session.action!, {
      apply: true,
      navigate,
    })
    expect(sResult).toEqual({
      ok: true,
      mode: 'navigate',
      path: `/sesje/${S1}`,
    })
    expect(navigate).toHaveBeenCalledWith(`/sesje/${S1}`)

    const wResult = executeAssistantAction(wedding.action!, {
      apply: false,
    })
    expect(wResult).toEqual({
      ok: true,
      mode: 'navigate',
      path: `/sluby/${W1}`,
    })
  })

  it('no action invented from prose; single entity stays context card', () => {
    const proseOnly = turn(
      'Masz sesję produktową „katalog Jesień” 05.10.2026.',
      [],
    )
    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam zlecenia do końca roku?',
      presentationTurn: proseOnly,
    })
    expect(plan.mode).not.toBe('collection')
    expect(plan.displayReferences).toHaveLength(0)

    const single = derivePresentationDisplayPlan({
      utterance: 'jaki mam jutro ślub?',
      presentationTurn: turn('Jutro ślub Martyny.', [
        {
          id: '1',
          kind: 'wedding',
          label: 'Martyna Napieralska i Damian Urbański',
          detail: '2026-09-17',
          entityId: W1,
          actions: [{ type: 'open_wedding', weddingId: W1 }],
        },
      ]),
    })
    expect(single.mode).toBe('context_cards')
    expect(single.displayReferences).toHaveLength(1)

    const nearestSession = derivePresentationDisplayPlan({
      utterance: 'jaka jest moja najbliższa sesja?',
      presentationTurn: turn('Najbliższa sesja.', [
        {
          id: 's',
          kind: 'session',
          label: 'Sesja produktowa „katalog Jesień”',
          detail: '2026-10-05',
          entityId: S1,
          actions: [{ type: 'open_session', sessionId: S1 }],
        },
      ]),
    })
    expect(nearestSession.mode).toBe('context_cards')
    expect(nearestSession.displayReferences).toHaveLength(1)
  })

  it('phone behavior + modal geometry unchanged; projection accumulate present', () => {
    const phone = derivePresentationDisplayPlan({
      utterance: 'podaj jej numer',
      presentationTurn: turn('Numer Martyny: 731 435 667.', [
        {
          id: 'p',
          kind: 'phone',
          label: 'Telefon panny młodej',
          actions: [
            { type: 'call_phone', phone: '731435667' },
            { type: 'send_sms', phone: '731435667' },
          ],
        },
      ]),
    })
    expect(phone.mode).toBe('direct_inline')
    expect(phone.inlineActions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])

    const inherited = derivePresentationDisplayPlan({
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
    expect(inherited.intent).toBe('phone')
    expect(inherited.inherited).toBe(true)
    expect(inherited.mode).toBe('direct_inline')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('grid-template-rows: 64px minmax(0, 1fr) auto')
    expect(css).toContain('.collectionType')
    expect(css).toMatch(/\.collectionList\s*\{[^}]*border-radius:\s*15px/s)

    const projection = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(projection).toContain('Phase 2H.2')
    expect(projection).toContain('totalEmitted')
    expect(projection).not.toMatch(/if \(emitted >= 2\) return/)

    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(transcript).toContain('data-phase="2i1"')
    expect(transcript).toContain('previousEffectiveIntent')
  })

  it('weddings-only and sessions-only use same collection mode', () => {
    const weddingsOnly = derivePresentationDisplayPlan({
      utterance: 'jakie mam wesela do końca roku?',
      presentationTurn: turn('Do końca roku masz 3 wesela.', [
        mixedRefs[0]!,
        mixedRefs[1]!,
        mixedRefs[3]!,
      ]),
    })
    expect(weddingsOnly.mode).toBe('collection')
    expect(weddingsOnly.displayReferences.every((r) => r.kind === 'wedding')).toBe(
      true,
    )

    const sessionsOnly = derivePresentationDisplayPlan({
      utterance: 'jakie mam sesje do końca roku?',
      presentationTurn: turn('Masz 2 sesje.', [
        {
          id: 's1',
          kind: 'session',
          label: 'Sesja A',
          detail: '2026-10-05',
          entityId: S1,
          actions: [{ type: 'open_session', sessionId: S1 }],
        },
        {
          id: 's2',
          kind: 'session',
          label: 'Sesja B',
          detail: '2026-11-01',
          entityId: W3,
          actions: [{ type: 'open_session', sessionId: W3 }],
        },
      ]),
    })
    expect(sessionsOnly.mode).toBe('collection')
    expect(
      sessionsOnly.displayReferences.every((r) => r.kind === 'session'),
    ).toBe(true)
  })

  it('writes visual + interaction fixtures', () => {
    mkdirSync(outDir, { recursive: true })
    const items = deriveCollectionItems(mixedRefs)
    const rows = items
      .map((i) => {
        const d = formatCollectionDateParts(i.date)!
        return `<button class="row" data-kind="${i.kind}" data-action="${i.action?.type}" data-interactive="true">
  <div class="date"><div class="day">${d.day}</div><div class="mon">${d.month}</div></div>
  <div class="title">${i.title}</div>
  <div class="type">${i.typeLabel}</div>
  <div class="chev">›</div>
</button>`
      })
      .join('\n')
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2H.2</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;height:700px;margin:0 auto;background:#f7f3ec;border-radius:24px;display:grid;grid-template-rows:64px 1fr auto;overflow:hidden}
.hdr{display:flex;align-items:center;padding:0 32px;font-weight:600;border-bottom:1px solid rgba(44,38,34,.04)}
.body{padding:24px 32px;overflow:auto}
.list{border:1px solid rgba(44,38,34,.08);border-radius:15px;overflow:hidden;margin-top:8px}
.row{display:grid;grid-template-columns:76px 1fr auto 16px;gap:12px;align-items:center;width:100%;min-height:70px;padding:12px 14px;border:0;border-top:1px solid rgba(44,38,34,.06);background:transparent;text-align:left;font:inherit;color:inherit;cursor:pointer}
.row:first-child{border-top:0}
.day{font-size:19px;font-weight:600}.mon{font-size:11px;letter-spacing:.08em;color:#8a8078;font-weight:600}
.title{font-size:15px;font-weight:575;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.type{font-size:12.25px;font-weight:500;color:#8a8078}
.chev{opacity:.7}
.dock{padding:16px 32px 20px;border-top:1px solid rgba(44,38,34,.04)}
.composer{min-height:54px;border-radius:27px;border:1px solid rgba(44,38,34,.06);display:flex;align-items:center;padding:0 20px}
</style></head><body>
<div class="panel" data-phase="2h2" data-workspace="fixed" data-fixture="mixed-zlecenia">
  <div class="hdr">OurWed Assistant</div>
  <div class="body">
    <p>Do końca roku masz 4 zlecenia:</p>
    <div class="list" data-testid="assistant-collection" data-kind="mixed">${rows}</div>
  </div>
  <div class="dock"><div class="composer">Zapytaj o zlecenie…</div></div>
</div>
</body></html>`
    writeFileSync(join(outDir, 'mixed-collection.html'), html)
    expect(html).toContain('data-phase="2h2"')
    expect(html).toContain('data-kind="mixed"')
    expect(html).toContain('data-kind="session"')
    expect(html).toContain('data-action="open_session"')
    expect(html).toContain('data-action="open_wedding"')
    expect(html).not.toContain('Wesela')
    expect(html).not.toContain('<p>Sesja</p>')
    expect(html).toContain('<div class="type">Sesja</div>')
    expect(html).toContain('<div class="type">Ślub</div>')
    expect(html.indexOf('Martyna')).toBeLessThan(html.indexOf('katalog Jesień'))
    expect(html.indexOf('katalog Jesień')).toBeLessThan(html.indexOf('Ccx Xxcx'))
  })
})
