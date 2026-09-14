/**
 * U4.2 — Edge V5 GoalSpec recovery + Luna readiness (local contract).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/u42EdgeV5RecoveryAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { interpretGoalSpec } from './interpretGoalSpec'
import { validateGoalSpec } from './goalSpecSchema'
import { normalizeGoalSpecTemporal } from './normalizeGoalSpecTemporal'
import { bindGoalSpecWithClarification } from './resumeGoalClarification'
import {
  buildV5ChatCompletionRequestBody,
  buildV5GoalSpecErrorResponse,
  buildV5GoalSpecSuccessResponse,
  isLunaStyleChatModel,
  sanitizeV5SemanticContextSummary,
  V5_DEFAULT_GOALSPEC_MODEL,
} from '../../../../../supabase/functions/ai-assistant/v5OpenAITransport'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const edgeIndex = read('supabase/functions/ai-assistant/index.ts')
const edgePrompt = read('supabase/functions/ai-assistant/prompt.ts')
const v5Prompt = read('supabase/functions/ai-assistant/v5Prompt.ts')
const v5Schema = read('supabase/functions/ai-assistant/v5Schema.ts')
const transport = read('supabase/functions/ai-assistant/v5OpenAITransport.ts')
const interpretSrc = read(
  'src/features/assistant/v4/goalSpec/interpretGoalSpec.ts',
)

console.log('U4.2 Edge V5 recovery + Luna readiness')

// --- 1. v5_goal_interpret branch exists ---
{
  assert(
    edgeIndex.includes("mode === 'v5_goal_interpret'"),
    'case1 mode branch',
  )
}

// --- 2. V5 cannot fall through to V3 ---
{
  const i5 = edgeIndex.indexOf("if (mode === 'v5_goal_interpret')")
  const i3 = edgeIndex.indexOf('// --- V3 domain planner')
  assert(i5 > 0 && i3 > i5, 'case2 V5 before V3')
  const block = edgeIndex.slice(i5, i3)
  assert(block.includes('return jsonResponse'), 'case2 V5 returns')
  assert(
    block.includes('buildV5GoalSpecErrorResponse') ||
      block.includes("code: 'malformed_model'"),
    'case2 typed V5 errors',
  )
  assert(
    !block.includes('SYSTEM_PROMPT') ||
      block.includes('V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT'),
    'case2 no V3 SYSTEM_PROMPT in V5',
  )
  assert(!block.includes('parseFlatSemanticPayload'), 'case2 no V3 parse')
}

// --- 3. expected input accepted (utterance/locale/semanticContextSummary) ---
{
  const i5 = edgeIndex.indexOf("if (mode === 'v5_goal_interpret')")
  const i3 = edgeIndex.indexOf('// --- V3 domain planner')
  const block = edgeIndex.slice(i5, i3)
  assert(block.includes('semanticContextSummary'), 'case3 semanticContext')
  assert(block.includes('locale'), 'case3 locale')
  assert(edgeIndex.includes('sanitizeUtterance'), 'case3 utterance sanitize')
}

// --- 4. missing required input rejected (shared pre-mode) ---
{
  assert(edgeIndex.includes("code: 'invalid_request'"), 'case4 invalid_request')
  assert(edgeIndex.includes('Missing utterance'), 'case4 missing utterance')
}

// --- 5. V5 prompt/schema used ---
{
  const i5 = edgeIndex.indexOf("if (mode === 'v5_goal_interpret')")
  const i3 = edgeIndex.indexOf('// --- V3 domain planner')
  const block = edgeIndex.slice(i5, i3)
  assert(
    block.includes('V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT'),
    'case5 V5 prompt',
  )
  assert(
    block.includes('ASSISTANT_V5_GOALSPEC_JSON_SCHEMA'),
    'case5 V5 schema',
  )
  assert(block.includes('parseFlatV5GoalSpecPayload'), 'case5 V5 parser')
  assert(v5Prompt.includes('GoalSpec Interpreter'), 'case5 prompt file')
  assert(v5Schema.includes('ASSISTANT_V5_GOALSPEC_JSON_SCHEMA'), 'case5 schema file')
}

// --- 6. Luna selected for V5 ---
{
  assert(
    edgePrompt.includes('resolveGoalSpecInterpreterModel'),
    'case6 resolver',
  )
  assert(
    /resolveGoalSpecInterpreterModel[\s\S]*?gpt-5\.6-luna/.test(edgePrompt),
    'case6 default Luna',
  )
  assert(
    edgeIndex.includes('resolveGoalSpecInterpreterModel()'),
    'case6 V5 uses resolver',
  )
  assert(V5_DEFAULT_GOALSPEC_MODEL === 'gpt-5.6-luna', 'case6 transport default')
  assert(isLunaStyleChatModel('gpt-5.6-luna'), 'case6 luna detect')
}

// --- 7. V3 default model unchanged ---
{
  assert(
    /resolveAssistantModel[\s\S]*?gpt-4\.1-mini/.test(edgePrompt),
    'case7 V3 default gpt-4.1-mini',
  )
  const i3 = edgeIndex.indexOf('// --- V3 domain planner')
  const v3 = edgeIndex.slice(i3)
  assert(v3.includes('model: v3Model'), 'case7 V3 uses v3Model')
  assert(
    edgeIndex.includes('const v3Model = resolveAssistantModel()'),
    'case7 V3 resolver call',
  )
}

// --- 8. V4 model unchanged ---
{
  assert(
    /resolveV4InterpreterModel[\s\S]*?gpt-4\.1'/.test(edgePrompt) ||
      /resolveV4InterpreterModel[\s\S]*?'gpt-4\.1'/.test(edgePrompt),
    'case8 V4 default gpt-4.1',
  )
  const i4 = edgeIndex.indexOf("if (mode === 'v4_interpret')")
  const i5 = edgeIndex.indexOf("if (mode === 'v5_goal_interpret')")
  const v4 = edgeIndex.slice(i4, i5)
  assert(v4.includes('resolveV4InterpreterModel()'), 'case8 V4 resolver')
  assert(v4.includes('temperature: 0'), 'case8 V4 temperature 0')
  assert(v4.includes('max_tokens: 800'), 'case8 V4 max_tokens')
  assert(!v4.includes('gpt-5.6-luna'), 'case8 V4 no Luna')
}

// --- 9–11. Luna transport ---
{
  const lunaBody = buildV5ChatCompletionRequestBody({
    model: 'gpt-5.6-luna',
    messages: [{ role: 'user', content: 'x' }],
    jsonSchemaName: 'assistant_v5_goal_spec',
    jsonSchema: { type: 'object' },
    maxOutputTokens: 900,
  })
  assert(
    lunaBody.max_completion_tokens === 900,
    'case9 max_completion_tokens',
  )
  assert(!('max_tokens' in lunaBody), 'case9 no max_tokens for Luna')
  assert(!('temperature' in lunaBody), 'case10 no temperature:0 for Luna')
  assert(
    (lunaBody.response_format as { type: string }).type === 'json_schema',
    'case11 json_schema',
  )
  assert(
    transport.includes('max_completion_tokens'),
    'case9 transport source',
  )
  const classic = buildV5ChatCompletionRequestBody({
    model: 'gpt-4.1',
    messages: [{ role: 'user', content: 'x' }],
    jsonSchemaName: 'assistant_v5_goal_spec',
    jsonSchema: { type: 'object' },
  })
  assert(classic.temperature === 0, 'case10 gpt-4.1 still temp 0')
  assert(classic.max_tokens === 900, 'case10 gpt-4.1 max_tokens')
}

// --- 12. valid GoalSpec → status goal_spec + client accept ---
{
  const nested = {
    version: 1 as const,
    requestKind: 'domain_query' as const,
    dialogue: 'ask' as const,
    source: 'wedding',
    aggregation: 'sum' as const,
    measure: null,
    temporal: {
      expression: 'sierpień',
      resolvedRange: null,
      dateDimension: 'wedding.date' as const,
      dateDimensionAmbiguous: false,
    },
    relations: [],
    aspects: [],
    ambiguities: [
      { slot: 'measure' as const, reason: 'ambiguous_value_kind' },
    ],
    orderBy: [],
    groupBy: [],
    targets: [],
    inheritance: null,
    correction: null,
    topicKey: null,
    unsupportedReason: null,
  }
  const success = buildV5GoalSpecSuccessResponse({
    goalSpec: nested as unknown as Record<string, unknown>,
    model: 'gpt-5.6-luna',
  })
  assert(success.status === 'goal_spec', 'case12 status')
  assert(success.diagnostics.model === 'gpt-5.6-luna', 'case12 diagnostics.model')

  const client = await interpretGoalSpec({
    userText: 'Ile to będzie?',
    invoke: async () => ({ data: success, error: null }),
  })
  assert(client.ok, 'case12 client accepts goal_spec')
  if (client.ok) {
    assert(validateGoalSpec(client.goalSpec), 'case12 validateGoalSpec')
    assert(client.model === 'gpt-5.6-luna', 'case12 client model')
    const normalized = normalizeGoalSpecTemporal(client.goalSpec)
    const bound = bindGoalSpecWithClarification({
      goal: normalized,
      activeCollectionQuery: null,
      storePending: false,
    })
    assert(
      bound.status === 'needs_clarification' ||
        bound.status === 'bound' ||
        bound.status === 'unsupported',
      'case12 binder reachable',
    )
  }
}

// --- 13. malformed → typed V5 error (not V3) ---
{
  const err = buildV5GoalSpecErrorResponse({ code: 'malformed_model' })
  assert(err.status === 'error', 'case13 error status')
  assert(err.code === 'malformed_model', 'case13 code')
  assert(!('kind' in err), 'case13 no V3 kind')
  assert(!('domainKind' in err), 'case13 no domainKind')
  const client = await interpretGoalSpec({
    userText: 'x',
    invoke: async () => ({ data: err, error: null }),
  })
  assert(!client.ok, 'case13 client rejects')
  if (!client.ok) assert(client.code === 'schema_error', 'case13 schema_error')
}

// --- 14. provider failure → typed V5 error ---
{
  const err = buildV5GoalSpecErrorResponse({ code: 'provider_error' })
  assert(err.code === 'provider_error', 'case14 provider_error')
  const client = await interpretGoalSpec({
    userText: 'x',
    invoke: async () => ({ data: err, error: null }),
  })
  assert(!client.ok && client.code === 'provider_error', 'case14 client')
}

// --- 15. no V3 payload from V5 failure ---
{
  const err = buildV5GoalSpecErrorResponse({ code: 'exception' })
  assert(
    !JSON.stringify(err).includes('assistant_domain_request'),
    'case15 no V3 schema name',
  )
  assert(err.status === 'error', 'case15 stays error')
}

// --- 16. client cannot choose arbitrary model ---
{
  assert(edgeIndex.includes('void body.model'), 'case16 ignore body.model')
  assert(
    edgeIndex.includes('V5_EVAL_MODEL_ALLOWLIST'),
    'case16 V5 eval allowlist',
  )
  assert(
    edgeIndex.includes("'gpt-5.6-luna'"),
    'case16 Luna on V5 allowlist',
  )
  // V4 allowlist must not silently gain Luna
  const iAllow = edgeIndex.indexOf('const V4_EVAL_MODEL_ALLOWLIST')
  const iV5Allow = edgeIndex.indexOf('const V5_EVAL_MODEL_ALLOWLIST')
  const v4Allow = edgeIndex.slice(iAllow, iV5Allow)
  assert(!v4Allow.includes('gpt-5.6-luna'), 'case16 V4 allowlist unchanged')
  assert(!interpretSrc.includes('evalModel'), 'case16 browser interpret no evalModel')
  assert(
    interpretSrc.includes("mode: 'v5_goal_interpret'"),
    'case16 browser sends mode only',
  )
  const invokeBodyMatch = interpretSrc.match(
    /invoke\('ai-assistant',\s*\{[\s\S]*?body:\s*\{([\s\S]*?)\}\s*,?\s*\}\)/,
  )
  assert(Boolean(invokeBodyMatch), 'case16 invoke body found')
  const bodyBlock = invokeBodyMatch![1]
  assert(!/\bmodel\s*:/.test(bodyBlock), 'case16 invoke body has no model')
  assert(!/\bevalModel\s*:/.test(bodyBlock), 'case16 invoke body has no evalModel')
}

// --- 17. no sensitive semantic context expansion ---
{
  const dirty = sanitizeV5SemanticContextSummary({
    previousGoalSummary: {
      requestKind: 'domain_query',
      measure: 'wedding.paid_amount',
    },
    hasActiveCollection: true,
    pageResourceKind: 'wedding',
    notes: 'SECRET CRM NOTE',
    contracts: [{ id: 'x' }],
    payments: [{ amount: 1 }],
    clientRows: [{ name: 'Ada' }],
  })
  assert(dirty != null, 'case17 sanitized')
  const s = JSON.stringify(dirty)
  assert(!s.includes('SECRET'), 'case17 no notes')
  assert(!s.includes('contracts'), 'case17 no contracts')
  assert(!s.includes('payments'), 'case17 no payments')
  assert(!s.includes('clientRows'), 'case17 no clientRows')
  assert(dirty!.hasActiveCollection === true, 'case17 keep compact flags')
}

// --- 18. no write/tool execution from v5_goal_interpret ---
{
  const i5 = edgeIndex.indexOf("if (mode === 'v5_goal_interpret')")
  const i3 = edgeIndex.indexOf('// --- V3 domain planner')
  const block = edgeIndex.slice(i5, i3)
  assert(!/service_role/.test(block), 'case18 no service_role')
  assert(!/createWedding|insert\(|\.from\(/.test(block), 'case18 no CRM write')
  assert(
    block.includes('chat/completions'),
    'case18 only OpenAI completions',
  )
  assert(
    edgeIndex.includes('No CRM tools') ||
      edgeIndex.includes('No CRM tools. No service_role'),
    'case18 file header policy',
  )
}

console.log('U4.2 Edge V5 recovery: cases 1–18 PASSED')
