/**
 * Phase 2K.10-E1 — generic rich sort evidence.
 *
 * Proves:
 * - optional evidence_concepts is model-supplied only (no NL inference in app)
 * - absent evidence_concepts ≡ Golden sort
 * - evidence fields ≡ inspect_resource for same member/concepts
 * - Presentation refs match inspect path
 * - mocked agent loop collapses sort→inspect→final (3 LLM) → rich-sort→final (2 LLM)
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '../resourceSet/store'
import {
  executeV7Tool,
  inspectResource,
  searchResources,
  sortResources,
  type V7ToolContext,
} from '../tools/execute'
import { projectV7PresentationTurn } from '../presentation/projectV7Presentation'
import { runV7Turn, type V7AgentSession } from '../agent/loop'
import {
  buildV7FixtureDeps,
  fixtureLargestRemainingInYearEnd,
  V7_FIXTURE_TODAY,
  V7_FIXTURE_WEDDINGS,
  V7_FIXTURE_SESSIONS,
} from './v7FixtureUniverse'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '../../../../..')

function readSrc(rel: string): string {
  return readFileSync(join(root, rel), 'utf8')
}

const binding = { sessionId: 'sess-2k10e1', tenantKey: 'tenant-2k10e1' }

function ctx(store: V7ResourceSetStore): V7ToolContext {
  return { store, binding, deps: buildV7FixtureDeps() }
}

type FieldRow = {
  concept: string
  value: unknown
  filled: boolean
  display_text?: string | null
  privacy: string
}

describe('Phase 2K.10-E1 rich sort evidence', () => {
  it('source — no NL/lexical routing; optional evidence_concepts only on sort', () => {
    const execute = readSrc('src/features/assistant/v7/tools/execute.ts')
    const native = readSrc('src/features/assistant/v7/agent/nativeTools.ts')
    const prompt = readSrc('src/features/assistant/v7/agent/prompt.ts')
    const surface = readSrc(
      'src/features/assistant/components/AssistantSurface.tsx',
    )

    expect(surface).toContain('data-phase="k31-correctness-followup"')
    expect(native).toContain('evidence_concepts')
    expect(native).toContain("name: 'sort_resources'")
    // search must NOT gain evidence_concepts in this phase
    const searchBlock = native.slice(
      native.indexOf("name: 'search_resources'"),
      native.indexOf("name: 'refine_resources'"),
    )
    expect(searchBlock).not.toContain('evidence_concepts')

    expect(execute).toContain('evidence_concepts')
    expect(execute).toContain('loadInspectFieldsForMember')
    expect(execute).not.toMatch(/utterance|userText|toLowerCase\(\).*telefon/i)
    // No phone/tomorrow/nearest special-casing for evidence
    expect(execute).not.toMatch(
      /evidence_concepts[\s\S]{0,200}(telefon|tomorrow|najbliż|phone)/i,
    )
    expect(prompt).toContain('evidence_concepts')
    expect(prompt).not.toMatch(
      /evidence_concepts[\s\S]{0,120}(telefon|phone|jutro|tomorrow)/i,
    )
  })

  it('absent evidence_concepts — identical Golden sort semantics', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const sorted = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
    })
    expect(sorted.ok).toBe(true)
    if (!sorted.ok) return
    expect(sorted).not.toHaveProperty('evidence')
    expect(sorted.count).toBe(1)
    expect(sorted.parent_handle).toBe(search.handle)
    const got = store.get(sorted.handle, binding)
    expect(got.ok && got.record.memberIds).toEqual([
      fixtureLargestRemainingInYearEnd().id,
    ])
  })

  it('evidence fields ≡ inspect_resource for winner (desc ranking)', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const concepts = [
      'FIN.REMAINING_TO_PAY',
      'WEDDING.DISPLAY_NAME',
      'CONTACT.BRIDE_PHONE',
    ]
    const rich = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
      evidence_concepts: concepts,
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok) return
    expect(rich.evidence).toBeDefined()
    expect(rich.evidence!.length).toBe(1)
    const winner = rich.evidence![0]!
    expect(winner.ordinal).toBe(1)

    const inspected = await inspectResource(c, {
      handle: rich.handle,
      ordinal: 1,
      concepts,
    })
    expect(inspected.ok).toBe(true)
    if (!inspected.ok) return

    expect(winner.display_name).toEqual(inspected.display_name)
    expect(winner.fields.map((f) => f.concept)).toEqual(
      inspected.fields.map((f) => f.concept),
    )
    for (let i = 0; i < concepts.length; i++) {
      const a = winner.fields[i]!
      const b = inspected.fields[i]!
      expect(a.filled).toBe(b.filled)
      expect(a.privacy).toBe(b.privacy)
      expect(a.value).toEqual(b.value)
      expect(a.display_text ?? null).toEqual(b.display_text ?? null)
    }
  })

  it('ascending ranking + multi-member evidence + subsequent handle inspect', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: '2026-01-01',
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const rich = await sortResources(c, {
      handle: search.handle,
      concept: 'WEDDING.DATE',
      direction: 'asc',
      limit: 3,
      evidence_concepts: ['WEDDING.DATE', 'WEDDING.DISPLAY_NAME'],
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok) return
    expect(rich.count).toBe(3)
    expect(rich.evidence!.length).toBe(3)

    // ResourceSet order preserved vs evidence ordinals
    const record = store.get(rich.handle, binding)
    expect(record.ok).toBe(true)
    if (!record.ok) return
    for (let i = 0; i < 3; i++) {
      const insp = await inspectResource(c, {
        handle: rich.handle,
        ordinal: i + 1,
        concepts: ['WEDDING.DATE', 'WEDDING.DISPLAY_NAME'],
      })
      expect(insp.ok).toBe(true)
      if (!insp.ok) return
      expect(rich.evidence![i]!.fields).toEqual(insp.fields)
    }
  })

  it('session sort evidence when supported', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      resource_type: 'session',
      date_start: '2026-01-01',
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    if (search.count === 0) {
      expect(V7_FIXTURE_SESSIONS.length).toBeGreaterThan(0)
      return
    }

    const rich = await sortResources(c, {
      handle: search.handle,
      concept: 'SESSION.DATE',
      direction: 'asc',
      limit: 1,
      evidence_concepts: ['SESSION.DATE', 'SESSION.DISPLAY_NAME'],
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok) return
    const insp = await inspectResource(c, {
      handle: rich.handle,
      ordinal: 1,
      concepts: ['SESSION.DATE', 'SESSION.DISPLAY_NAME'],
    })
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    expect(rich.evidence![0]!.fields).toEqual(insp.fields)
  })

  it('missing / empty evidence concept values stay filled:false (parity)', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    // Single known wedding set via predicate on display name of a fixture
    const search = await searchResources(c, {
      date_start: '2020-01-01',
      date_end: '2030-12-31',
      predicates: [
        {
          concept: 'WEDDING.DISPLAY_NAME',
          comparator: 'contains',
          value: 'Julia',
        },
      ],
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const rich = await sortResources(c, {
      handle: search.handle,
      concept: 'WEDDING.DATE',
      direction: 'asc',
      limit: 1,
      evidence_concepts: ['CONTACT.BRIDE_PHONE', 'CONTACT.GROOM_PHONE'],
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok) return
    const insp = await inspectResource(c, {
      handle: rich.handle,
      ordinal: 1,
      concepts: ['CONTACT.BRIDE_PHONE', 'CONTACT.GROOM_PHONE'],
    })
    expect(insp.ok).toBe(true)
    if (!insp.ok) return
    expect(rich.evidence![0]!.fields).toEqual(insp.fields)
  })

  it('rejects domain-mismatched evidence concept (same as inspect)', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return
    const bad = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
      evidence_concepts: ['SESSION.DATE'],
    })
    expect(bad.ok).toBe(false)
  })

  it('Presentation refs from sort evidence ≡ inspect path', async () => {
    const store = new V7ResourceSetStore(binding)
    const c = ctx(store)
    const search = await searchResources(c, {
      date_start: V7_FIXTURE_TODAY,
      date_end: '2026-12-31',
    })
    expect(search.ok).toBe(true)
    if (!search.ok) return

    const concepts = ['CONTACT.BRIDE_PHONE', 'FIN.REMAINING_TO_PAY']
    const rich = await sortResources(c, {
      handle: search.handle,
      concept: 'FIN.REMAINING_TO_PAY',
      direction: 'desc',
      limit: 1,
      evidence_concepts: concepts,
    })
    expect(rich.ok).toBe(true)
    if (!rich.ok) return

    const goldenInspect = await inspectResource(c, {
      handle: rich.handle,
      ordinal: 1,
      concepts,
    })
    expect(goldenInspect.ok).toBe(true)
    if (!goldenInspect.ok) return

    const candidate = projectV7PresentationTurn({
      utterance: 'które ma najwyższą kwotę?',
      store,
      binding,
      result: {
        ok: true,
        userText: 'To wesele ma najwyższą pozostałą kwotę.',
        toolCalls: [
          { name: 'sort_resources', args: {}, result: rich },
        ],
        toolCallCount: 1,
        stoppedReason: 'final',
        latency: {
          firstModelMs: 1,
          toolExecutionMs: [1],
          subsequentModelMs: [],
          finalResponseMs: 1,
          totalMs: 3,
        },
        model: 'gpt-5.6-terra',
      },
    })

    const golden = projectV7PresentationTurn({
      utterance: 'które ma najwyższą kwotę?',
      store,
      binding,
      result: {
        ok: true,
        userText: 'To wesele ma najwyższą pozostałą kwotę.',
        toolCalls: [
          {
            name: 'sort_resources',
            args: {},
            result: {
              ok: true,
              handle: rich.handle,
              count: rich.count,
              description: rich.description,
              resource_type: rich.resource_type,
              parent_handle: rich.parent_handle,
            },
          },
          {
            name: 'inspect_resource',
            args: { handle: rich.handle, ordinal: 1, concepts },
            result: goldenInspect,
          },
        ],
        toolCallCount: 2,
        stoppedReason: 'final',
        latency: {
          firstModelMs: 1,
          toolExecutionMs: [1, 1],
          subsequentModelMs: [],
          finalResponseMs: 1,
          totalMs: 4,
        },
        model: 'gpt-5.6-terra',
      },
    })

    const candPhones = (candidate.references ?? []).filter(
      (r) => r.kind === 'phone',
    )
    const goldPhones = (golden.references ?? []).filter(
      (r) => r.kind === 'phone',
    )
    expect(candPhones.map((r) => r.actions)).toEqual(
      goldPhones.map((r) => r.actions),
    )
    const candOpen = (candidate.references ?? []).filter(
      (r) => r.kind === 'wedding' || r.kind === 'session',
    )
    const goldOpen = (golden.references ?? []).filter(
      (r) => r.kind === 'wedding' || r.kind === 'session',
    )
    expect(candOpen.map((r) => r.entityId).sort()).toEqual(
      goldOpen.map((r) => r.entityId).sort(),
    )
  })

  it('round-count architecture — ranking on existing handle: 3 LLM → 2 LLM', async () => {
    type Msg = {
      role?: string
      content?: string | null
      tool_calls?: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }

    async function runScripted(mode: 'golden' | 'rich'): Promise<{
      llmCalls: number
      toolNames: string[]
      ok: boolean
    }> {
      const store = new V7ResourceSetStore({
        sessionId: `sess-${mode}`,
        tenantKey: 'tenant-2k10e1',
      })
      const c = ctx(store)
      const search = await searchResources(c, {
        date_start: V7_FIXTURE_TODAY,
        date_end: '2026-12-31',
      })
      expect(search.ok).toBe(true)
      if (!search.ok) return { llmCalls: 0, toolNames: [], ok: false }
      const handle = search.handle

      let llmCalls = 0
      const fetchImpl: typeof fetch = async (_url, init) => {
        llmCalls += 1
        const body = JSON.parse(String(init?.body ?? '{}')) as {
          tools?: unknown
        }
        const hasTools = Array.isArray(body.tools)
        let message: Msg

        if (mode === 'rich') {
          if (llmCalls === 1 && hasTools) {
            message = {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_sort',
                  type: 'function',
                  function: {
                    name: 'sort_resources',
                    arguments: JSON.stringify({
                      handle,
                      concept: 'FIN.REMAINING_TO_PAY',
                      direction: 'desc',
                      limit: 1,
                      evidence_concepts: [
                        'FIN.REMAINING_TO_PAY',
                        'WEDDING.DISPLAY_NAME',
                      ],
                    }),
                  },
                },
              ],
            }
          } else {
            message = {
              role: 'assistant',
              content: 'To wesele ma najwyższą pozostałą kwotę.',
            }
          }
        } else {
          // Golden: sort then inspect then final → 3 LLM
          if (llmCalls === 1 && hasTools) {
            message = {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_sort',
                  type: 'function',
                  function: {
                    name: 'sort_resources',
                    arguments: JSON.stringify({
                      handle,
                      concept: 'FIN.REMAINING_TO_PAY',
                      direction: 'desc',
                      limit: 1,
                    }),
                  },
                },
              ],
            }
          } else if (llmCalls === 2 && hasTools) {
            let sortedHandle = handle
            const parsedBody = JSON.parse(String(init?.body ?? '{}')) as {
              messages?: Array<{ role?: string; content?: string | null }>
            }
            for (const m of parsedBody.messages ?? []) {
              if (m.role === 'tool' && typeof m.content === 'string') {
                try {
                  const tool = JSON.parse(m.content) as { handle?: string }
                  if (tool.handle) sortedHandle = tool.handle
                } catch {
                  /* ignore */
                }
              }
            }
            message = {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_inspect',
                  type: 'function',
                  function: {
                    name: 'inspect_resource',
                    arguments: JSON.stringify({
                      handle: sortedHandle,
                      ordinal: 1,
                      concepts: [
                        'FIN.REMAINING_TO_PAY',
                        'WEDDING.DISPLAY_NAME',
                      ],
                    }),
                  },
                },
              ],
            }
          } else {
            message = {
              role: 'assistant',
              content: 'To wesele ma najwyższą pozostałą kwotę.',
            }
          }
        }

        return new Response(
          JSON.stringify({
            choices: [{ message }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }

      const session: V7AgentSession = {
        store,
        binding: store.binding,
        history: [
          {
            role: 'user',
            content: 'pokaż wesela do końca roku',
          },
          {
            role: 'assistant',
            content: 'Mam zestaw wesel do końca roku.',
          },
        ],
        model: 'gpt-5.6-terra',
        apiKey: 'test-key',
        transport: 'direct',
        fetchImpl,
        deps: buildV7FixtureDeps(),
        todayKey: V7_FIXTURE_TODAY,
      }

      const result = await runV7Turn(
        session,
        'które z nich ma największą pozostałą kwotę?',
      )
      return {
        llmCalls,
        toolNames: result.toolCalls.map((t) => t.name),
        ok: result.ok,
      }
    }

    const golden = await runScripted('golden')
    const rich = await runScripted('rich')

    expect(golden.ok).toBe(true)
    expect(rich.ok).toBe(true)
    expect(golden.toolNames).toEqual(['sort_resources', 'inspect_resource'])
    expect(rich.toolNames).toEqual(['sort_resources'])
    expect(golden.llmCalls).toBe(3)
    expect(rich.llmCalls).toBe(2)
  })

  it('fixture inventory sanity for parity coverage', () => {
    expect(V7_FIXTURE_WEDDINGS.length).toBeGreaterThan(1)
    expect(fixtureLargestRemainingInYearEnd().id).toBeTruthy()
  })
})
