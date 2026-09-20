/**
 * C2G — ai-assistant Edge legacy retirement contract.
 *
 * Proves Golden V7 mode remains the production Edge contract, retired
 * historical modes are rejected (not dispatched), and auth/CORS freeze holds.
 *
 *   npx vitest run src/features/assistant/v7/evals/c2gEdgeLegacyRetirementAcceptance.test.ts
 */

import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '../../../../../')
const EDGE_DIR = join(ROOT, 'supabase/functions/ai-assistant')

function readSrc(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8')
}

describe('C2G ai-assistant Edge legacy retirement', () => {
  const edge = readSrc('supabase/functions/ai-assistant/index.ts')
  const invoke = readSrc('src/features/assistant/v7/agent/invokeStep.ts')
  const edgeFiles = readdirSync(EDGE_DIR)

  it('Golden V7 mode remains accepted with unchanged request/response contract', () => {
    expect(invoke).toContain("mode: 'v7_agent_step'")
    expect(invoke).toContain('messages: input.messages')
    expect(invoke).toContain('allowTools: input.allowTools')
    expect(invoke).toContain("status !== 'native_message'")

    expect(edge).toContain("mode === 'v7_agent_step'")
    expect(edge).toContain("status: 'native_message'")
    expect(edge).toContain("const V7_MODEL = 'gpt-5.6-terra'")
    expect(edge).toContain("reasoning_effort: 'none'")
    expect(edge).toContain("'ourwed-v7-golden-2k9-tools-v1'")
    expect(edge).toContain('max_completion_tokens: 1200')
  })

  it('retired legacy modes are rejected, not dispatched', () => {
    for (const mode of [
      'v5_goal_interpret',
      'v6_agent_step',
      'v6_semantic_verify',
      'assistant_runtime_config',
    ] as const) {
      expect(edge).toContain(`cfgMode === '${mode}'`)
      // No live handler branches remain
      expect(edge).not.toContain(`mode === '${mode}'`)
    }
    expect(edge).toContain("code: 'mode_retired'")
    expect(edge).not.toContain('OURWED_ASSISTANT_V5_MODE')
    expect(edge).not.toContain('OURWED_ASSISTANT_V5_CANARY_USER_IDS')
    expect(edge).not.toContain('buildV6NativeToolsRequestBody')
    expect(edge).not.toContain('buildV6SemanticVerifyRequestBody')
    expect(edge).not.toContain('buildV5ChatCompletionRequestBody')
  })

  it('orphaned V5/V6 Edge helpers are absent', () => {
    for (const name of [
      'v5OpenAITransport.ts',
      'v5Prompt.ts',
      'v5Schema.ts',
      'v6NativeTransport.ts',
      'v6Prompt.ts',
      'v6RequestedOperations.ts',
      'v6Schema.ts',
      'v6SemanticVerifier.ts',
    ]) {
      expect(edgeFiles).not.toContain(name)
    }
    // Retained shared / current production surface
    for (const name of [
      'index.ts',
      'prompt.ts',
      'schema.ts',
      'v4Prompt.ts',
      'v4Schema.ts',
    ]) {
      expect(edgeFiles).toContain(name)
    }
  })

  it('auth + CORS requirements remain unchanged', () => {
    expect(edge).toContain('requireAuthenticatedUser')
    expect(edge).toContain('buildRestrictedCorsHeaders')
    expect(edge).toContain("'POST, OPTIONS'")
    expect(edge).toContain("code: 'unauthorized'")
    expect(edge).not.toContain('SERVICE_ROLE')
    expect(edge).not.toContain('SUPABASE_SERVICE_ROLE')
  })

  it('no active source reader for VITE_ASSISTANT_V5_GOAL_SHADOW', () => {
    const prompt = readSrc('supabase/functions/ai-assistant/prompt.ts')
    expect(edge).not.toContain('VITE_ASSISTANT_V5_GOAL_SHADOW')
    expect(prompt).not.toContain('VITE_ASSISTANT_V5_GOAL_SHADOW')
    expect(prompt).not.toContain('resolveGoalSpecInterpreterModel')
    expect(prompt).not.toContain('OURWED_ASSISTANT_V5_MODEL')
  })
})
