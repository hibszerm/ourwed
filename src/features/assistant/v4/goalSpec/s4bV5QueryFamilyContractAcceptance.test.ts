/**
 * S4B — Deterministic V5 query-family contract tests (prompt/schema text).
 * Structural only — does not prove Luna model quality.
 *
 * Run:
 * npx tsx --tsconfig tsconfig.app.json \
 *   src/features/assistant/v4/goalSpec/s4bV5QueryFamilyContractAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ASSISTANT_V5_GOALSPEC_JSON_SCHEMA } from './goalSpecSchema'
import { V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT } from './goalSpecInterpreterPrompt'

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`)
}

function assertIncludes(hay: string, needle: string, msg: string) {
  assert(hay.includes(needle), msg)
}

function assertNotInstructsMissingSlotToWrongFamily(prompt: string) {
  // Must NOT instruct: missing/incomplete → clarification/unsupported as the family choice.
  const badPatterns = [
    /missing.{0,40}→\s*unsupported/i,
    /incomplete.{0,40}→\s*unsupported/i,
    /missing.{0,40}→\s*clarification/i,
    /incomplete.{0,40}→\s*clarification/i,
    /if .{0,30}missing.{0,40}requestKind\s*=\s*unsupported/i,
    /if .{0,30}incomplete.{0,40}requestKind\s*=\s*clarification/i,
  ]
  for (const p of badPatterns) {
    assert(!p.test(prompt), `must not instruct missing→wrong family: ${p}`)
  }
  // Positive: incomplete must stay domain_query
  assert(
    /INCOMPLETE QUERY CONTRACT[\s\S]{0,200}requestKind = domain_query/i.test(
      prompt,
    ),
    'incomplete contract must keep domain_query',
  )
}

const root = resolve(process.cwd())
const edgePrompt = readFileSync(
  resolve(root, 'supabase/functions/ai-assistant/v5Prompt.ts'),
  'utf8',
)
const edgeSchema = readFileSync(
  resolve(root, 'supabase/functions/ai-assistant/v5Schema.ts'),
  'utf8',
)
const clientPrompt = V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT

console.log('S4B V5 query-family contract (deterministic)')

// --- Prompt: FAMILY FIRST ---
{
  assertIncludes(clientPrompt, 'FAMILY FIRST', 'client FAMILY FIRST')
  assertIncludes(clientPrompt, 'FAMILY is independent of SLOT COMPLETENESS', 'independence')
  assertIncludes(clientPrompt, 'INCOMPLETE QUERY CONTRACT', 'incomplete contract')
  assertIncludes(
    clientPrompt,
    '→ requestKind = domain_query',
    'incomplete stays domain_query',
  )
  assertIncludes(
    clientPrompt,
    'do NOT emit requestKind=unsupported',
    'no unsupported for incomplete',
  )
  assertIncludes(
    clientPrompt,
    'do NOT emit requestKind=clarification',
    'no clarification for incomplete',
  )
  assertIncludes(
    clientPrompt,
    'NEVER use clarification because a query slot is incomplete',
    'clarification scoped',
  )
  assertIncludes(
    clientPrompt,
    'cannot establish a supported request family',
    'unsupported reserved',
  )
  assertIncludes(
    clientPrompt,
    'It does NOT mean: query missing measure',
    'unsupported ≠ missing measure',
  )
  assertIncludes(
    clientPrompt,
    'Do NOT switch requestKind to unsupported or clarification to express incompleteness',
    'ambiguity section',
  )
  assertIncludes(clientPrompt, 'SEMANTIC COMPLETENESS', 'IC2 semantic completeness')
  assertIncludes(
    clientPrompt,
    'Never simplify a richer request into plain count/list/sum',
    'IC2 no simplify',
  )
  assert(!/najwi[eę]cej/.test(clientPrompt), 'no najwięcej phrase rule')
  assert(!/\bjeszcze\b/.test(clientPrompt), 'no jeszcze phrase rule')
  assertNotInstructsMissingSlotToWrongFamily(clientPrompt)
  console.log('  OK client prompt contract')
}

// --- Edge prompt parity (exported string must match client) ---
{
  const start = edgePrompt.indexOf(
    'export const V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT = `',
  )
  assert(start >= 0, 'edge prompt export found')
  const bodyStart =
    start + 'export const V5_GOALSPEC_INTERPRETER_SYSTEM_PROMPT = `'.length
  const bodyEnd = edgePrompt.lastIndexOf('`')
  assert(bodyEnd > bodyStart, 'edge prompt closing backtick')
  const edgeBody = edgePrompt.slice(bodyStart, bodyEnd)
  assertEqPrompt(edgeBody, clientPrompt, 'Edge↔client prompt parity')
  assertIncludes(edgePrompt, 'FAMILY FIRST', 'edge FAMILY FIRST')
  assertIncludes(edgePrompt, 'INCOMPLETE QUERY CONTRACT', 'edge incomplete')
  console.log('  OK Edge prompt parity')
}

function assertEqPrompt(a: string, b: string, msg: string) {
  if (a !== b) {
    const max = Math.min(a.length, b.length)
    let i = 0
    while (i < max && a[i] === b[i]) i++
    throw new Error(
      `FAIL: ${msg} diverge at ${i}: edge…${JSON.stringify(a.slice(i, i + 40))} vs client…${JSON.stringify(b.slice(i, i + 40))}`,
    )
  }
}

// --- Schema descriptions ---
{
  const desc = (ASSISTANT_V5_GOALSPEC_JSON_SCHEMA as {
    properties: { requestKind: { description?: string } }
  }).properties.requestKind.description
  assert(typeof desc === 'string' && desc.length > 40, 'schema has requestKind description')
  assertIncludes(desc!, 'FAMILY', 'schema family')
  assertIncludes(desc!, 'domain_query', 'schema incomplete→domain_query')
  assertIncludes(desc!, 'Do NOT use unsupported or clarification', 'schema negative')
  assertIncludes(edgeSchema, 'Request FAMILY only', 'edge schema description')
  assertIncludes(edgeSchema, 'Incomplete supported CRM queries MUST stay domain_query', 'edge incomplete')
  // Enum still includes clarification for parse compatibility
  assertIncludes(
    JSON.stringify(ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.properties.requestKind.enum),
    'clarification',
    'enum keeps clarification for compat',
  )
  assertIncludes(
    JSON.stringify(ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.properties.requestKind.enum),
    'unsupported',
    'enum keeps unsupported',
  )
  assert(
    (ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.required as string[]).includes('limit'),
    'schema requires limit (IC2)',
  )
  assert(
    'limit' in ASSISTANT_V5_GOALSPEC_JSON_SCHEMA.properties,
    'schema has limit property (IC2)',
  )
  console.log('  OK schema contract')
}

// --- No application heuristic files introduced by S4B ---
{
  // Guard: this acceptance file itself must not encode auto-promotion.
  const self = readFileSync(
    resolve(root, 'src/features/assistant/v4/goalSpec/s4bV5QueryFamilyContractAcceptance.test.ts'),
    'utf8',
  )
  assert(
    !/aggregation\s*===\s*['"]sum['"].{0,80}requestKind\s*=\s*['"]domain_query['"]/s.test(
      self,
    ),
    'no auto-promote heuristic in contract test',
  )
  console.log('  OK no app auto-promote heuristic in this file')
}

console.log('S4B V5 query-family contract: ALL PASSED')
