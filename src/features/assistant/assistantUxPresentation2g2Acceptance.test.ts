/**
 * Assistant UX Phase 2G.2 — final empty art direction.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2g2Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  ASSISTANT_HERO_ORB_STATE,
} from './components/AssistantThinkingOrb'
import { ORB_STATE_FIXTURE_STATES } from './components/dev/OrbStateFixture'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2g2-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2G.2', () => {
  it('thinking-orbs package + hero/processing configuration', () => {
    const pkg = JSON.parse(readSrc('node_modules/thinking-orbs/package.json'))
    expect(pkg.version).toBe('0.3.1')

    const orb = readSrc(
      'src/features/assistant/components/AssistantThinkingOrb.tsx',
    )
    expect(orb).toContain("from 'thinking-orbs'")
    expect(orb).toContain('size={64}')
    expect(orb).toContain('size={20}')
    expect(orb).toContain('theme="light"')
    expect(orb).toContain('paused={false}')
    expect(orb).toContain(`state={ASSISTANT_HERO_ORB_STATE}`)
    expect(ASSISTANT_HERO_ORB_STATE).toBe('composing')
    expect(orb).not.toContain('state="breathing"')
    expect(orb).not.toMatch(/transform:\s*scale/)
    expect(orb).toContain('data-phase="2g3"')

    const types = readSrc('node_modules/thinking-orbs/dist/types.d.ts')
    expect(types).toContain('OrbSize = 64 | 20')
    expect(types).toContain('face-on ring slowly morphing') // breathing = ring (rejected)
    expect(types).toContain('scan meridian sweeps a dotted globe') // searching

    const impl = readSrc('node_modules/thinking-orbs/dist/index.es.js')
    expect(impl).toContain('devicePixelRatio')
    expect(impl).toMatch(/Math\.min\(2,\s*typeof devicePixelRatio/)
    expect(impl).toMatch(/u\.width\s*=\s*Math\.round\(e\s*\*\s*l\)/)

    // Non-64 size would crash resolvePreset (no preset key) — prove 92 not supported
    const engine = readSrc('node_modules/thinking-orbs/dist/engine.es.js')
    expect(engine).toMatch(/64:\s*\{/)
    expect(engine).toMatch(/20:\s*\{/)
    expect(engine).not.toMatch(/92:\s*\{/)
  })

  it('hero state selected from fixture geometry — not breathing ring', () => {
    expect(ORB_STATE_FIXTURE_STATES).toEqual([
      'working',
      'searching',
      'solving',
      'listening',
      'connecting',
      'weaving',
      'composing',
      'breathing',
      'shaping',
    ])
    // Reject flat ring states for hero identity
    expect(ASSISTANT_HERO_ORB_STATE).not.toBe('breathing')
    expect(ASSISTANT_HERO_ORB_STATE).not.toBe('shaping')
    // Prefer dimensional globe from libraries.dev reference + official example
    expect(ASSISTANT_HERO_ORB_STATE).toBe('composing')

    const fixture = readSrc(
      'src/features/assistant/components/dev/OrbStateFixture.tsx',
    )
    expect(fixture).toContain('data-dev-only')
    expect(fixture).toContain('size={64}')
    expect(fixture).toContain('theme="light"')
  })

  it('empty geometry: no dividers, pill composer, crisp 64 hero', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('placement="dock"')
    expect(surface).toContain('variant="hero"')
    expect(surface).toContain('emptyHero')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('.composerDock')
    expect(css).toContain('border-radius: 27px')
    expect(css).toContain('min-height: 54px')
    expect(css).toContain('border-radius: 21px')
    expect(css).toContain('min(700px')
    expect(css).toContain('max-height: min(700px')
    expect(css).toContain('font-size: 2rem')
    expect(css).toContain('letter-spacing: -0.03em')
    expect(css).toContain('margin-bottom: 25px')
    expect(css).toMatch(/\.thinkingOrbHero canvas\s*\{[^}]*width:\s*64px\s*!important/)
    expect(css).toMatch(/transform:\s*none\s*!important/)
    expect(css).not.toContain('scale(1.4)')
    expect(css).toContain(
      '--assistant-send-bg: var(--button-primary-background, var(--color-accent))',
    )

    const processing = readSrc(
      'src/features/assistant/components/AssistantProcessingIndicator.tsx',
    )
    expect(processing).toContain('variant="processing"')
    expect(processing).not.toContain('variant="hero"')
  })

  it('writes empty visual + orb-state selection fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const states = ORB_STATE_FIXTURE_STATES.map(
      (s) =>
        `<div class="cell"><div class="orb" data-state="${s}"></div><code>${s}</code>${
          s === 'composing' ? '<mark>see 2G.3 composing</mark>' : ''
        }${s === 'breathing' ? '<span class="rej">ring — rejected</span>' : ''}</div>`,
    ).join('\n')
    const selectHtml = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>2G.2 orb states</title>
<style>
body{margin:0;background:#f7f3ec;color:#2c2622;font-family:system-ui}
.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:28px;padding:32px}
.cell{display:flex;flex-direction:column;align-items:center;gap:10px}
.orb{width:64px;height:64px;border-radius:50%;border:1px dashed rgba(44,38,34,.25)}
mark{background:#dce8d5;padding:2px 6px;border-radius:6px;font-size:11px}
.rej{font-size:11px;opacity:.6}
.note{max-width:720px;margin:0 auto 16px;padding:16px 32px;font-size:13px;line-height:1.45}
</style></head><body>
<p class="note"><strong>Dev-only fixture.</strong> Official thinking-orbs@0.3.1 size=64 theme=light.
breathing = face-on ring (flat dotted loader) — rejected.
searching = dotted globe with scan meridian — dimensional; matches libraries.dev example — <strong>SELECTED</strong>.
Crisp CSS&gt;64 impossible: presets only 64|20; canvas buffer = size×min(2,dpr).</p>
<div class="grid" data-testid="assistant-orb-state-fixture" data-dev-only="true">${states}</div>
</body></html>`
    writeFileSync(join(outDir, 'orb-states.html'), selectHtml)

    const emptyHtml = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2G.2 empty</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{position:relative;width:min(780px,calc(100vw - 48px));height:500px;margin:0 auto;
  background:#f7f3ec;border-radius:24px;border:1px solid rgba(44,38,34,.06);display:flex;flex-direction:column;overflow:hidden}
.close{position:absolute;top:22px;right:24px;width:34px;height:34px;border:0;background:transparent;font-size:18px;opacity:.55}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(-6%)}
.orb{width:64px;height:64px;margin-bottom:28px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,rgba(44,38,34,.12),transparent 55%),
  radial-gradient(circle at 70% 65%,rgba(44,38,34,.08),transparent 50%);
  box-shadow:inset 0 0 0 1px rgba(44,38,34,.12)}
.prompt{font-size:30px;font-weight:525;letter-spacing:-.028em;line-height:1.18;margin:0}
.dock{padding:0 32px 26px;border-top:0}
.composer{height:58px;border-radius:29px;display:flex;align-items:center;gap:15px;padding:7px 7px 7px 22px;
  border:1px solid rgba(44,38,34,.065);background:color-mix(in srgb,#ebe4d8 48%,#f7f3ec);
  box-shadow:0 6px 22px rgba(44,38,34,.04)}
.send{width:44px;height:44px;border:0;border-radius:22px;background:var(--button-primary-background,var(--color-accent,#0a0a0a));color:#fff}
</style></head><body>
<div class="panel" data-phase="2h" data-mode="empty">
  <button class="close" aria-label="Zamknij">×</button>
  <div class="hero" data-testid="empty">
    <div class="orb" data-orb-state="composing" data-orb-size="64"></div>
    <p class="prompt">Jak mogę Ci pomóc?</p>
  </div>
  <div class="dock" data-placement="empty"><div class="composer"><span style="opacity:.78">⌕</span><span style="flex:1;font-size:15.5px;opacity:.85">Zapytaj o cokolwiek…</span><button class="send">↑</button></div></div>
</div>
</body></html>`
    writeFileSync(join(outDir, 'empty-hero.html'), emptyHtml)
    expect(emptyHtml).not.toMatch(/border-top:1px|header line/)
    expect(emptyHtml).toContain('border-radius:29px')  // historical fixture string
    expect(emptyHtml).toContain('data-orb-state="composing"')
    expect(selectHtml).toContain('SELECTED')
  })
})
