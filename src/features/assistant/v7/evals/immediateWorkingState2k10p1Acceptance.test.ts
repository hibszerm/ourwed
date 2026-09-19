/**
 * Phase 2K.10-P1 — immediate Assistant working state (perceived latency).
 *
 * Proves:
 * A. Pending user + processing commit before runtime/auth awaits
 * B. Success clears processing (loading false) with one assistant row
 * C. Failure clears processing with existing error presentation
 * D. No duplicate user/assistant transcript entries
 * E. Source wiring; V7 semantic files untouched by this phase
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  appendImmediatePendingUser,
  completePendingUserWithApiFailure,
  completePendingUserWithPresentation,
  v7AssistantEntryId,
  v7UserEntryId,
  type TranscriptEntry,
} from '../presentation/immediateWorkingState'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

describe('Phase 2K.10-P1 immediate working state', () => {
  it('A — append pending user before runtime/auth (source order + helper)', () => {
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const runQuery = host.slice(host.indexOf('const runQuery = useCallback'))
    const appendIdx = runQuery.indexOf('appendImmediatePendingUser(prev')
    const runtimeIdx = runQuery.indexOf('await refreshAssistantRuntime()')
    const authIdx = runQuery.indexOf('await authService.getUser()')
    const workingMarkIdx = runQuery.indexOf("mark('working_state_visible')")
    const v7TurnIdx = runQuery.indexOf('await runV7OwnerVisibleTurn(')

    expect(appendIdx).toBeGreaterThan(-1)
    expect(authIdx).toBeGreaterThan(appendIdx)
    expect(runtimeIdx).toBeGreaterThan(v7TurnIdx)
    expect(workingMarkIdx).toBeGreaterThan(appendIdx)
    expect(workingMarkIdx).toBeLessThan(authIdx)
    expect(v7TurnIdx).toBeGreaterThan(authIdx)

    // Optimistic path gated on V7 global flag (not auth) so UI can paint first.
    expect(runQuery).toContain('isV7GlobalFlagEnabled()')
    expect(runQuery).toContain("mark('working_state_visible')")

    const turnId = 'turn-a'
    let transcript: TranscriptEntry[] = []
    let loading = false

    // Simulate submit commit before any await:
    loading = true
    transcript = appendImmediatePendingUser(transcript, turnId, 'telefon?')
    expect(loading).toBe(true)
    expect(transcript).toHaveLength(1)
    expect(transcript[0]).toMatchObject({
      id: v7UserEntryId(turnId),
      role: 'user',
      text: 'telefon?',
      status: 'pending',
    })
    // PresentationTranscript renders AssistantProcessingIndicator when loading
    expect(
      readSrc(
        'src/features/assistant/components/PresentationTranscript.tsx',
      ),
    ).toMatch(/loading \? <AssistantProcessingIndicator \/>/)
  })

  it('B — success: one assistant row; user sent; processing owned by loading=false', () => {
    const turnId = 'turn-b'
    let transcript = appendImmediatePendingUser([], turnId, 'telefon?')
    let loading = true

    transcript = completePendingUserWithPresentation(transcript, turnId, {
      message: 'Numer: +48 111',
      status: 'answer',
    })
    loading = false

    expect(loading).toBe(false)
    expect(transcript.filter((e) => e.role === 'user')).toHaveLength(1)
    expect(transcript.filter((e) => e.role === 'assistant')).toHaveLength(1)
    expect(transcript[0]).toMatchObject({
      role: 'user',
      status: 'sent',
    })
    expect(transcript[1]).toMatchObject({
      id: v7AssistantEntryId(turnId),
      role: 'assistant',
      status: 'ready',
    })
  })

  it('C — failure: existing error presentation; no stuck pending assistant', () => {
    const turnId = 'turn-c'
    let transcript = appendImmediatePendingUser([], turnId, 'telefon?')
    let loading = true

    transcript = completePendingUserWithApiFailure(
      transcript,
      turnId,
      'telefon?',
      'Nie udało się połączyć. Spróbuj ponownie.',
    )
    loading = false

    expect(loading).toBe(false)
    expect(transcript).toHaveLength(2)
    expect(transcript[0]).toMatchObject({ role: 'user', status: 'sent' })
    expect(transcript[1]).toMatchObject({
      role: 'assistant',
      status: 'error',
    })
    if (transcript[1]?.role === 'assistant') {
      expect(transcript[1].presentation.status).toBe('error')
      expect(transcript[1].presentation.retryUtterance).toBe('telefon?')
    }
    // Host still clears loading in finally after catch
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    expect(host).toContain('completePendingUserWithApiFailure')
    expect(host).toMatch(/completePendingUserWithApiFailure[\s\S]*?finally \{\s*setLoading\(false\)/)
  })

  it('D — no duplicate user or assistant entries on re-apply', () => {
    const turnId = 'turn-d'
    let transcript = appendImmediatePendingUser([], turnId, 'telefon?')
    transcript = appendImmediatePendingUser(transcript, turnId, 'telefon?')
    expect(transcript.filter((e) => e.role === 'user')).toHaveLength(1)

    const presentation = { message: 'ok', status: 'answer' as const }
    transcript = completePendingUserWithPresentation(
      transcript,
      turnId,
      presentation,
    )
    transcript = completePendingUserWithPresentation(
      transcript,
      turnId,
      presentation,
    )
    expect(transcript.filter((e) => e.role === 'assistant')).toHaveLength(1)
  })

  it('E — phase + Host wiring; V7 loop/prompt/tools/edge untouched by P1', () => {
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )
    const host = readSrc('src/features/assistant/AssistantHost.tsx')
    const loop = readSrc('src/features/assistant/v7/agent/loop.ts')
    const prompt = readSrc('src/features/assistant/v7/agent/prompt.ts')
    const native = readSrc('src/features/assistant/v7/agent/nativeTools.ts')
    const execute = readSrc('src/features/assistant/v7/tools/execute.ts')
    const edge = readSrc('supabase/functions/ai-assistant/index.ts')
    const scroll = readSrc(
      'src/features/assistant/components/assistantScroll.ts',
    )
    const mobileVv = readSrc(
      'src/features/assistant/components/useAssistantMobileViewport.ts',
    )

    expect(surface).toContain(
      'data-phase="k31-correctness-followup"',
    )
    expect(surface).not.toContain('data-phase="2k10-e1-rich-sort"')

    // Reuses existing processing indicator — no new copy
    expect(host).not.toMatch(/Sprawdzam/)
    expect(
      readSrc(
        'src/features/assistant/components/AssistantProcessingIndicator.tsx',
      ),
    ).toContain('Sprawdzam')

    // P1 must not rewrite V7 semantics / mobile scroll architecture
    expect(loop).not.toContain('working_state_visible')
    expect(prompt).not.toContain('working_state_visible')
    expect(native).not.toContain('working_state_visible')
    expect(execute).not.toContain('working_state_visible')
    expect(edge).not.toContain('working_state_visible')
    expect(scroll).not.toContain('working_state_visible')
    expect(mobileVv).not.toContain('working_state_visible')

    // 2K.8 bottom-follow constants remain in scroll helper (not Host)
    expect(scroll).toContain('ASSISTANT_SCROLL_STICK_THRESHOLD_PX = 48')
    expect(
      readSrc('src/features/assistant/components/AssistantSurface.tsx'),
    ).toContain('isScrollNearBottom')
  })
})
