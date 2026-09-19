/**
 * K3 — Expanded registry + retrieval + contextual audit + anti-sprawl.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getCapability,
  listCapabilities,
  P0_CAPABILITY_IDS,
  sealCapability,
} from '@/features/assistant/v7/knowledge/registry'
import { searchProductKnowledge } from '@/features/assistant/v7/knowledge/search'
import {
  K3_CONTEXTUAL_AUDIT,
  K3_LIVE_INVENTORY,
} from '@/features/assistant/v7/knowledge/inventory/k3Inventory'
import {
  K3_PRODUCT_HELP_CORPUS,
  summarizeK3HelpCorpus,
} from './k3ProductHelpCorpus'
import { buildV7SystemPrompt } from '@/features/assistant/v7/agent/prompt'
import { V7_TOOL_NAMES } from '@/features/assistant/v7/tools/execute'
import { V7_NATIVE_TOOLS } from '@/features/assistant/v7/agent/nativeTools'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = join(HERE, '../../../../../')

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

console.log('k3 — inventory + coverage gates')
{
  const caps = listCapabilities()
  const live = K3_LIVE_INVENTORY.classifications.LIVE_CURRENT
  const coverage = caps.length / live
  assert.ok(caps.length >= 75, `caps ${caps.length}`)
  assert.ok(coverage >= 0.8, `coverage ${coverage}`)
  assert.equal(new Set(caps.map((c) => c.id)).size, caps.length)
  for (const id of P0_CAPABILITY_IDS) {
    assert.ok(getCapability(id), id)
  }
  assert.ok(caps.every((c) => c.permissions.canExecute === false))
  assert.ok(
    caps.every(
      (c) => c.knowledge.mode === 'static' || c.knowledge.mode === 'contextual',
    ),
  )
  console.log({
    caps: caps.length,
    live,
    coveragePct: Math.round(coverage * 1000) / 10,
  })
}

console.log('k3 — no experimental/dead leakage in registry ids')
{
  const blob = listCapabilities()
    .map((c) => `${c.id} ${c.title} ${c.summary}`)
    .join('\n')
    .toLowerCase()
  for (const bad of [
    'laboratorium-umow',
    'exact_fact',
    'resourcequery',
    'contract-analysis-eval',
  ]) {
    assert.ok(!blob.includes(bad), bad)
  }
}

console.log('k3 — provenance + seal + feature-owned')
{
  for (const cap of listCapabilities()) {
    assert.ok(cap.provenance.ownerFeature, cap.id)
    assert.ok(cap.provenance.verifiedAgainst.length >= 1, cap.id)
    assert.ok(cap.provenance.lastVerified, cap.id)
    const sealed = sealCapability(cap)
    assert.ok(!('permissions' in sealed))
    assert.ok(!('provenance' in sealed))
  }
  try {
    readFileSync(join(SRC_ROOT, 'features/assistant/assistantKnowledge.ts'))
    assert.fail('assistantKnowledge.ts must not exist')
  } catch (e) {
    assert.ok((e as NodeJS.ErrnoException).code === 'ENOENT')
  }
}

console.log('k3 — contextual audit complete for declared contextual sources')
{
  for (const row of K3_CONTEXTUAL_AUDIT) {
    const cap = getCapability(row.id)
    assert.ok(cap, row.id)
    assert.equal(cap!.knowledge.mode, 'contextual', row.id)
    assert.ok(
      row.parity === 'CANONICAL_SHARED' ||
        row.parity === 'DETERMINISTIC_FACTS' ||
        row.parity === 'MISSING_SAFE_STATE',
    )
    if (row.parity === 'MISSING_SAFE_STATE') {
      assert.fail(`unexpected MISSING_SAFE_STATE for ${row.id}`)
    }
  }
}

console.log('k3 — title retrieval top-k for every capability')
{
  let miss = 0
  const misses: string[] = []
  for (const cap of listCapabilities()) {
    const hit = searchProductKnowledge({ query: cap.title, limit: 8 })
    if (!hit.results.some((r) => r.id === cap.id)) {
      miss += 1
      misses.push(cap.id)
    }
  }
  assert.equal(miss, 0, `title misses: ${misses.join(',')}`)
}

console.log('k3 — deterministic corpus retrieval (query=user text)')
{
  const supported = K3_PRODUCT_HELP_CORPUS.filter(
    (t) => t.expectedCapabilityIds.length > 0,
  )
  let top1 = 0
  let topK = 0
  const byDomain: Record<string, { n: number; k: number }> = {}
  for (const turn of supported) {
    const hit = searchProductKnowledge({ query: turn.user, limit: 8 })
    const ids = hit.results.map((r) => r.id)
    const okK = turn.expectedCapabilityIds.some((id) => ids.includes(id))
    const ok1 =
      ids[0] != null && turn.expectedCapabilityIds.includes(ids[0])
    if (okK) topK += 1
    if (ok1) top1 += 1
    const d = byDomain[turn.domain] ?? { n: 0, k: 0 }
    d.n += 1
    if (okK) d.k += 1
    byDomain[turn.domain] = d
  }
  const topKRecall = topK / supported.length
  const top1Acc = top1 / supported.length
  console.log({
    supported: supported.length,
    top1Acc,
    topKRecall,
    corpus: summarizeK3HelpCorpus(),
    byDomain,
  })
  // Deterministic query=user is diagnostic; live model authors better queries.
  // Soft floor: title-anchored corpus should still retrieve most caps.
  assert.ok(
    topKRecall >= 0.7,
    `deterministic topK too low: ${topKRecall}`,
  )
}

console.log('k3 — search limits + exact id + empty')
{
  const r = searchProductKnowledge({ query: 'wpłatę zaliczkę płatność', limit: 6 })
  assert.ok(r.results.length <= 6)
  assert.ok(r.results.some((x) => x.id.startsWith('payments.')))
  assert.equal(
    searchProductKnowledge({ capability_id: 'calendar.integrations' }).results[0]
      ?.id,
    'calendar.integrations',
  )
  assert.equal(
    searchProductKnowledge({ query: 'zzz-no-such-capability-qqq' }).results
      .length,
    0,
  )
}

console.log('k3 — ready-state grounding principle in prompt (generic)')
{
  const prompt = buildV7SystemPrompt({
    todayKey: '2026-06-15',
    availableHandles: [],
  })
  assert.ok(/kanoniczny stan|ready=true|spełnione/i.test(prompt))
  assert.ok(!prompt.includes('payments.add'))
  assert.ok(!prompt.includes('wzór DOCX'))
}

console.log('k3 — tool surface: knowledge explain-only, no navigate/mutate')
{
  assert.ok(V7_TOOL_NAMES.includes('search_product_knowledge'))
  assert.ok(
    V7_NATIVE_TOOLS.some((t) => t.function.name === 'search_product_knowledge'),
  )
  assert.ok(!V7_TOOL_NAMES.includes('navigate_product'))
  assert.ok(!V7_TOOL_NAMES.includes('execute_capability'))
  for (const cap of listCapabilities()) {
    assert.equal(cap.permissions.canExecute, false)
  }
}

console.log('k3 anti-sprawl = 0')
{
  const host = readSrc('features/assistant/AssistantHost.tsx')
  const surface = readSrc('features/assistant/components/AssistantSurface.tsx')
  const loop = readSrc('features/assistant/v7/agent/loop.ts')
  const knowledgeSearch = readSrc('features/assistant/v7/knowledge/search.ts')
  const registry = readSrc('features/assistant/v7/knowledge/registry.ts')
  const prompt = readSrc('features/assistant/v7/agent/prompt.ts')
  const runtime = [host, surface, loop, knowledgeSearch].join('\n')

  const checks: Array<{ name: string; re: RegExp; hay: string }> = [
    {
      name: 'host_nl_keyword_checks',
      re: /if\s*\([^)]*(includes|match)\([^)]*(wpłat|umow|ankiet|dojazd|pakiet)/i,
      hay: runtime,
    },
    {
      name: 'regex_help_routers',
      re: /(helpQueryFamily|productHelpIntent|faqRouter|FAQ_ROUTER)/,
      hay: runtime,
    },
    {
      name: 'capability_specific_host_branches',
      re: /case\s+['"]payments\.add['"]|capabilityId\s*===\s*['"]payments/,
      hay: runtime,
    },
    {
      name: 'manual_synonym_maps',
      re: /(SYNONYM_MAP|synonymMap|INTENT_TABLE|capabilitySynonyms|polishIntentMap)/,
      hay: runtime + '\n' + registry,
    },
    {
      name: 'prompt_capability_cookbook',
      re: /payments\.add|contracts\.generate|Jak dodać wpłatę/,
      hay: prompt,
    },
  ]
  for (const c of checks) {
    const m = c.hay.match(new RegExp(c.re.source, 'gi'))
    assert.equal(m?.length ?? 0, 0, `${c.name}=${m?.length}`)
  }

  // Central registry must stay thin aggregator (no long Polish help prose)
  assert.ok(!registry.includes('Zakładka Umowa i finanse'))
  assert.ok(!/summary:\s*'/.test(registry))
}

console.log('K3_DETERMINISTIC_PASS')
