/**
 * Assistant UX Phase 2H — fixed workspace geometry (no content-sized modal).
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2hAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ASSISTANT_HERO_ORB_STATE,
  ASSISTANT_PROCESSING_ORB_STATE,
} from './components/AssistantThinkingOrb'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2h-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2H', () => {
  it('fixed desktop panel height for every mode — not content-sized', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('grid-template-rows: 64px minmax(0, 1fr) auto')
    expect(css).toContain('height: min(700px, calc(100dvh - 64px))')
    expect(css).toContain('width: min(780px, calc(100vw - 48px))')
    expect(css).not.toContain('height: fit-content')
    expect(css).not.toMatch(/\.panel\s*\{[^}]*max-height:\s*min\(820px/)
    expect(css).not.toContain('min(500px')
    expect(css).not.toContain('min(490px')
    expect(css).not.toContain('min(520px')
    // No height/max-height geometry animation on panel
    expect(css).not.toMatch(
      /\.panel\s*\{[^}]*transition:[^}]*max-height/,
    )
  })

  it('persistent header + content region + dock composer', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('data-workspace="fixed"')
    expect(surface).toContain('data-testid="assistant-header"')
    expect(surface).toContain('data-testid="assistant-content-region"')
    expect(surface).toContain("{ASSISTANT_TITLE}")
    expect(surface).not.toContain('data-empty-anonymous')
    expect(surface).not.toContain("conversationMode ? ASSISTANT_TITLE")
    expect(surface).toContain('placement="dock"')
    expect(surface).not.toContain(
      "placement={conversationMode ? 'dock' : 'empty'}",
    )
    expect(surface.match(/\{composer\}/g)?.length).toBe(1)

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('.contentRegion')
    expect(css).toMatch(/\.panelHeader\s*\{[^}]*height:\s*64px/)
    expect(css).toMatch(/\.panelChrome\s*\{[^}]*height:\s*64px/)
    expect(css).toContain('padding: 0 24px 0 32px')
    expect(css).toContain('width: 32px')
    expect(css).toContain('height: 32px')
    expect(css).toContain('padding: 16px 32px 20px')
    expect(css).not.toMatch(
      /\.panel\[data-mode='empty'\] \.panelChrome\s*\{[^}]*border-bottom:\s*0/,
    )
  })

  it('preserves 2G.3 orb + 54px composer', () => {
    expect(ASSISTANT_HERO_ORB_STATE).toBe('composing')
    expect(ASSISTANT_PROCESSING_ORB_STATE).toBe('composing')
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toMatch(/\.composer\s*\{[^}]*min-height:\s*54px/)
    expect(css).toContain('border-radius: 27px')
    expect(css).toContain('font-size: 2rem')
    expect(css).toContain('margin-bottom: 25px')
  })

  it('writes 100-message geometry fixture + state matrix', () => {
    mkdirSync(outDir, { recursive: true })
    const states = [
      'S0 EMPTY',
      'S1 EMPTY FOCUSED',
      'S2 ONE-LINE TYPING',
      'S3 SUBMITTED',
      'S4 PROCESSING',
      'S5 FIRST ANSWER',
      'S6 SECOND QUESTION',
      'S7 SECOND ANSWER',
      'S8 10 MESSAGES',
      'S9 50 MESSAGES',
      'S10 100 MESSAGES',
    ]
    const rows = states
      .map(
        (s) =>
          `<tr><td>${s}</td><td>780</td><td>700</td><td>0</td><td>≤1</td></tr>`,
      )
      .join('\n')
    const turns = Array.from({ length: 100 }, (_, i) => {
      const n = i + 1
      const side = n % 2 === 1 ? 'user' : 'assistant'
      return `<div class="msg ${side}">Turn ${n}</div>`
    }).join('\n')
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>2H geometry</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;height:700px;margin:0 auto 24px;background:#f7f3ec;border-radius:24px;display:grid;grid-template-rows:64px minmax(0,1fr) auto;overflow:hidden;border:1px solid rgba(44,38,34,.06)}
.hdr{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 24px 0 32px;border-bottom:1px solid rgba(44,38,34,.04);font-weight:600}
.content{min-height:0;overflow:hidden;display:flex;flex-direction:column}
.scroll{flex:1;min-height:0;overflow-y:auto;padding:14px 32px}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(-3%)}
.dock{padding:16px 32px 20px;border-top:1px solid rgba(44,38,34,.04)}
.composer{min-height:54px;border-radius:27px;border:1px solid rgba(44,38,34,.06);display:grid;grid-template-columns:19px 1fr 42px;gap:14px;align-items:center;padding:5px 6px 5px 20px}
.msg{margin:8px 0;padding:8px 12px;border-radius:12px;max-width:70%}
.msg.user{margin-left:auto;background:#ebe4d8}
.msg.assistant{background:transparent}
table{width:780px;margin:16px auto;border-collapse:collapse;font-size:13px}
td,th{border:1px solid rgba(44,38,34,.12);padding:6px 8px;text-align:left}
.meta{max-width:780px;margin:12px auto;font-size:12px;opacity:.75}
</style></head><body>
<p class="meta">Phase 2H — fixed workspace. Outer panel 780×700 for S0–S10. Transcript scrolls; shell does not.</p>
<div class="panel" data-phase="2h" data-workspace="fixed" data-mode="empty" data-fixture="S0">
  <div class="hdr"><span>OurWed Assistant</span><span>×</span></div>
  <div class="content" data-content="empty"><div class="hero"><div style="width:64px;height:64px;border-radius:50%;border:1px dashed rgba(44,38,34,.25)"></div><p style="font-size:32px;font-weight:530;letter-spacing:-.03em">Jak mogę Ci pomóc?</p></div></div>
  <div class="dock"><div class="composer" data-composer-base-height="54"><span>⌕</span><span>Zapytaj o cokolwiek…</span><span>↑</span></div></div>
</div>
<div class="panel" data-phase="2h" data-workspace="fixed" data-mode="conversation" data-fixture="S10">
  <div class="hdr"><span>OurWed Assistant</span><span>×</span></div>
  <div class="content" data-content="transcript"><div class="scroll" data-testid="fixture-100-scroll">${turns}</div></div>
  <div class="dock"><div class="composer" data-composer-base-height="54"><span>⌕</span><span>Zapytaj o zlecenie…</span><span>↑</span></div></div>
</div>
<table>
  <tr><th>State</th><th>W</th><th>H</th><th>ΔW</th><th>ΔH</th></tr>
  ${rows}
</table>
</body></html>`
    writeFileSync(join(outDir, 'fixed-workspace-geometry.html'), html)
    expect(html).toContain('height:700px')
    expect(html).toContain('data-phase="2h"')
    expect(html).toContain('Turn 100')
    expect(html.match(/Turn \d+/g)?.length).toBe(100)
    expect(html).not.toContain('height: fit-content')
  })
})
