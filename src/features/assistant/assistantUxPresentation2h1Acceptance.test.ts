/**
 * Assistant UX Phase 2H.1 — elliptical phone follow-up presentation continuity.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2h1Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import {
  isEllipticalPresentationFollowUp,
  resolveEffectivePresentationIntent,
  INHERITABLE_PRESENTATION_INTENTS,
} from './components/presentation/resolveEffectivePresentationIntent'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2h1-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const WEDDING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

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

const damianPhoneRefs: AssistantReference[] = [
  {
    id: 'w1',
    kind: 'wedding',
    label: 'Martyna Napieralska i Damian Urbański',
    detail: 'Zlecenie',
    entityId: WEDDING,
    actions: [
      { type: 'open_wedding', weddingId: WEDDING },
      { type: 'open_calendar', date: '2026-09-17' },
    ],
  },
  {
    id: 'p1',
    kind: 'phone',
    label: 'Telefon pana młodego',
    actions: [
      { type: 'call_phone', phone: '692589570' },
      { type: 'send_sms', phone: '692589570' },
    ],
  },
]

const martynaPhoneRefs: AssistantReference[] = [
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

describe('Assistant UX 2H.1 follow-up presentation intent', () => {
  it('root cause: "a jego?" is general without inheritance', () => {
    expect(classifyPresentationIntent('a jego?')).toBe('general')
    expect(classifyPresentationIntent('a jej numer tel?')).toBe('phone')
    expect(isEllipticalPresentationFollowUp('a jego?')).toBe(true)
    expect(isEllipticalPresentationFollowUp('a jej?')).toBe(true)
    expect(isEllipticalPresentationFollowUp('co mam jutro?')).toBe(false)
    expect(INHERITABLE_PRESENTATION_INTENTS.has('phone')).toBe(true)
  })

  it('CASE A — explicit phone (Martyna) unchanged', () => {
    const original = turn('Numer Martyny: 731 435 667.', martynaPhoneRefs)
    const snapshot = JSON.stringify(original)
    const plan = derivePresentationDisplayPlan({
      utterance: 'a jej numer tel?',
      presentationTurn: original,
    })
    expect(plan.rawIntent).toBe('phone')
    expect(plan.intent).toBe('phone')
    expect(plan.inherited).toBe(false)
    expect(plan.mode).toBe('direct_inline')
    expect(plan.displayReferences).toHaveLength(0)
    expect(actionTypes(plan)).toEqual(['call_phone', 'send_sms'])
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('CASE B — elliptical "a jego?" inherits PHONE; no cards; contract intact', () => {
    const original = turn('Numer Damiana: 692 589 570.', damianPhoneRefs)
    const snapshot = JSON.stringify(original)

    const resolved = resolveEffectivePresentationIntent({
      utterance: 'a jego?',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.rawIntent).toBe('general')
    expect(resolved.effectiveIntent).toBe('phone')
    expect(resolved.inherited).toBe(true)

    const plan = derivePresentationDisplayPlan({
      utterance: 'a jego?',
      presentationTurn: original,
      previousEffectiveIntent: 'phone',
    })
    expect(plan.rawIntent).toBe('general')
    expect(plan.intent).toBe('phone')
    expect(plan.inherited).toBe(true)
    expect(plan.mode).toBe('direct_inline')
    expect(plan.displayReferences).toHaveLength(0)
    expect(actionTypes(plan)).toEqual(['call_phone', 'send_sms'])
    expect(actionTypes(plan)).not.toContain('open_wedding')
    expect(actionTypes(plan)).not.toContain('open_calendar')
    // Original contract still has wedding + phone + open actions
    expect(original.references?.map((r) => r.kind).sort()).toEqual([
      'phone',
      'wedding',
    ])
    expect(
      original.references?.some((r) =>
        r.actions.some((a) => a.type === 'open_wedding'),
      ),
    ).toBe(true)
    expect(JSON.stringify(original)).toBe(snapshot)
  })

  it('CASE B without previous intent still falls back (no silent phone mode)', () => {
    const original = turn('Numer Damiana: 692 589 570.', damianPhoneRefs)
    const plan = derivePresentationDisplayPlan({
      utterance: 'a jego?',
      presentationTurn: original,
      previousEffectiveIntent: null,
    })
    expect(plan.intent).toBe('general')
    expect(plan.mode).toBe('fallback')
    expect(plan.displayReferences.length).toBeGreaterThan(0)
  })

  it('CASE C — explicit address overrides prior phone', () => {
    const resolved = resolveEffectivePresentationIntent({
      utterance: 'a jaki ma adres?',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.rawIntent).toBe('address')
    expect(resolved.effectiveIntent).toBe('address')
    expect(resolved.inherited).toBe(false)
  })

  it('CASE D — open wedding overrides prior phone', () => {
    const resolved = resolveEffectivePresentationIntent({
      utterance: 'otwórz zlecenie',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.rawIntent).toBe('wedding')
    expect(resolved.effectiveIntent).toBe('wedding')
    expect(resolved.inherited).toBe(false)
  })

  it('CASE E — tomorrow/calendar overrides prior phone', () => {
    const resolved = resolveEffectivePresentationIntent({
      utterance: 'co mam jutro?',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.rawIntent).toBe('calendar')
    expect(resolved.effectiveIntent).toBe('calendar')
    expect(resolved.inherited).toBe(false)
  })

  it('CASE F — "jaki?" is not a phone elliptical inherit', () => {
    expect(isEllipticalPresentationFollowUp('jaki?')).toBe(false)
    const resolved = resolveEffectivePresentationIntent({
      utterance: 'jaki?',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.effectiveIntent).toBe('general')
    expect(resolved.inherited).toBe(false)
  })

  it('chained follow-up "a drugi?" inherits phone', () => {
    const resolved = resolveEffectivePresentationIntent({
      utterance: 'a drugi?',
      previousEffectiveIntent: 'phone',
    })
    expect(resolved.inherited).toBe(true)
    expect(resolved.effectiveIntent).toBe('phone')
  })

  it('long transcript: linear previous-intent wiring present; no nested full rescan helper', () => {
    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(transcript).toContain('previousEffectiveIntent')
    expect(transcript).toContain('data-phase="2i1"')
    expect(transcript).toContain('data-display-inherited')
    expect(transcript).toContain('derivePresentationDisplayPlan({')
    // Single forward pass over entries (not nested full-history rescans)
    expect(transcript).toMatch(/for \(let index = 0; index < entries\.length/)
    expect(transcript).not.toContain('entries.forEach((entry')

    // Simulate 100 prior phone turns then elliptical follow-up — O(n) intent chain
    let prev: ReturnType<typeof resolveEffectivePresentationIntent>['effectiveIntent'] | null =
      null
    for (let i = 0; i < 100; i += 1) {
      const r = resolveEffectivePresentationIntent({
        utterance: i === 0 ? 'podaj jej numer telefonu' : 'a jego?',
        previousEffectiveIntent: prev,
      })
      prev = r.effectiveIntent
    }
    expect(prev).toBe('phone')
  })

  it('writes Damian follow-up visual fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const plan = derivePresentationDisplayPlan({
      utterance: 'a jego?',
      presentationTurn: turn('Numer Damiana: 692 589 570.', damianPhoneRefs),
      previousEffectiveIntent: 'phone',
    })
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2H.1</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;height:700px;margin:0 auto;background:#f7f3ec;border-radius:24px;display:grid;grid-template-rows:64px 1fr auto;overflow:hidden}
.hdr{display:flex;align-items:center;padding:0 32px;font-weight:600;border-bottom:1px solid rgba(44,38,34,.04)}
.body{padding:24px 32px;overflow:auto}
.user{text-align:right;margin:12px 0}
.bubble{display:inline-block;padding:9px 13px;border-radius:15px;background:#ebe4d8}
.assistant{margin:16px 0}
.actions{display:flex;gap:8px;margin-top:10px}
.btn{padding:8px 14px;border-radius:999px;border:1px solid rgba(44,38,34,.12);background:#fff}
.meta{font-size:12px;opacity:.7;margin-top:12px}
.bad{opacity:.35;text-decoration:line-through}
</style></head><body>
<div class="panel" data-phase="2h1" data-workspace="fixed">
  <div class="hdr">OurWed Assistant</div>
  <div class="body">
    <div class="user"><span class="bubble">a jej numer tel?</span></div>
    <div class="assistant">Numer Martyny: 731 435 667.<div class="actions"><span class="btn">Zadzwoń</span><span class="btn">SMS</span></div></div>
    <div class="user"><span class="bubble">a jego?</span></div>
    <div class="assistant" data-display-intent="${plan.intent}" data-display-inherited="${plan.inherited}">
      Numer Damiana: 692 589 570.
      <div class="actions"><span class="btn">Zadzwoń</span><span class="btn">SMS</span></div>
      <p class="meta">display refs: ${plan.displayReferences.length} · actions: ${actionTypes(plan).join(', ')}</p>
      <p class="bad">Wedding card / Telefon pana młodego card — suppressed</p>
    </div>
  </div>
  <div style="padding:16px 32px 20px;border-top:1px solid rgba(44,38,34,.04)">
    <div style="min-height:54px;border-radius:27px;border:1px solid rgba(44,38,34,.06);display:flex;align-items:center;padding:0 20px">Zapytaj o zlecenie…</div>
  </div>
</div>
</body></html>`
    writeFileSync(join(outDir, 'damian-phone-followup.html'), html)
    expect(html).toContain('Numer Damiana: 692 589 570.')
    expect(html).toContain('data-display-intent="phone"')
    expect(html).toContain('data-display-inherited="true"')
    expect(html).not.toContain('Otwórz zlecenie')
  })

  it('Phase 2H geometry freeze markers unchanged', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).toContain('grid-template-rows: 64px minmax(0, 1fr) auto')
    expect(css).toMatch(/\.composer\s*\{[^}]*min-height:\s*54px/)
  })
})
