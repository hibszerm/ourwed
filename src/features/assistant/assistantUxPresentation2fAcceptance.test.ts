/**
 * Assistant UX Phase 2F — Premium Minimal × Compact acceptance.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2fAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { classifyPresentationIntent } from './components/presentation/classifyPresentationIntent'
import { derivePresentationDisplayPlan } from './components/presentation/derivePresentationDisplayPlan'
import { parseSafeMarkdown } from './components/presentation/parseSafeMarkdown'
import {
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
const outDir = join(root, 'tmp/assistant-ux-2f-visual')

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

describe('Assistant UX 2F — Premium Minimal × Compact', () => {
  it('PHASE_2F visual markers', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('min(780px, calc(100vw - 48px))')
    expect(css).toContain('calc(100dvh - 64px)')
    expect(css).toMatch(/\.panel\[data-mode='conversation'\][\s\S]*min-height:\s*0/)
    expect(css).toContain('padding: 9px 13px')
    expect(css).toContain('gap: 30px')
    expect(css).toContain('grid-template-columns: 3.5rem')
    expect(css).toContain('padding: 14px 16px')
    expect(css).toMatch(/\.composer\s*\{[^}]*border-radius:\s*27px/)
    // Phase 2G.1: soft contact elevation at rest; single theme focus ring
    expect(css).toMatch(/\.composer:focus-within\s*\{[^}]*0 0 0 2.5px/)
    expect(css).toContain('width: 42px')
    expect(css).toContain('height: 36px')
    expect(css).toContain('height: 38px')
    expect(css).toContain('scrollbar-width: thin')
    expect(css).not.toMatch(/avatar|thumbnail|background-image:\s*url/i)

    const processing = readSrc(
      'src/features/assistant/components/AssistantProcessingIndicator.tsx',
    )
    expect(processing).toContain('AssistantThinkingOrb')
    expect(processing).toContain("variant=\"processing\"")
    expect(readSrc('src/features/assistant/components/AssistantThinkingOrb.tsx')).toContain('size={20}')
    expect(readSrc('src/features/assistant/components/AssistantThinkingOrb.tsx')).toContain('size={64}')
    expect(processing).toContain('data-phase="2f"')

    const card = readSrc(
      'src/features/assistant/components/presentation/AssistantContextCard.tsx',
    )
    expect(card).not.toMatch(/<img|avatar|photo|thumbnail/i)
  })

  it('CASE — phone: prose + direct actions; no wedding card', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'podaj mi jej numer',
      presentationTurn: turn('Numer do Martyny: **731 435 667**.', [
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
      ]),
    })
    expect(classifyPresentationIntent('podaj mi jej numer')).toBe('phone')
    expect(plan.mode).toBe('direct_inline')
    expect(plan.inlineActions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])
    expect(plan.displayReferences).toHaveLength(0)
  })

  it('CASE — tomorrow: wedding context + schedule rows from suffix bullets', () => {
    const plan = derivePresentationDisplayPlan({
      utterance: 'Co mam jutro?',
      presentationTurn: turn(
        [
          'Jutro, 17 września, masz wesele Martyny.',
          '',
          '- przygotowania pana młodego: 12:30',
          '- przygotowania panny młodej: 14:00',
          '- ceremonia: 15:00',
        ].join('\n'),
        [
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
        ],
      ),
    })
    expect(plan.intent).toBe('calendar')
    expect(actionTypes(plan).sort()).toEqual(
      ['open_calendar', 'open_wedding'].sort(),
    )

    const blocks = parseSafeMarkdown(
      '- przygotowania pana młodego: 12:30\n- przygotowania panny młodej: 14:00\n- ceremonia: 15:00',
    )
    expect(blocks[0]?.type).toBe('unordered_list')
    const items =
      blocks[0]?.type === 'unordered_list' ? blocks[0].items : []
    const rows = scheduleRowsFromListItems(items)
    expect(rows).toHaveLength(3)
    expect(rows?.[0]).toEqual({
      time: '12:30',
      titleInlines: [{ type: 'text', value: 'przygotowania pana młodego' }],
    })
  })

  it('schedule: dash-only bullets without times stay lists', () => {
    expect(tryParseScheduleRow('- Przygotowania')).toBeNull()
    const blocks = parseSafeMarkdown('- Przygotowania\n- Ceremonia')
    const items =
      blocks[0]?.type === 'unordered_list' ? blocks[0].items : []
    expect(scheduleRowsFromListItems(items)).toBeNull()
  })

  it('schedule: prefix HH:MM still works', () => {
    const rows = scheduleRowsFromParagraphLines(
      '12:30 Przygotowania pana młodego\n14:00 Ceremonia',
    )
    expect(rows?.[0]?.time).toBe('12:30')
  })

  it('intelligence / contract / policy frozen', () => {
    const project = readSrc(
      'src/features/assistant/v7/presentation/projectV7Presentation.ts',
    )
    expect(project).toContain('projectV7PresentationTurn')
    const exec = readSrc(
      'src/features/assistant/v7/presentation/executeAssistantAction.ts',
    )
    expect(exec).toContain('executeAssistantAction')
    const policy = readSrc(
      'src/features/assistant/components/presentation/derivePresentationDisplayPlan.ts',
    )
    expect(policy).not.toContain('projectV7')
    expect(policy).toContain('cloneRef')
  })

  it('writes deterministic visual QA fixture HTML', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8"/>
<title>OurWed Assistant 2F Visual QA</title>
<style>
:root{--surface-primary:#f7f3ec;--app-background:#ebe4d8;--color-text-primary:#2c2622;--color-text-secondary:#5c534c;--color-text-tertiary:#8a8078;}
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#d9d0c4;color:var(--color-text-primary);}
.panel{width:780px;margin:24px auto;background:var(--surface-primary);border:1px solid rgba(44,38,34,.06);border-radius:24px;box-shadow:0 24px 56px -28px rgba(44,38,34,.32);overflow:hidden;display:flex;flex-direction:column;max-height:820px;}
.header{min-height:60px;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid rgba(44,38,34,.04);font-weight:600;font-size:16px;letter-spacing:-0.01em;}
.close{width:32px;height:32px;border-radius:999px;border:0;background:transparent;color:#8a8078;}
.scroll{padding:14px 32px 18px;overflow:auto;display:flex;flex-direction:column;gap:30px;}
.user{align-self:flex-end;max-width:70%;padding:9px 13px;border-radius:15px;border:1px solid rgba(44,38,34,.07);background:color-mix(in srgb,#ebe4d8 86%,#f7f3ec);font-size:14.5px;line-height:1.4;}
.assistant{max-width:680px;display:flex;flex-direction:column;gap:11px;font-size:15.5px;line-height:1.58;font-weight:400;}
.assistant strong{font-weight:650;}
.schedule{list-style:none;margin:4px 0;padding:0;display:flex;flex-direction:column;gap:10px;}
.schedule li{display:grid;grid-template-columns:3.5rem 1fr;gap:16px;}
.schedule time{font-weight:600;font-variant-numeric:tabular-nums;font-size:14px;}
.card{padding:14px 16px;border-radius:14px;border:1px solid rgba(44,38,34,.055);background:color-mix(in srgb,#ebe4d8 38%,#f7f3ec);}
.card h3{margin:0;font-size:14.5px;font-weight:600;}
.card p{margin:2px 0 0;font-size:12.5px;color:#8a8078;}
.actions{display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;}
.btn{height:36px;padding:0 12px;border-radius:9px;border:1px solid rgba(44,38,34,.09);background:color-mix(in srgb,#ebe4d8 28%,#f7f3ec);font:inherit;font-size:13px;font-weight:600;}
.btnDirect{height:38px;padding:0 13px;border-radius:10px;border:1px solid rgba(44,38,34,.12);background:color-mix(in srgb,#2c2622 5%,#f7f3ec);font:inherit;font-size:13px;font-weight:600;}
.loading{display:flex;align-items:center;gap:11px;font-size:14px;color:#5c534c;}
.orb{width:20px;height:20px;border-radius:50%;border:1.5px solid rgba(44,38,34,.35);opacity:.7;}
.dock{padding:14px 30px 18px;border-top:1px solid rgba(44,38,34,.045);}
.composer{min-height:56px;border:1px solid rgba(44,38,34,.1);border-radius:16px;background:color-mix(in srgb,#ebe4d8 68%,#f7f3ec);display:flex;align-items:center;padding:7px 7px 7px 16px;gap:10px;}
.composer:focus-within{box-shadow:0 0 0 2px rgba(44,38,34,.08);}
.send{width:42px;height:42px;border:0;border-radius:12px;background:#2c2622;color:#f7f3ec;}
.send[disabled]{background:rgba(44,38,34,.14);color:rgba(247,243,236,.82);}
.note{margin:16px auto;width:780px;font-size:12px;color:#5c534c;}
</style>
</head>
<body>
<div class="panel" data-phase="2f">
  <div class="header"><span>Zapytaj OurWed</span><button class="close" aria-label="Zamknij">×</button></div>
  <div class="scroll">
    <div class="user">Co mam jutro?</div>
    <div class="assistant">
      <div>Jutro, 17 września, masz wesele Martyny Napieralskiej i Damiana Urbańskiego w Kontrabas Sala Bankietowa.</div>
      <ul class="schedule">
        <li><time>12:30</time><span>Przygotowania pana młodego</span></li>
        <li><time>14:00</time><span>Przygotowania panny młodej</span></li>
        <li><time>15:00</time><span>Ceremonia</span></li>
      </ul>
      <div>Nie masz zapisanych sesji ani otwartych czy zaległych zadań na ten dzień.</div>
      <div class="card">
        <h3>♡  Martyna Napieralska i Damian Urbański</h3>
        <p>Zlecenie · 17 września 2026</p>
        <div class="actions"><button class="btn">Otwórz zlecenie</button><button class="btn">Otwórz kalendarz</button></div>
      </div>
    </div>
    <div class="user">podaj mi jej numer</div>
    <div class="assistant">
      <div>Numer do Martyny: <strong>731 435 667.</strong></div>
      <div class="actions"><button class="btnDirect">Zadzwoń</button><button class="btnDirect">SMS</button></div>
    </div>
    <div class="loading"><span class="orb" aria-hidden></span><span>Sprawdzam…</span></div>
  </div>
  <div class="dock"><div class="composer" tabindex="0"><span style="opacity:.55">Zapytaj o zlecenie, sesję, termin lub zadanie…</span><button class="send" disabled>↑</button></div></div>
</div>
<p class="note">2F visual QA fixture — no entity imagery or avatars; Thinking Orbs represented as 20px marker.</p>
</body>
</html>`
    writeFileSync(join(outDir, 'premium-minimal-compact.html'), html)
    expect(html).not.toMatch(/<img\b|\bavatar\b|\bphotos?\b/i)
    expect(html).toContain('data-phase="2f"')
    expect(html).toContain('12:30')
    expect(html).toContain('Zadzwoń')
  })
})
