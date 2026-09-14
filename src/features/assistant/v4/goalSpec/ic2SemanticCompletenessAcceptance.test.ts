/**
 * IC2 — Deterministic semantic-shape + contract acceptance (no live Luna).
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/ic2SemanticCompletenessAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'
import { emptyGoalSpec } from './goalSpec'
import { assessSemanticCoverage } from './semanticCoverage'
import { emptyDomainQuery } from '../domainQuery/domainQuery'
import {
  assessIc2SemanticShape,
  isIc2ShapePass,
} from './ic2SemanticShape'
import {
  IC2_SEMANTIC_COMPLETENESS_CORPUS,
  ic2CorpusStats,
} from './ic2SemanticCompletenessCorpus'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'
import { ASSISTANT_V5_GOALSPEC_JSON_SCHEMA } from './goalSpecSchema'
import { parseFlatGoalSpecPayload } from './goalSpecSchema'

const root = resolve(process.cwd())

console.log('IC2 semantic completeness acceptance')

{
  const stats = ic2CorpusStats()
  assert.ok(stats.total >= 60 && stats.total <= 100, `corpus size ${stats.total}`)
  assert.ok(stats.groupRank >= 10, 'group_rank ≥10')
  assert.ok(stats.temporalRemainder >= 10, 'temporal_remainder ≥10')
  assert.ok(stats.criticalQa >= 3, 'critical QA probes')
  console.log(`  OK corpus size=${stats.total}`, stats.byFamily)
}

{
  const prompt = V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT
  assert.ok(prompt.includes('SEMANTIC COMPLETENESS'), 'prompt section')
  assert.ok(
    prompt.includes('do NOT optimize for what the current executor can run') ||
      prompt.includes('You do NOT optimize for what the current executor can run'),
    'no executor optimization',
  )
  assert.ok(
    prompt.includes('Never simplify a richer request into plain count/list/sum'),
    'no simplify',
  )
  assert.ok(!/najwi[eę]cej/.test(prompt), 'no najwięcej phrase rule')
  assert.ok(!/jeszcze/.test(prompt), 'no jeszcze phrase rule')
  assert.ok(!/contains\(['"]naj/.test(prompt), 'no contains naj*')

  const edgePrompt = readFileSync(
    resolve(root, 'supabase/functions/ai-assistant/v5Prompt.ts'),
    'utf8',
  )
  const start = edgePrompt.indexOf(
    'export const V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT = `',
  )
  const bodyStart =
    start + 'export const V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT = `'.length
  const bodyEnd = edgePrompt.lastIndexOf('`')
  const edgeBody = edgePrompt.slice(bodyStart, bodyEnd)
  assert.equal(edgeBody, prompt, 'Edge↔client prompt parity')
  console.log('  OK prompt contract + parity')
}

{
  assert.ok(
    (ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.required as string[]).includes('limit'),
    'schema requires limit',
  )
  assert.ok(
    'limit' in ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.properties,
    'schema has limit property',
  )
  const edgeSchema = readFileSync(
    resolve(root, 'supabase/functions/ai-assistant/v5Schema.ts'),
    'utf8',
  )
  assert.ok(edgeSchema.includes("'limit'"), 'edge required limit')
  assert.ok(edgeSchema.includes('limit:'), 'edge parses limit')
  console.log('  OK schema limit')
}

// Shape evaluator unit cases
{
  const plainCount = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'count',
  })
  const monthMost = assessIc2SemanticShape(plainCount, {
    require: [
      'not_plain_count_without_group_rank',
      'grouping',
      'ranking_or_order',
    ],
    allowUnsupportedSafe: true,
  })
  assert.equal(monthMost.outcome, 'INCOMPLETE_MATERIAL_SEMANTICS')

  const rich = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'rank',
    groupBy: ['wedding.date.month'],
    orderBy: [{ field: 'count', direction: 'desc' }],
    limit: 1,
  })
  const richOk = assessIc2SemanticShape(rich, {
    require: ['grouping', 'ranking_or_order', 'top_n_limit'],
    allowUnsupportedSafe: true,
  })
  assert.equal(richOk.outcome, 'COMPLETE')
  assert.ok(isIc2ShapePass(richOk.outcome))

  const unsup = emptyGoalSpec({
    requestKind: 'unsupported',
    unsupportedReason: 'comparison_not_representable',
  })
  const unsupOk = assessIc2SemanticShape(unsup, {
    require: ['grouping', 'ranking_or_order'],
    allowUnsupportedSafe: true,
  })
  assert.equal(unsupOk.outcome, 'UNSUPPORTED_SAFE')

  const remainderPlain = assessIc2SemanticShape(plainCount, {
    require: ['not_plain_unrestricted_count', 'temporal_expression'],
    allowUnsupportedSafe: true,
  })
  assert.equal(remainderPlain.outcome, 'INCOMPLETE_MATERIAL_SEMANTICS')

  const remainderOk = assessIc2SemanticShape(
    emptyGoalSpec({
      requestKind: 'domain_query',
      source: 'wedding',
      aggregation: 'count',
      temporal: {
        expression: 'do końca tego roku od dziś',
        resolvedRange: null,
        dateDimension: 'wedding.date',
        dateDimensionAmbiguous: false,
      },
    }),
    {
      require: ['not_plain_unrestricted_count', 'temporal_expression'],
      allowUnsupportedSafe: true,
    },
  )
  assert.equal(remainderOk.outcome, 'COMPLETE')
  console.log('  OK shape evaluator')
}

// limit → SC1 incomplete
{
  const goal = emptyGoalSpec({
    requestKind: 'domain_query',
    source: 'wedding',
    aggregation: 'rank',
    groupBy: ['wedding.date.month'],
    orderBy: [{ field: 'count', direction: 'desc' }],
    limit: 1,
  })
  const coverage = assessSemanticCoverage({
    goalSpec: goal,
    domainQuery: emptyDomainQuery({
      source: 'wedding',
      aggregate: 'count',
    }),
  })
  assert.equal(coverage.status, 'incomplete')
  if (coverage.status === 'incomplete') {
    assert.ok(
      coverage.reasonCodes.includes('limit_intent_not_executable') ||
        coverage.reasonCodes.includes('groupby_not_executable') ||
        coverage.reasonCodes.includes('orderby_not_preserved'),
      `expected limit/group/order loss, got ${coverage.reasonCodes.join(',')}`,
    )
  }
  console.log('  OK SC1 limit/group coverage incomplete')
}

// Flat parse round-trip for limit
{
  const parsed = parseFlatGoalSpecPayload({
    version: 1,
    requestKind: 'domain_query',
    dialogue: 'ask',
    source: 'wedding',
    aggregation: 'rank',
    measure: null,
    temporalExpression: null,
    dateDimension: 'wedding.date',
    dateDimensionAmbiguous: false,
    placeName: null,
    placeRole: null,
    packageName: null,
    extraName: null,
    orderByField: 'count',
    orderByDirection: 'desc',
    groupByField: 'wedding.date.month',
    limit: 1,
    aspect0: null,
    aspect1: null,
    ambiguitySlot0: null,
    ambiguityReason0: null,
    ambiguitySlot1: null,
    ambiguityReason1: null,
    inheritActiveCollection: false,
    correctionTargetSlot: null,
    topicKey: null,
    unsupportedReason: null,
    namedTargetText: null,
    namedTargetKindHint: null,
  })
  assert.ok(parsed)
  assert.equal(parsed!.limit, 1)
  assert.deepEqual(parsed!.groupBy, ['wedding.date.month'])
  console.log('  OK flat parse limit')
}

// Corpus integrity: every case has expectation
{
  for (const c of IC2_SEMANTIC_COMPLETENESS_CORPUS) {
    assert.ok(c.expectation.require.length > 0, `${c.id} empty require`)
    assert.ok(c.utterance.trim().length > 0, `${c.id} empty utterance`)
  }
  console.log('  OK corpus integrity')
}

console.log('IC2 semantic completeness acceptance: ALL PASSED')
