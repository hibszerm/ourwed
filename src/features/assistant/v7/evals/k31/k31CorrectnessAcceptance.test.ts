/**
 * K3.1 — Soft contains matching for Polish-inflected name queries (generic, no synonym maps).
 */

import assert from 'node:assert/strict'
import {
  compareConceptValue,
  evaluateConceptPredicates,
  stringContainsMatch,
} from '@/features/assistant/shared/adapters/predicateBatch'
import { executeV7Tool } from '@/features/assistant/v7/tools/execute'
import { V7ResourceSetStore } from '@/features/assistant/v7/resourceSet/store'
import { buildV7FixtureDeps } from '@/features/assistant/v7/evals/v7FixtureUniverse'
import { searchProductKnowledge } from '@/features/assistant/v7/knowledge/search'
import { getCapability } from '@/features/assistant/v7/knowledge/registry'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../../../../../')

console.log('k31 — soft contains: genitive dual-name vs nominative display label')
{
  const display = 'Anna Wiśniewska i Piotr Zieliński'
  assert.equal(
    stringContainsMatch(display, 'Anny Wiśniewskiej i Piotra Zielińskiego'),
    true,
  )
  assert.equal(stringContainsMatch(display, 'Anny Wiśniewskiej'), true)
  assert.equal(stringContainsMatch(display, 'Piotra Zielińskiego'), true)
  assert.equal(stringContainsMatch(display, 'Anna Wiśniewska'), true)
  // Unrelated person must not match
  assert.equal(stringContainsMatch(display, 'Magdalena Biała'), false)
  assert.equal(
    compareConceptValue(display, 'contains', 'Anny Wiśniewskiej i Piotra Zielińskiego'),
    true,
  )
}

console.log('k31 — soft contains: accent + case insensitive still works')
{
  assert.equal(stringContainsMatch('Julia Nowak', 'julia'), true)
  assert.equal(stringContainsMatch('Villa Love', 'villa'), true)
}

console.log('k31 — evaluateConceptPredicates DISPLAY_NAME genitive phrase')
{
  const rows = [
    {
      id: 'w-anna',
      displayLabel: 'Anna Wiśniewska i Piotr Zieliński',
      date: '2026-11-08',
      contractValue: 10000,
      paidAmount: 0,
      remainingAmount: 10000,
      status: 'active',
    },
    {
      id: 'w-other',
      displayLabel: 'Magdalena Biała i Igor Czarny',
      date: '2026-12-01',
      contractValue: 5000,
      paidAmount: 0,
      remainingAmount: 5000,
      status: 'active',
    },
  ]
  const result = await evaluateConceptPredicates(
    ['w-anna', 'w-other'],
    [
      {
        concept: 'WEDDING.DISPLAY_NAME',
        cmp: 'contains',
        value: 'Anny Wiśniewskiej i Piotra Zielińskiego',
      },
    ],
    {
      loadUniverseRows: async () => rows as never,
    },
  )
  assert.equal(result.ok, true)
  if (result.ok) {
    assert.deepEqual(result.matchedIds, ['w-anna'])
  }
}

console.log('k31 — search_resources: genitive dual-name via bride+groom (fixture)')
{
  const store = new V7ResourceSetStore({
    sessionId: 'k31-entity',
    tenantKey: 'fixture-tenant',
  })
  const deps = buildV7FixtureDeps()
  const ctx = {
    store,
    binding: store.binding,
    deps,
  }
  // Fixture universe DISPLAY_NAME is short ("Anna & Piotr"); production uses full
  // couple names via getWeddingDisplayName. Bride/groom concepts carry full names.
  const found = await executeV7Tool(ctx, 'search_resources', {
    resource_type: 'wedding',
    predicates: [
      {
        concept: 'CONTACT.BRIDE_NAME',
        comparator: 'contains',
        value: 'Anny Wiśniewskiej',
      },
      {
        concept: 'CONTACT.GROOM_NAME',
        comparator: 'contains',
        value: 'Piotra Zielińskiego',
      },
    ],
  })
  assert.equal(found.ok, true, JSON.stringify(found))
  if (found.ok) {
    const handle =
      (found as { handle?: string }).handle ??
      (found as { data?: { handle?: string } }).data?.handle
    assert.ok(handle, `expected handle in ${JSON.stringify(found).slice(0, 400)}`)
    const described = await executeV7Tool(ctx, 'describe_resource_set', {
      handle,
    })
    assert.equal(described.ok, true, JSON.stringify(described))
    const count =
      (described as { count?: number }).count ??
      (described as { data?: { count?: number; size?: number } }).data?.count ??
      (described as { data?: { size?: number } }).data?.size ??
      (described as { size?: number }).size
    assert.ok(
      typeof count === 'number' && count >= 1,
      `genitive dual-name must resolve >=1, got ${JSON.stringify(described).slice(0, 500)}`,
    )
  }
}

console.log('k31 — DISPLAY_NAME soft match on short label + full production-shaped label')
{
  assert.equal(stringContainsMatch('Anna & Piotr', 'Anny'), true)
  assert.equal(stringContainsMatch('Anna & Piotr', 'Piotra'), true)
  // Full production-shaped display name (getWeddingDisplayName)
  assert.equal(
    stringContainsMatch(
      'Anna Wiśniewska i Piotr Zieliński',
      'Anny Wiśniewskiej i Piotra Zielińskiego',
    ),
    true,
  )
}

console.log('k31 — AND bride+groom nominative still works')
{
  const store = new V7ResourceSetStore({
    sessionId: 'k31-and',
    tenantKey: 'fixture-tenant',
  })
  const deps = buildV7FixtureDeps()
  const ctx = { store, binding: store.binding, deps }
  const found = await executeV7Tool(ctx, 'search_resources', {
    resource_type: 'wedding',
    predicates: [
      {
        concept: 'CONTACT.BRIDE_NAME',
        comparator: 'contains',
        value: 'Anna Wiśniewska',
      },
      {
        concept: 'CONTACT.GROOM_NAME',
        comparator: 'contains',
        value: 'Piotr Zieliński',
      },
    ],
  })
  assert.equal(found.ok, true, JSON.stringify(found))
}

console.log('k31 — questionnaire email capability matches product (email EXISTS)')
{
  const cap = getCapability('notifications.preferences')!
  assert.ok(/e-mail|email/i.test(cap.summary))
  assert.ok(!/nie obsługuje/i.test(cap.summary))
  assert.ok(
    cap.help.steps?.some((s) => /ustawienia\/powiadomienia|E-mail/i.test(s)),
  )
  const hit = searchProductKnowledge({
    query: 'Jak włączyć maile o ankietach?',
    limit: 5,
  })
  assert.ok(
    hit.results.some((r) => r.id === 'notifications.preferences'),
    'email questionnaire query must retrieve preferences',
  )
  const sealed = hit.results.find((r) => r.id === 'notifications.preferences')!
  assert.ok(/e-mail|email|Preferencje/i.test(sealed.summary))
  // Catalog source of truth
  const catalog = readFileSync(
    join(SRC, 'lib/notifications/catalog.ts'),
    'utf8',
  )
  assert.ok(catalog.includes('questionnaire.contract.completed'))
  assert.ok(catalog.includes("email: { defaultEnabled: true"))
}

console.log('k31 — calendar integrations capability matches Google OAuth + Apple subscribe')
{
  const cap = getCapability('calendar.integrations')!
  assert.ok(/Google Calendar/i.test(cap.summary))
  assert.ok(/Apple Calendar/i.test(cap.summary))
  assert.ok(/subskryp/i.test(cap.summary + (cap.help.steps ?? []).join(' ')))
  assert.ok(!/CalDAV|ICS jargon|subskrypcja ICS/i.test(cap.summary))
  const page = readFileSync(
    join(SRC, 'pages/CalendarIntegrationsPage.tsx'),
    'utf8',
  )
  assert.ok(page.includes('Połącz z Google Calendar'))
  assert.ok(page.includes('Subskrybuj prywatny kalendarz OurWed'))
  const hit = searchProductKnowledge({
    query: 'Gdzie ustawia się integrację kalendarza?',
    limit: 5,
  })
  assert.ok(hit.results.some((r) => r.id === 'calendar.integrations'))
}

console.log('k31 anti-sprawl — no name/NL routers added')
{
  const host = readFileSync(join(SRC, 'features/assistant/AssistantHost.tsx'), 'utf8')
  const pred = readFileSync(
    join(SRC, 'features/assistant/shared/adapters/predicateBatch.ts'),
    'utf8',
  )
  assert.ok(!/SYNONYM_MAP|polishIntentMap|Joanna|Chowaka/.test(host))
  assert.ok(!/SYNONYM_MAP|INTENT_TABLE|nameAlias/.test(pred))
  assert.ok(!/if\s*\([^)]*wpłat/.test(host))
}

console.log('K31_CORRECTNESS_DETERMINISTIC_PASS')
