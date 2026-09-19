/**
 * Assistant UX Phase 2G — empty welcome + collection + theme send.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2gAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { formatCollectionDateParts } from './components/presentation/AssistantCollectionResult'
import { messageWithoutDuplicateCollectionList } from './components/presentation/suppressDuplicateCollectionList'
import type {
  AssistantPresentationTurn,
  AssistantReference,
} from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2g-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const W1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const W2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const W3 = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'

function turn(
  message: string,
  references: AssistantReference[],
): AssistantPresentationTurn {
  return { message, status: 'answer', references }
}

describe('Assistant UX 2G', () => {
  it('empty state: no discovery; welcome orb + prompt', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('assistant-empty-welcome')
    expect(surface).toContain('ASSISTANT_EMPTY_PROMPT')
    expect(surface).toContain('AssistantThinkingOrb')
    expect(surface).toContain('variant="hero"')
    expect(surface).toContain('placement="dock"')
    expect(surface).not.toContain('assistant-suggestion')
    expect(surface).not.toContain('ASSISTANT_EXAMPLE_GROUPS')
    expect(surface).not.toMatch(/Znajdź|Sprawdź/)
    const orb = readSrc(
      'src/features/assistant/components/AssistantThinkingOrb.tsx',
    )
    expect(orb).toContain('size={64}')
    expect(orb).toContain("ASSISTANT_HERO_ORB_STATE")
    expect(orb).not.toMatch(/transform:\s*scale/)
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('.emptyHero')
    expect(css).toContain('.thinkingOrbHero')
    expect(css).not.toContain('transform: scale(1.4)')
    const copy = readSrc('src/features/assistant/copy.ts')
    expect(copy).toContain("ASSISTANT_TITLE = 'OurWed Assistant'")
    expect(copy).toContain("ASSISTANT_EMPTY_PROMPT = 'Jak mogę Ci pomóc?'")
    expect(copy).toContain("ASSISTANT_PLACEHOLDER_EMPTY = 'Zapytaj o cokolwiek…'")
  })

  it('theme-aware send token chain', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('--assistant-send-bg: var(--button-primary-background, var(--color-accent))')
    expect(css).toContain('--assistant-send-fg: var(--button-primary-text, var(--text-inverse, #fff))')
    expect(css).toContain('background: var(--assistant-send-bg)')
    expect(css).not.toMatch(
      /\.sendIconButton\s*\{[^}]*background:\s*var\(--color-text-primary/,
    )
    expect(css).not.toMatch(/\.sendIconButton:not\(:disabled\):hover[^}]*#000/)
  })

  it('collection intent + 3 wedding rows', () => {
    expect(
      classifyPresentationIntent('jakie mam zlecenia do końca roku?'),
    ).toBe('collection')
    const refs: AssistantReference[] = [
      {
        id: '1',
        kind: 'wedding',
        label: 'Martyna Napieralska i Damian Urbański',
        detail: '2026-09-17',
        entityId: W1,
        actions: [{ type: 'open_wedding', weddingId: W1 }],
      },
      {
        id: '2',
        kind: 'wedding',
        label: 'Karolina Kot i Jan Wojciechowski',
        detail: '2026-09-19',
        entityId: W2,
        actions: [{ type: 'open_wedding', weddingId: W2 }],
      },
      {
        id: '3',
        kind: 'wedding',
        label: 'Ccx Xxcx i Hdhshs Jdjsnz',
        detail: '2026-11-30',
        entityId: W3,
        actions: [{ type: 'open_wedding', weddingId: W3 }],
      },
    ]
    const plan = derivePresentationDisplayPlan({
      utterance: 'jakie mam zlecenia do końca roku?',
      presentationTurn: turn(
        'Do końca roku masz **3 wesela**.\n\n- 17.09.2026 — Martyna Napieralska i Damian Urbański\n- 19.09.2026 — Karolina Kot i Jan Wojciechowski\n- 30.11.2026 — Ccx Xxcx i Hdhshs Jdjsnz',
        refs,
      ),
    })
    expect(plan.mode).toBe('collection')
    expect(plan.displayReferences).toHaveLength(3)
    expect(formatCollectionDateParts('2026-09-17')).toEqual({
      day: '17',
      month: 'WRZ',
    })
    const suppressed = messageWithoutDuplicateCollectionList(
      plan.displayReferences[0]
        ? 'Do końca roku masz **3 wesela**.\n\n- 17.09.2026 — Martyna Napieralska i Damian Urbański\n- 19.09.2026 — Karolina Kot i Jan Wojciechowski\n- 30.11.2026 — Ccx Xxcx i Hdhshs Jdjsnz'
        : '',
      refs.map((r) => r.label!).filter(Boolean),
    )
    expect(suppressed.suppressed).toBe(true)
    expect(suppressed.text).toContain('3 wesela')
    expect(suppressed.text).not.toContain('17.09.2026')
  })

  it('1 wedding stays context_cards; aggregate stays prose', () => {
    const one = derivePresentationDisplayPlan({
      utterance: 'opowiedz o ślubie Martyny',
      presentationTurn: turn('Ślub Martyny.', [
        {
          id: '1',
          kind: 'wedding',
          label: 'Martyna',
          entityId: W1,
          actions: [{ type: 'open_wedding', weddingId: W1 }],
        },
      ]),
    })
    expect(one.mode).toBe('context_cards')
    expect(one.displayReferences).toHaveLength(1)

    const agg = derivePresentationDisplayPlan({
      utterance: 'ile mam wesel w tym miesiącu?',
      presentationTurn: turn('Masz 4 wesela we wrześniu.', [
        {
          id: '1',
          kind: 'wedding',
          entityId: W1,
          actions: [{ type: 'open_wedding', weddingId: W1 }],
        },
        {
          id: '2',
          kind: 'wedding',
          entityId: W2,
          actions: [{ type: 'open_wedding', weddingId: W2 }],
        },
      ]),
    })
    expect(agg.intent).toBe('aggregate')
    expect(agg.mode).toBe('direct_inline')
    expect(agg.displayReferences).toHaveLength(0)
  })

  it('distance: navigate only; wedding suppressed', () => {
    expect(classifyPresentationIntent('daleko do nich mam?')).toBe('distance')
    const plan = derivePresentationDisplayPlan({
      utterance: 'daleko do nich mam?',
      presentationTurn: turn('Dojazd zajmuje około 45 minut.', [
        {
          id: 'w',
          kind: 'wedding',
          label: 'Martyna',
          entityId: W1,
          actions: [{ type: 'open_wedding', weddingId: W1 }],
        },
        {
          id: 'a',
          kind: 'address',
          label: 'Sala',
          actions: [
            { type: 'navigate_address', address: 'ul. Test 1, Poznań' },
          ],
        },
      ]),
    })
    expect(plan.mode).toBe('direct_inline')
    expect(plan.inlineActions.map((a) => a.type)).toEqual(['navigate_address'])
    expect(plan.displayReferences).toHaveLength(0)
  })

  it('writes visual QA fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2G QA</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;margin:0 auto 24px;background:#f7f3ec;border-radius:24px;border:1px solid rgba(44,38,34,.06);min-height:520px;display:flex;flex-direction:column}
.hdr{height:60px;display:flex;justify-content:flex-end;align-items:center;padding:0 30px;border-bottom:1px solid rgba(44,38,34,.04)}
.welcome{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(-6%)}
.orb{width:28px;height:28px;border-radius:50%;border:1.5px solid rgba(44,38,34,.35);margin-bottom:18px}
.prompt{font-size:23px;font-weight:525;letter-spacing:-.02em;margin:0 0 26px}
.composer{width:640px;max-width:100%;min-height:56px;border:1px solid rgba(44,38,34,.1);border-radius:16px;display:flex;align-items:center;padding:7px;gap:10px;background:color-mix(in srgb,#ebe4d8 68%,#f7f3ec)}
.send{width:42px;height:42px;border:0;border-radius:12px;background:var(--button-primary-background,var(--color-accent,#0a0a0a));color:#fff}
.row{display:grid;grid-template-columns:3.75rem 1fr 18px;gap:10px;min-height:54px;align-items:center;padding:8px 10px;border-radius:11px}
.day{font-weight:650}.mon{font-size:11px;letter-spacing:.06em;color:#8a8078}
</style></head><body>
<div class="panel" data-phase="2g" data-mode="empty"><div class="hdr">×</div>
<div class="welcome" data-testid="empty"><div class="orb"></div><p class="prompt">Jak mogę Ci pomóc?</p>
<div class="composer"><span style="opacity:.55;flex:1">Zapytaj o cokolwiek…</span><button class="send">↑</button></div></div></div>
<div class="panel" data-mode="conversation" style="min-height:auto;padding:20px 32px">
<p>Do końca roku masz <strong>3 wesela</strong>.</p>
<div class="row"><div><div class="day">17</div><div class="mon">WRZ</div></div><div>Martyna Napieralska i Damian Urbański</div><div>›</div></div>
<div class="row"><div><div class="day">19</div><div class="mon">WRZ</div></div><div>Karolina Kot i Jan Wojciechowski</div><div>›</div></div>
<div class="row"><div><div class="day">30</div><div class="mon">LIS</div></div><div>Ccx Xxcx i Hdhshs Jdjsnz</div><div>›</div></div>
</div>
</body></html>`
    writeFileSync(join(outDir, 'empty-and-collection.html'), html)
    expect(html).not.toMatch(/\bZnajdź\b|\bSprawdź\b/)
    expect(html).toContain('Jak mogę Ci pomóc?')
    expect(html).toContain('--button-primary-background')
  })
})
