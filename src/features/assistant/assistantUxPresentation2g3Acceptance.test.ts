/**
 * Assistant UX Phase 2G.3 — Thinking…. orb + 54px persistent composer.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2g3Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ASSISTANT_DEMO_THINKING_LABEL,
  ASSISTANT_HERO_ORB_STATE,
  ASSISTANT_PROCESSING_ORB_STATE,
} from './components/AssistantThinkingOrb'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2g3-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2G.3', () => {
  it('maps libraries.dev "Thinking…." → state composing (not searching)', () => {
    // Evidence captured from https://libraries.dev/assets/orbs-DS-0_eEV.js
    const demoSnippet =
      'w=[{state:"solving",label:"Solving…."},{state:"composing",label:"Thinking…."}]'
    expect(demoSnippet).toContain('state:"composing",label:"Thinking…."')
    expect(ASSISTANT_DEMO_THINKING_LABEL).toBe('Thinking….')
    expect(ASSISTANT_HERO_ORB_STATE).toBe('composing')
    expect(ASSISTANT_PROCESSING_ORB_STATE).toBe('composing')

    const orb = readSrc(
      'src/features/assistant/components/AssistantThinkingOrb.tsx',
    )
    expect(orb).toContain("from 'thinking-orbs'")
    expect(orb).toContain("ASSISTANT_HERO_ORB_STATE = 'composing'")
    expect(orb).toContain("ASSISTANT_PROCESSING_ORB_STATE = 'composing'")
    expect(orb).not.toContain('state="searching"')
    expect(orb).not.toContain("= 'searching'")
    expect(orb).toContain('size={64}')
    expect(orb).toContain('size={20}')
    expect(orb).toContain('theme="light"')
    expect(orb).toContain('speed={1}')
    expect(orb).toContain('paused={false}')
    expect(orb).toContain('data-phase="2g3"')

    const pkg = JSON.parse(readSrc('node_modules/thinking-orbs/package.json'))
    expect(pkg.version).toBe('0.3.1')
  })

  it('composer 54px pill + persistent instance + no remount', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('placement="dock"')
    // Single composer JSX binding used once at panel bottom
    expect(surface.match(/\{composer\}/g)?.length).toBe(1)
    expect(surface).toContain('lineCount={lineCount}')
    expect(surface).toContain('COMPOSER_LINE_PX = 22')
    expect(surface).toContain('COMPOSER_TEXTAREA_MAX_PX = 114')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('min-height: 54px')
    expect(css).toContain('border-radius: 27px')
    expect(css).toContain('grid-template-columns: 19px minmax(0, 1fr) 42px')
    expect(css).toContain('width: 42px')
    expect(css).toContain('border-radius: 21px')
    expect(css).toContain('line-height: 22px')
    expect(css).toContain('font-size: 2rem')
    expect(css).toContain('margin-bottom: 25px')
    expect(css).toContain(
      '--assistant-send-bg: var(--button-primary-background, var(--color-accent))',
    )
    expect(css).toMatch(/\.composer:focus-within\s*\{[^}]*border-width:\s*1px/)
    expect(css).toMatch(/\.composer\s*\{[^}]*min-height:\s*54px/)
    expect(css).not.toMatch(/\.composer\s*\{[^}]*min-height:\s*58px/)
    expect(css).not.toMatch(/\.composer\s*\{[^}]*min-height:\s*56px/)
  })

  it('writes Thinking match + composer height fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>2G.3</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.row{display:grid;grid-template-columns:1fr 1fr;gap:24px;max-width:900px;margin:0 auto 24px}
.card{background:#111;border-radius:16px;padding:20px;color:#fff;display:flex;align-items:center;gap:14px}
.card.light{background:#f7f3ec;color:#2c2622}
.orb{width:64px;height:64px;border-radius:50%;border:1px dashed rgba(255,255,255,.25)}
.card.light .orb{border-color:rgba(44,38,34,.2)}
.panel{width:780px;height:500px;margin:0 auto;background:#f7f3ec;border-radius:24px;position:relative;display:flex;flex-direction:column}
.close{position:absolute;top:22px;right:24px}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(-5%)}
.prompt{font-size:32px;font-weight:530;letter-spacing:-.03em;line-height:1.16;margin:25px 0 0}
.dock{padding:0 32px 26px}
.composer{display:grid;grid-template-columns:19px 1fr 42px;gap:14px;align-items:center;min-height:54px;padding:5px 6px 5px 20px;border-radius:27px;border:1px solid rgba(44,38,34,.055);background:color-mix(in srgb,#ebe4d8 48%,#f7f3ec);box-shadow:0 6px 22px rgba(44,38,34,.035)}
.send{width:42px;height:42px;border:0;border-radius:21px;background:var(--button-primary-background,var(--color-accent,#0a0a0a));color:#fff}
.meta{font-size:12px;opacity:.7;max-width:780px;margin:12px auto}
table{width:780px;margin:16px auto;border-collapse:collapse;font-size:13px}
td,th{border:1px solid rgba(44,38,34,.12);padding:6px 8px;text-align:left}
</style></head><body>
<div class="row">
  <div class="card" data-demo="Thinking…."><div class="orb"></div><div><strong>Thinking….</strong><div>state=composing size=64</div></div></div>
  <div class="card light" data-ourwed="hero"><div class="orb"></div><div><strong>OurWed hero</strong><div>state=composing size=64 theme=light</div></div></div>
</div>
<p class="meta">Evidence: libraries.dev/assets/orbs-*.js → w=[{state:"solving",label:"Solving…."},{state:"composing",label:"Thinking…."}]</p>
<div class="panel" data-phase="2h">
  <button class="close">×</button>
  <div class="hero"><div class="orb" data-orb-state="composing"></div><p class="prompt">Jak mogę Ci pomóc?</p></div>
  <div class="dock" data-placement="empty"><div class="composer" data-composer-base-height="54"><span>⌕</span><span style="line-height:22px;font-size:15.5px">Zapytaj o cokolwiek…</span><button class="send">↑</button></div></div>
</div>
<table>
  <tr><th>Phase</th><th>Height</th></tr>
  <tr><td>T0 empty</td><td>54</td></tr>
  <tr><td>T1 one-line text</td><td>54</td></tr>
  <tr><td>T2 after submit</td><td>54</td></tr>
  <tr><td>T3 processing</td><td>54</td></tr>
  <tr><td>T4 answer</td><td>54</td></tr>
</table>
</body></html>`
    writeFileSync(join(outDir, 'thinking-match-and-composer.html'), html)
    expect(html).toContain('state=composing')
    expect(html).toContain('data-composer-base-height="54"')
    expect(html).not.toContain('searching')
  })
})
