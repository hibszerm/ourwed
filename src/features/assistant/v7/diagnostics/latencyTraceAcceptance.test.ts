/**
 * Phase 2K.9-L / 2K.9-L — latency audit instrumentation must not alter V7 behavior
 * when disabled, and must emit a compact non-PII trace when enabled.
 *
 * 2K.9-L: URL flag must survive SPA redirects that strip search.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  armV7LatencyAuditFromUrl,
  beginV7LatencyTrace,
  clearActiveV7LatencyTrace,
  formatV7LatencyTrace,
  getActiveV7LatencyTrace,
  isV7LatencyAuditEnabled,
  resetV7LatencyAuditSessionArmForTests,
  setV7LatencyAuditForTests,
  V7LatencyTrace,
} from './latencyTrace'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

afterEach(() => {
  setV7LatencyAuditForTests(null)
  resetV7LatencyAuditSessionArmForTests()
  clearActiveV7LatencyTrace()
  vi.unstubAllGlobals()
})

describe('Phase 2K.9-L V7 latency audit', () => {
  it('default OFF — begin returns null; no active trace', () => {
    setV7LatencyAuditForTests(false)
    expect(isV7LatencyAuditEnabled()).toBe(false)
    expect(beginV7LatencyTrace('t1')).toBeNull()
    expect(getActiveV7LatencyTrace()).toBeNull()
  })

  it('enabled — one readable compact trace; no utterance/PII fields', () => {
    setV7LatencyAuditForTests(true)
    const spy = vi.spyOn(console, 'info').mockImplementation(() => {})
    const trace = beginV7LatencyTrace('turn-abc')
    expect(trace).toBeInstanceOf(V7LatencyTrace)
    trace!.mark('frontend_start')
    const llm = trace!.markLlmStart()
    trace!.markLlmEnd(llm, { roundtripMs: 1200, edgeOpenaiMs: 1100 })
    const tool = trace!.markToolStart('search_resources')
    trace!.markToolEnd(tool, 'search_resources', 40)
    trace!.mark('presentation_done')
    trace!.mark('ui_visible')
    const snap = trace!.finish({
      ok: true,
      stoppedReason: 'final',
      model: 'gpt-5.6-terra',
      toolNames: ['search_resources'],
    })

    const text = formatV7LatencyTrace(snap)
    expect(text).toContain('Assistant latency [turn-abc]')
    expect(text).toContain('frontend_start')
    expect(text).toContain('llm_1_start')
    expect(text).toContain('llm_1_end')
    expect(text).toContain('tool_1_start')
    expect(text).toContain('TOTAL')
    expect(text).not.toMatch(/phone|telefon|address|email|utterance|Bearer/i)
    expect(spy).toHaveBeenCalled()
    const payload = spy.mock.calls[0]?.[1] as { meta?: { toolNames?: string[] } }
    expect(payload?.meta?.toolNames).toEqual(['search_resources'])
    spy.mockRestore()
  })

  it('2K.9-L — URL flag arms sticky window flag; survives search strip', () => {
    setV7LatencyAuditForTests(null)
    resetV7LatencyAuditSessionArmForTests()

    const loc = {
      href: 'https://www.ourwed.pl/?assistant_latency_audit=1',
      search: '?assistant_latency_audit=1',
      pathname: '/',
    }
    const win: {
      location: typeof loc
      __OURWED_V7_LATENCY_AUDIT__?: unknown
    } = { location: loc }
    vi.stubGlobal('window', win)

    expect(armV7LatencyAuditFromUrl()).toBe(true)
    expect(win.__OURWED_V7_LATENCY_AUDIT__).toBe(true)
    expect(isV7LatencyAuditEnabled()).toBe(true)

    // Simulate LandingPage / → /dashboard stripping search
    loc.href = 'https://www.ourwed.pl/dashboard'
    loc.search = ''
    loc.pathname = '/dashboard'
    expect(win.location.search).toBe('')

    // Sticky: still ON after strip
    expect(isV7LatencyAuditEnabled()).toBe(true)
    expect(beginV7LatencyTrace('after-strip')).toBeInstanceOf(V7LatencyTrace)
    clearActiveV7LatencyTrace()
    vi.unstubAllGlobals()
  })

  it('2K.9-L — without URL/window flag remains OFF after navigation', () => {
    setV7LatencyAuditForTests(null)
    resetV7LatencyAuditSessionArmForTests()

    const loc = {
      href: 'https://www.ourwed.pl/dashboard',
      search: '',
      pathname: '/dashboard',
    }
    const win: {
      location: typeof loc
      __OURWED_V7_LATENCY_AUDIT__?: unknown
    } = { location: loc }
    vi.stubGlobal('window', win)

    expect(armV7LatencyAuditFromUrl()).toBe(false)
    expect(isV7LatencyAuditEnabled()).toBe(false)
    expect(beginV7LatencyTrace('off')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('source wiring — boot arm in main; flag-gated; no localStorage in Host', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const main = readSrc('src/main.tsx')
    const loop = readSrc('src/features/assistant/v7/agent/loop.ts')
    const v7Host = readSrc('src/features/assistant/v7/host.ts')
    const invoke = readSrc('src/features/assistant/v7/agent/invokeStep.ts')
    const tracer = readSrc(
      'src/features/assistant/v7/diagnostics/latencyTrace.ts',
    )
    const landing = readSrc('src/pages/LandingPage.tsx')

    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(main).toContain('armV7LatencyAuditFromUrl')
    expect(main.indexOf('armV7LatencyAuditFromUrl()')).toBeLessThan(
      main.indexOf('createRoot('),
    )
    expect(host).toContain('beginV7LatencyTrace')
    expect(host).toContain('working_state_visible')
    expect(host).toContain('ui_visible')
    expect(host).not.toContain('localStorage')
    expect(host).not.toContain('sessionStorage')
    expect(loop).toContain('markLlmStart')
    expect(loop).toContain('markToolStart')
    expect(loop).toContain('usageAuditFields')
    expect(v7Host).toContain('presentation_done')
    expect(invoke).toContain('edgeOpenaiMs')
    expect(invoke).toContain('cachedTokens')
    expect(tracer).toContain('assistant_latency_audit')
    expect(tracer).toContain('__OURWED_V7_LATENCY_AUDIT__')
    expect(tracer).toContain('sessionArmed')
    expect(tracer).toContain('cachedTokens')
    expect(tracer).not.toContain('projectV7PresentationTurn')
    // Landing still strips search — sticky arm is the intended compensation
    expect(landing).toContain('Navigate to="/dashboard"')

    // 2K.9-L3 — Edge prompt_cache_key + usage extraction (messages/tools unchanged)
    const edge = readSrc('supabase/functions/ai-assistant/index.ts')
    expect(edge).toContain("prompt_cache_key: V7_PROMPT_CACHE_KEY")
    expect(edge).toContain("'ourwed-v7-golden-2k9-tools-v1'")
    expect(edge).toContain('cached_tokens')
    expect(edge).toContain('cache_write_tokens')
    expect(edge).toContain('prompt_tokens_details')
    // No extended retention / cache options in this phase
    expect(edge).not.toContain('prompt_cache_options')
    expect(edge).not.toContain('prompt_cache_retention')
    expect(edge).not.toContain('prompt_cache_breakpoint')
  })

  it('2K.9-L3 — markLlmEnd includes usage only when provided (0 kept, absent omitted)', () => {
    setV7LatencyAuditForTests(true)
    const trace = beginV7LatencyTrace('cache-obs')
    const i = trace!.markLlmStart()
    trace!.markLlmEnd(i, {
      roundtripMs: 100,
      edgeOpenaiMs: 80,
      kind: 'tools',
      promptTokens: 2000,
      cachedTokens: 0,
      completionTokens: 40,
      // cacheWriteTokens intentionally omitted
    })
    const mark = trace!.snapshot().marks.find((m) => m.name === 'llm_1_end')
    expect(mark?.detail?.promptTokens).toBe(2000)
    expect(mark?.detail?.cachedTokens).toBe(0)
    expect(mark?.detail?.completionTokens).toBe(40)
    expect(mark?.detail).not.toHaveProperty('cacheWriteTokens')
  })
})
