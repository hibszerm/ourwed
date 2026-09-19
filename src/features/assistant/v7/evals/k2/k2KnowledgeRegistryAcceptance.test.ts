/**
 * K2 — Capability Registry + search_product_knowledge deterministic acceptance.
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
import { executeV7Tool, V7_TOOL_NAMES } from '@/features/assistant/v7/tools/execute'
import {
  V7_NATIVE_TOOLS,
  assertV7ToolSurface,
} from '@/features/assistant/v7/agent/nativeTools'
import { buildV7SystemPrompt } from '@/features/assistant/v7/agent/prompt'
import { V7ResourceSetStore } from '@/features/assistant/v7/resourceSet/store'
import { buildV7FixtureDeps } from '@/features/assistant/v7/evals/v7FixtureUniverse'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC_ROOT = join(HERE, '../../../../../')

function readSrc(rel: string): string {
  return readFileSync(join(SRC_ROOT, rel), 'utf8')
}

console.log('k3 registry — aggregate + unique ids + P0 retained')
{
  const caps = listCapabilities()
  assert.ok(caps.length >= 75, `expected >=75 caps, got ${caps.length}`)
  const ids = caps.map((c) => c.id)
  assert.equal(new Set(ids).size, ids.length)
  for (const id of P0_CAPABILITY_IDS) {
    assert.ok(getCapability(id), `missing P0 ${id}`)
  }
  assert.ok(caps.every((c) => c.permissions.canExecute === false))
  assert.ok(caps.every((c) => c.knowledge.mode === 'static' || c.knowledge.mode === 'contextual'))
}

console.log('k2 — feature-owned paths exist (no giant assistantKnowledge.ts)')
{
  const giant = join(
    SRC_ROOT,
    'features/assistant/assistantKnowledge.ts',
  )
  try {
    readFileSync(giant)
    assert.fail('assistantKnowledge.ts must not exist')
  } catch (e) {
    assert.ok((e as NodeJS.ErrnoException).code === 'ENOENT')
  }
  const owners = [
    'features/weddings/capabilities/weddingsCapabilities.ts',
    'features/finance/capabilities/paymentsCapabilities.ts',
    'features/documents/capabilities/contractsCapabilities.ts',
    'features/documents/capabilities/documentsCapabilities.ts',
    'features/questionnaires/capabilities/questionnairesCapabilities.ts',
    'features/prewedding/capabilities/preweddingCapabilities.ts',
    'features/studio/capabilities/packagesCapabilities.ts',
    'features/travel/capabilities/travelCapabilities.ts',
    'features/wedding-day/capabilities/dayCapabilities.ts',
    'features/wedding-brief/capabilities/briefCapabilities.ts',
    'features/sessions/capabilities/sessionsCapabilities.ts',
    'features/tasks/capabilities/tasksCapabilities.ts',
    'features/dashboard/capabilities/dashboardCapabilities.ts',
    'features/calendar/capabilities/calendarCapabilities.ts',
    'features/calendar-integrations/capabilities/calendarIntegrationsCapabilities.ts',
    'features/notifications/capabilities/notificationsCapabilities.ts',
    'features/company/capabilities/companyCapabilities.ts',
    'features/account/capabilities/accountCapabilities.ts',
    'features/appearance/capabilities/appearanceCapabilities.ts',
    'features/billing/capabilities/billingCapabilities.ts',
    'features/onboarding/guide/capabilities/guideCapabilities.ts',
  ]
  for (const o of owners) {
    assert.ok(readSrc(o).includes('id:'), o)
  }
}

console.log('k2 — provenance + canExecute false + seal')
{
  for (const cap of listCapabilities()) {
    assert.ok(cap.provenance.ownerFeature)
    assert.ok(cap.provenance.verifiedAgainst.length >= 1)
    assert.ok(cap.provenance.lastVerified)
    assert.equal(cap.permissions.canExecute, false)
    assert.equal(cap.permissions.canExplain, true)
    const sealed = sealCapability(cap)
    assert.equal(sealed.id, cap.id)
    assert.ok(!('permissions' in sealed))
    assert.ok(!('provenance' in sealed))
    assert.ok(sealed.summary.length > 10)
  }
}

console.log('k2 — route metadata sanity vs known routes')
{
  const router = readSrc('routes/router.tsx')
  const tabs = readSrc(
    'features/weddings/detail/v2/weddingWorkspaceSelectors.ts',
  )
  const knownStatic = [
    '/sluby/nowy',
    '/sluby',
    '/studio/pakiety',
    '/ustawienia/podroz',
    '/sesje/nowa',
    '/zadania',
    '/przewodnik',
    '/oczekujace',
    '/ankiety/dane-do-umowy',
  ]
  for (const r of knownStatic) {
    assert.ok(router.includes(`'${r}'`) || router.includes(`"${r}"`) || router.includes(r), r)
  }
  assert.ok(tabs.includes('contract_finance'))
  assert.ok(tabs.includes('wedding_day'))
  assert.ok(tabs.includes('pre_wedding_questionnaire'))

  for (const cap of listCapabilities()) {
    if (!cap.navigation) continue
    const pat = cap.navigation.routePattern
    assert.ok(pat.startsWith('/'), cap.id)
    if (pat.includes('tab=contract_finance')) {
      assert.ok(tabs.includes('contract_finance'))
    }
    if (pat.includes('tab=wedding_day')) {
      assert.ok(tabs.includes('wedding_day'))
    }
    if (pat.includes('tab=pre_wedding_questionnaire')) {
      assert.ok(tabs.includes('pre_wedding_questionnaire'))
    }
  }
}

console.log('k2 — generic search returns only registry; limit; exact id')
{
  const allIds = new Set(listCapabilities().map((c) => c.id))
  const r1 = searchProductKnowledge({ query: 'dodaj wpłatę zaliczkę płatności', limit: 5 })
  assert.ok(r1.results.length <= 5)
  assert.ok(r1.results.length >= 1)
  assert.ok(r1.results.every((x) => allIds.has(x.id)))
  assert.equal(r1.results[0]?.id, 'payments.add')

  const r2 = searchProductKnowledge({ capability_id: 'contracts.generate' })
  assert.equal(r2.results.length, 1)
  assert.equal(r2.results[0]?.id, 'contracts.generate')

  const r3 = searchProductKnowledge({ query: 'xyznonexistentcapabilityzzz' })
  assert.equal(r3.results.length, 0)

  const r4 = searchProductKnowledge({ query: 'pakiety studio', limit: 8 })
  assert.ok(r4.results.some((x) => x.id === 'packages.manage'))
}

console.log('k2 — each P0 retrievable by title tokens')
{
  for (const id of P0_CAPABILITY_IDS) {
    const cap = getCapability(id)!
    const hit = searchProductKnowledge({ query: cap.title, limit: 5 })
    assert.ok(
      hit.results.some((r) => r.id === id),
      `title search miss: ${id}`,
    )
  }
}

console.log('k2 — tool surface + execute (no mutation)')
{
  assertV7ToolSurface()
  assert.ok(V7_TOOL_NAMES.includes('search_product_knowledge'))
  assert.ok(
    V7_NATIVE_TOOLS.some((t) => t.function.name === 'search_product_knowledge'),
  )
  // Existing CRM tools still present
  for (const name of [
    'search_resources',
    'inspect_resource',
    'select_nearest_assignments',
  ] as const) {
    assert.ok(V7_TOOL_NAMES.includes(name))
  }

  const store = new V7ResourceSetStore()
  const deps = buildV7FixtureDeps()
  const ctx = {
    store,
    binding: {
      sessionId: 'k2-test-session',
      tenantKey: 'fixture-owner',
    },
    deps,
  }
  const ok = await executeV7Tool(ctx, 'search_product_knowledge', {
    query: 'jak wygenerować umowę',
    limit: 4,
  })
  assert.equal(ok.ok, true)
  if (ok.ok) {
    const results = (ok as { results: Array<{ id: string }> }).results
    assert.ok(results.some((r) => r.id === 'contracts.generate'))
  }

  const bad = await executeV7Tool(ctx, 'search_product_knowledge', {})
  assert.equal(bad.ok, false)
}

console.log('k2 — prompt mentions knowledge tool generically (no cookbook)')
{
  const prompt = buildV7SystemPrompt({
    todayKey: '2026-06-15',
    availableHandles: [],
  })
  assert.ok(prompt.includes('search_product_knowledge'))
  assert.ok(!prompt.includes('payments.add'))
  assert.ok(!prompt.includes('Jak dodać wpłatę'))
  assert.ok(!/if\s+.*wpłat/i.test(prompt))
}

console.log('k2 anti-sprawl — Host NL / synonym / intent routers = 0')
{
  const host = readSrc('features/assistant/AssistantHost.tsx')
  const surface = readSrc('features/assistant/components/AssistantSurface.tsx')
  const loop = readSrc('features/assistant/v7/agent/loop.ts')
  const knowledgeSearch = readSrc('features/assistant/v7/knowledge/search.ts')
  const registry = readSrc('features/assistant/v7/knowledge/registry.ts')
  const corpus = [host, surface, loop, knowledgeSearch, registry].join('\n')

  const forbiddenPatterns: Array<{ name: string; re: RegExp }> = [
    {
      name: 'host_nl_keyword_checks',
      re: /if\s*\([^)]*(includes|match)\([^)]*(wpłat|umow|ankiet|dojazd|pakiet)/i,
    },
    {
      name: 'regex_help_routers',
      re: /(helpQueryFamily|productHelpIntent|faqRouter|FAQ_ROUTER)/,
    },
    {
      name: 'capability_specific_host_branches',
      re: /case\s+['"]payments\.add['"]|capabilityId\s*===\s*['"]payments/,
    },
    {
      name: 'manual_synonym_maps',
      re: /(SYNONYM_MAP|synonymMap|INTENT_TABLE|capabilitySynonyms|polishIntentMap)/,
    },
  ]

  const counts: Record<string, number> = {}
  for (const f of forbiddenPatterns) {
    const m = corpus.match(new RegExp(f.re.source, 'gi'))
    counts[f.name] = m?.length ?? 0
    assert.equal(counts[f.name], 0, `${f.name}=${counts[f.name]}`)
  }
  console.log('anti-sprawl counts', counts)
}

console.log('K2_DETERMINISTIC_PASS')
