/**
 * Phase 2K — CRM isolation + scroll ownership + focus continuity.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../..')
const outDir = join(root, 'tmp/assistant-ux-2k-visual')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Assistant UX 2K CRM isolation', () => {
  it('opaque fixed root covers CRM; no transparency / backdrop-filter', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    const rootRule = mobile.slice(
      mobile.indexOf(".surfaceRoot[data-mobile='true']"),
      mobile.indexOf('.surfaceBackdrop'),
    )
    expect(rootRule).toMatch(/background:\s*var\(--surface-primary/)
    expect(rootRule).toContain('overflow: hidden')
    expect(rootRule).toContain('inset: 0')
    expect(rootRule).not.toContain('backdrop-filter')
    expect(rootRule).not.toMatch(/background:\s*transparent/)
  })

  it('fixture — loud CRM behind Assistant', () => {
    mkdirSync(outDir, { recursive: true })
    const html = `<!doctype html><html><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>2K CRM isolation</title>
<style>
body{margin:0;font-family:system-ui}
.card{margin:60px 12px;padding:24px;background:#ff2d55;color:#fff;font-size:28px;font-weight:800}
.root{position:fixed;inset:0;z-index:80;background:#f7f3ec;overflow:hidden;display:flex;flex-direction:column}
.panel{flex:1;min-height:0;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#f7f3ec}
.hdr,.composer{background:#f7f3ec}
.hdr{min-height:64px;padding:0 16px;display:flex;align-items:center;font-weight:600}
.content{min-height:0;overflow:hidden}
.composer{padding:12px 16px}
</style>
<body>
<article class="card">WEDDING CARD BLEED TEST ███</article>
<div class="root" data-phase="2k1"><div class="panel" role="dialog">
<div class="hdr">Asystent OurWed</div>
<div class="content"></div>
<div class="composer">composer</div>
</div></div>
</body></html>`
    writeFileSync(join(outDir, 'crm-isolation.html'), html)
    expect(html).toContain('background:#f7f3ec')
    expect(html).toContain('position:fixed;inset:0')
  })
})

describe('Assistant UX 2K scroll ownership', () => {
  it('only transcript scrolls; empty/header/root locked', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(
      /\.surfaceRoot\[data-mobile='true'\]\s*\{[^}]*overflow:\s*hidden/s,
    )
    expect(mobile).toMatch(/\.panel[\s\S]*?overflow:\s*hidden/)
    expect(mobile).toMatch(
      /\.contentRegion\[data-content='empty'\]\s*\{[^}]*touch-action:\s*none/s,
    )
    expect(mobile).toMatch(
      /\.transcriptScroll\s*\{[^}]*overflow-y:\s*auto[\s\S]*overscroll-behavior:\s*contain/s,
    )
    expect(mobile).toMatch(/\.panelChrome\s*\{[^}]*touch-action:\s*none/s)
  })

  it('no settle scrolling APIs in viewport hook; document anchor may restore', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const scroll = readSrc(
      'src/features/assistant/components/assistantScroll.ts',
    )
    const hook = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )
    const anchor = readSrc(
      'src/features/assistant/components/assistantDocumentScrollAnchor.ts',
    )
    // Surface must not call scrollIntoView / focus scroll hacks
    expect(surface).not.toContain('scrollIntoView')
    expect(scroll).not.toContain('window.scrollTo')
    expect(hook).not.toContain('window.scrollTo')
    expect(hook).not.toContain('scrollIntoView')
    // 2K.3 document anchor is the authorized scrollTo path
    expect(anchor).toContain('scrollTo')
    expect(surface).toContain('useAssistantDocumentScrollAnchor')
    expect(surface).toContain('touchmove')
  })

  it('overflow body lock — not position:fixed iOS lock', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("bodyLock: 'overflow'")
    expect(surface).not.toMatch(/bodyLock:\s*isMobile\s*\?\s*'ios'/)
    const lock = readSrc('src/components/ui/overlay/bodyLock.ts')
    expect(lock).toContain("overflow = 'hidden'")
    expect(lock).toContain('documentElement')
    expect(lock).not.toContain("position = 'fixed'")
  })
})

describe('Assistant UX 2K focus continuity', () => {
  it('first-tap sync focus preserved; no timer/retry', () => {
    const composer = readSrc(
      'src/features/assistant/components/AssistantComposer.tsx',
    )
    expect(composer).toContain('onPointerDown={focusTextareaFromGesture}')
    expect(composer).toContain('input.focus()')
    expect(composer).not.toContain('setTimeout')
    expect(composer).not.toContain('focusWithoutScroll')
    expect(composer).toContain('pointer-events:none')
  })

  it('mobile open does not autofocus composer', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    expect(surface).toContain("initialFocus: isMobile ? 'panel' : 'first'")
    expect(surface).toContain('data-phase="k31-correctness-followup"')
  })

  it('composer font >= 16px on mobile', () => {
    const css = readSrc('src/features/assistant/components/Assistant.module.css')
    const mobile = css.slice(css.indexOf('@media (max-width: 767px)'))
    expect(mobile).toMatch(/\.composerInput\s*\{[^}]*font-size:\s*1rem/s)
  })
})
