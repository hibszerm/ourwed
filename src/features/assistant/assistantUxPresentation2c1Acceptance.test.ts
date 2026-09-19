/**
 * Assistant UX Phase 2C.1 — context-card presentation acceptance.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2c1Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { buildContextCards } from './components/presentation/buildContextCards'
import { AssistantContextCard } from './components/presentation/AssistantContextCard'
import { PresentationTranscript } from './components/PresentationTranscript'
import { parseSafeMarkdown, visibleTextFromBlocks } from './components/presentation/parseSafeMarkdown'
import type { AssistantReference, TranscriptEntry } from './v7/presentation/types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join('/tmp', 'ourwed-assistant-ux-2c1-visual-fixtures')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const WEDDING = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

describe('Assistant UX 2C.1 context-card rebuild', () => {
  it('context card exists; old divider row structure removed', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const transcript = readSrc(
      'src/features/assistant/components/PresentationTranscript.tsx',
    )
    expect(css).toContain('.contextCard')
    expect(css).toContain('.contextAction')
    expect(css).toContain('.contextActionDirect')
    expect(css).not.toContain('.referenceCluster')
    expect(css).not.toContain('.referenceStack')
    expect(css).not.toMatch(/\.actionControl\b/)
    expect(transcript).toContain('AssistantContextCard')
    expect(transcript).toContain('buildContextCards')
    expect(transcript).not.toContain('AssistantReferenceCluster')
  })

  it('contextual actions are bordered button controls via executor', () => {
    const control = readSrc(
      'src/features/assistant/components/presentation/AssistantActionControl.tsx',
    )
    expect(control).toContain('executeAssistantAction')
    expect(control).toContain('type="button"')
    expect(control).toContain('assistant-presentation-action')
    expect(control).toContain('contextAction')
    expect(control).not.toContain('exampleButton')
  })

  it('phone actions grouped on one card', () => {
    const refs: AssistantReference[] = [
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
    const cards = buildContextCards(refs)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.kind).toBe('phone')
    expect(cards[0]!.valueLines[0]).toContain('731')
    expect(cards[0]!.actions.map((a) => a.type)).toEqual([
      'call_phone',
      'send_sms',
    ])
  })

  it('two addresses remain separate cards', () => {
    const refs: AssistantReference[] = [
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
    ]
    const cards = buildContextCards(refs)
    expect(cards).toHaveLength(2)
    expect(cards.every((c) => c.kind === 'address')).toBe(true)
  })

  it('wedding + calendar presentation-grouped into one card', () => {
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
    const cards = buildContextCards(refs)
    expect(cards).toHaveLength(1)
    expect(cards[0]!.subtitle).toContain('17 września 2026')
    expect(cards[0]!.actions.map((a) => a.type)).toEqual([
      'open_wedding',
      'open_calendar',
    ])
    expect(cards[0]!.memberRefIds).toEqual(['w1', 'c1'])
  })

  it('session + calendar group; questionnaire wedding card retitled', () => {
    const sessionCards = buildContextCards([
      {
        id: 's1',
        kind: 'session',
        label: 'Sesja produktowa — katalog Jesień',
        entityId: SESSION,
        actions: [{ type: 'open_session', sessionId: SESSION }],
      },
      {
        id: 'c1',
        kind: 'calendar',
        label: '2026-10-05',
        actions: [{ type: 'open_calendar', date: '2026-10-05' }],
      },
    ])
    expect(sessionCards).toHaveLength(1)
    expect(sessionCards[0]!.subtitle).toContain('5 października 2026')

    const q = buildContextCards([
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
    expect(q[0]!.title).toBe('Ankieta przedślubna')
    expect(q[0]!.subtitle).toContain('Martyna')
  })

  it('SafeText preserved; no HTML injection; calendar format preserved', () => {
    const visible = visibleTextFromBlocks(
      parseSafeMarkdown('Wesele **Martyny** o **12:30**'),
    )
    expect(visible).not.toContain('**')
    const safe = readSrc(
      'src/features/assistant/components/presentation/AssistantSafeText.tsx',
    )
    expect(safe).not.toMatch(/dangerouslySetInnerHTML/)
    expect(safe).not.toMatch(/\bhref\s*=/)
  })

  it('panel/composer geometry matches Premium Minimal × Compact (2F)', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('min(780px, calc(100vw - 48px))')
    expect(css).toContain('min(700px, calc(100dvh - 64px))')
    expect(css).toContain('max-width: 70%')
    expect(css).toContain('.contextCard')
    expect(css).toMatch(/\.composer\s*\{[^}]*min-height:\s*54px/)
    expect(css).toContain('width: 42px') // send (mobile touch)
    expect(css).toContain('prefers-reduced-motion')
    expect(css).toContain('contextAction:focus-visible')
  })

  it('2AB shell + close/reopen unchanged; no prose action inference', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(surface).toContain('placement="dock"')
    expect(surface).toContain('useOverlay')
    expect(host).toMatch(/setTranscript\(\[\]\)/)
    expect(host).toContain('clearSession')
    expect(surface).not.toContain('projectV7PresentationTurn')
  })

  it('writes deterministic visual fixture HTML for self-audit', () => {
    mkdirSync(outDir, { recursive: true })
    const entries: TranscriptEntry[] = [
      { id: 'u1', role: 'user', text: 'co mam jutro?', status: 'sent' },
      {
        id: 'a1',
        role: 'assistant',
        status: 'ready',
        presentation: {
          status: 'answer',
          message:
            'Jutro, **17 września**, masz wesele **Martyny Napieralskiej i Damiana Urbańskiego**.',
          references: [
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
        },
      },
      { id: 'u2', role: 'user', text: 'jaki ma telefon?', status: 'sent' },
      {
        id: 'a2',
        role: 'assistant',
        status: 'ready',
        presentation: {
          status: 'answer',
          message: 'Telefon panny młodej to **731 435 667**.',
          references: [
            {
              id: 'p1',
              kind: 'phone',
              label: 'Telefon panny młodej',
              actions: [
                { type: 'call_phone', phone: '731435667' },
                { type: 'send_sms', phone: '731435667' },
              ],
            },
            {
              id: 'w2',
              kind: 'wedding',
              label: 'Martyna Napieralska i Damian Urbański',
              entityId: WEDDING,
              actions: [{ type: 'open_wedding', weddingId: WEDDING }],
            },
          ],
        },
      },
    ]

    const markup = renderToStaticMarkup(
      createElement(PresentationTranscript, {
        entries,
        loading: false,
        onNavigate: () => {},
      }),
    )
    expect(markup).toContain('assistant-context-card')
    expect(markup).toContain('assistant-presentation-action')
    expect(markup).toContain('userUtterance')
    expect(markup).not.toContain('**')
    expect(markup).not.toContain('href=')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    // Extract hashed class names won't work with CSS modules in SSR without
    // identity-obj-proxy — classes appear as imported module keys in markup
    // via styles.x which vitest may stringify. Write a readable fixture page.
    const page = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"/>
<title>OurWed Assistant 2C.1 visual fixture</title>
<style>
:root { --color-text-primary:#2c2622; --color-text-secondary:#5c534c; --color-text-tertiary:#8a7f76; --color-text-muted:#8a7f76; --color-surface:#f7f3ec; --surface-primary:#f7f3ec; --app-background:#ebe4d8; --color-bg:#ebe4d8; --color-accent:#2c2622; }
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#d9d0c3;padding:32px;color:#2c2622}
.panel{width:800px;margin:0 auto;background:var(--surface-primary);border:1px solid rgba(44,38,34,.08);border-radius:24px;box-shadow:0 18px 40px -24px rgba(44,38,34,.28);overflow:hidden;display:flex;flex-direction:column;min-height:640px;max-height:820px}
.header{min-height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 30px;border-bottom:1px solid rgba(44,38,34,.06);font-weight:600;font-size:15px;color:#5c534c}
.scroll{flex:1;padding:18px 32px;overflow:auto}
.dock{padding:14px 28px 18px;border-top:1px solid rgba(44,38,34,.06);background:color-mix(in srgb,#ebe4d8 38%,#f7f3ec)}
.composer{min-height:54px;border:1px solid rgba(44,38,34,.1);border-radius:16px;background:color-mix(in srgb,#ebe4d8 58%,#f7f3ec);display:flex;align-items:center;padding:10px 12px 10px 16px;gap:10px}
.send{width:44px;height:44px;border:0;border-radius:12px;background:#2c2622;color:#fff}
/* Approximate module classes from SSR (often localIdent names) */
[class*="transcriptList"]{display:flex;flex-direction:column;gap:22px}
[class*="userTurn"]{display:flex;justify-content:flex-end}
[class*="userUtterance"]{max-width:74%;padding:11px 16px;border-radius:16px;border:1px solid rgba(44,38,34,.08);background:color-mix(in srgb,#ebe4d8 78%,#f7f3ec);font-size:15px}
[class*="assistantTurn"]{display:flex;flex-direction:column;gap:14px}
[class*="safeParagraph"]{margin:0;font-size:15.5px;line-height:1.6}
[class*="safeStrong"]{font-weight:650}
[class*="contextCardStack"]{display:flex;flex-direction:column;gap:10px}
[class*="contextCard"]{padding:14px 15px;border-radius:15px;border:1px solid rgba(44,38,34,.08);background:color-mix(in srgb,#ebe4d8 62%,#f7f3ec)}
[class*="contextCardHeader"]{display:flex;gap:12px}
[class*="contextCardIcon"]{width:34px;height:34px;border-radius:9px;background:rgba(44,38,34,.06);display:flex;align-items:center;justify-content:center}
[class*="contextCardTitle"]{margin:0;font-size:15px;font-weight:600}
[class*="contextCardSubtitle"],[class*="contextCardValue"]{margin:0;font-size:13px;color:#8a7f76}
[class*="contextCardValue"]{color:#2c2622;font-weight:550;font-size:14px}
[class*="contextCardActions"]{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
[class*="contextAction"]{display:inline-flex;align-items:center;gap:7px;min-height:36px;padding:0 12px;border-radius:10px;border:1px solid rgba(44,38,34,.12);background:#f7f3ec;font-size:13px;font-weight:600;cursor:pointer}
[class*="contextActionDirect"]{background:rgba(44,38,34,.07)}
</style></head><body>
<div class="panel">
  <div class="header"><span>Zapytaj OurWed</span><span>×</span></div>
  <div class="scroll">${markup}</div>
  <div class="dock"><div class="composer"><span style="opacity:.5">Zapytaj o coś jeszcze...</span><button class="send">↑</button></div></div>
</div>
<p style="text-align:center;opacity:.6;margin-top:16px;font-size:13px">2C.1 deterministic fixture — presentation only</p>
</body></html>`
    writeFileSync(join(outDir, 'conversation-fixture.html'), page)
    // Also render single context cards
    const phoneCard = buildContextCards([
      {
        id: 'p1',
        kind: 'phone',
        label: 'Telefon panny młodej',
        actions: [
          { type: 'call_phone', phone: '731435667' },
          { type: 'send_sms', phone: '731435667' },
        ],
      },
    ])[0]!
    const phoneHtml = renderToStaticMarkup(
      createElement(AssistantContextCard, {
        card: phoneCard,
        onNavigate: () => {},
      }),
    )
    expect(phoneHtml).toContain('731435667')
    expect(phoneHtml).toContain('Zadzwoń')
  })
})
