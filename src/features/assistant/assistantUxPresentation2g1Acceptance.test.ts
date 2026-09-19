/**
 * Assistant UX Phase 2G.1 — empty hero refinement + HiDPI Thinking Orbs.
 *
 *   npx vitest run src/features/assistant/assistantUxPresentation2g1Acceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../')
const outDir = join(root, 'tmp/assistant-ux-2g1-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2G.1', () => {
  it('empty hero uses native OrbSize 64; processing stays 20; no CSS upscale of 20', () => {
    const orb = readSrc(
      'src/features/assistant/components/AssistantThinkingOrb.tsx',
    )
    expect(orb).toContain("variant === 'hero'")
    expect(orb).toContain('size={64}')
    expect(orb).toContain('size={20}')
    expect(orb).toContain('data-variant="hero"')
    expect(orb).toContain('data-variant="processing"')
    expect(orb).toContain('data-phase="2g3"')
    expect(orb).not.toMatch(/transform:\s*scale/)

    const libTypes = readSrc('node_modules/thinking-orbs/dist/types.d.ts')
    expect(libTypes).toContain('OrbSize = 64 | 20')
    expect(libTypes).toContain('not a scale factor')
    expect(libTypes).toMatch(/chat-avatar scale/)

    const libImpl = readSrc('node_modules/thinking-orbs/dist/index.es.js')
    expect(libImpl).toContain('devicePixelRatio')
    expect(libImpl).toMatch(/Math\.min\(2,\s*typeof devicePixelRatio/)
    expect(libImpl).toMatch(/u\.width\s*=\s*Math\.round\(e\s*\*\s*l\)/)

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('.thinkingOrbHero canvas')
    expect(css).toMatch(/\.thinkingOrbHero canvas\s*\{[^}]*width:\s*64px\s*!important/)
    expect(css).not.toContain('transform: scale(1.4)')
    expect(css).not.toMatch(/\.thinkingOrbHero canvas\s*\{[^}]*transform:\s*scale/)
  })

  it('empty geometry: hero center + bottom dock composer; panel ~500–540', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(surface).toContain('emptyHero')
    expect(surface).toContain('variant="hero"')
    expect(surface).toContain('placement="dock"')
    expect(surface).toContain('{composer}')
    expect(surface).not.toContain('composerWelcome')

    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    expect(css).toContain('height: min(700px')
    expect(css).toContain('max-height: min(700px')
    expect(css).toContain('.emptyHero')
    expect(css).toContain('font-size: 2rem')
    expect(css).toContain('letter-spacing: -0.03em')
    expect(css).toContain('min-height: 54px')
    expect(css).toContain('border-radius: 27px')
    expect(css).toContain('width: 42px')
    expect(css).toContain('height: 42px')
    expect(css).toContain('--assistant-send-bg: var(--button-primary-background, var(--color-accent))')
  })

  it('processing indicator never mounts hero orb', () => {
    const processing = readSrc(
      'src/features/assistant/components/AssistantProcessingIndicator.tsx',
    )
    expect(processing).toContain('variant="processing"')
    expect(processing).not.toContain('variant="hero"')
    expect(processing).not.toContain('size={64}')
  })

  it('writes visual QA fixture', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html lang="pl"><head><meta charset="utf-8"/><title>2G.1 QA</title>
<style>
body{font-family:system-ui;background:#d9d0c4;margin:24px;color:#2c2622}
.panel{width:780px;margin:0 auto;background:#f7f3ec;border-radius:24px;border:1px solid rgba(44,38,34,.06);
  height:520px;min-height:500px;max-height:540px;display:flex;flex-direction:column}
.hdr{height:60px;display:flex;justify-content:flex-end;align-items:center;padding:0 30px;
  border-bottom:1px solid rgba(44,38,34,.04)}
.hero{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;transform:translateY(-7%)}
.orb{width:72px;height:72px;display:flex;align-items:center;justify-content:center;margin-bottom:24px}
.orb-inner{width:64px;height:64px;border-radius:50%;border:1.5px solid rgba(44,38,34,.4);
  background:radial-gradient(circle at 40% 35%,rgba(44,38,34,.08),transparent 60%)}
.prompt{font-size:29px;font-weight:525;letter-spacing:-.025em;line-height:1.2;margin:0}
.dock{padding:18px 30px 22px;border-top:1px solid rgba(44,38,34,.04)}
.composer{width:670px;max-width:100%;margin:0 auto;min-height:60px;border-radius:17px;
  border:1px solid rgba(44,38,34,.065);background:color-mix(in srgb,#ebe4d8 42%,#f7f3ec);
  box-shadow:0 10px 28px rgba(44,38,34,.045);display:flex;align-items:center;padding:8px;gap:10px}
.send{width:44px;height:44px;border:0;border-radius:13px;
  background:var(--button-primary-background,var(--color-accent,#0a0a0a));color:#fff}
</style></head><body>
<div class="panel" data-phase="2h" data-mode="empty">
  <div class="hdr">×</div>
  <div class="hero" data-testid="empty">
    <div class="orb" data-variant="hero" data-orb-size="64"><div class="orb-inner"></div></div>
    <p class="prompt">Jak mogę Ci pomóc?</p>
  </div>
  <div class="dock"><div class="composer"><span style="opacity:.72;flex:1;font-size:15.5px">Zapytaj o cokolwiek…</span><button class="send">↑</button></div></div>
</div>
</body></html>`
    writeFileSync(join(outDir, 'empty-hero.html'), html)
    expect(html).toContain('data-orb-size="64"')
    expect(html).toContain('Jak mogę Ci pomóc?')
    expect(html).not.toMatch(/\bZnajdź\b|\bSprawdź\b/)
    expect(html).toContain('--button-primary-background')
  })
})
