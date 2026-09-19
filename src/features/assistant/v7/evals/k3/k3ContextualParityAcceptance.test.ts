/**
 * K3 contextual + ready-state consistency (deterministic + prompt rule).
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { K3_CONTEXTUAL_AUDIT } from '@/features/assistant/v7/knowledge/inventory/k3Inventory'
import { getCapability, listCapabilities } from '@/features/assistant/v7/knowledge/registry'
import { mayGenerateContract } from '@/lib/utils/contractGenerationIntegrity'
import { inspectConcept } from '@/features/assistant/v6/adapters/inspectAdapters'
import { WeddingReadContext } from '@/features/assistant/v6/adapters/WeddingReadContext'
import type { Wedding } from '@/types/wedding'
import { buildV7SystemPrompt } from '@/features/assistant/v7/agent/prompt'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../../../../../')

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-k3-ctx',
    couple: {
      partner1: 'Joanna Chowaka',
      partner2: 'Karol Nowak',
      partner1FirstName: 'Joanna',
      partner1LastName: 'Chowaka',
      partner2FirstName: 'Karol',
      partner2LastName: 'Nowak',
      partner1Address: 'ul. Test 1, Kraków',
      partner1Phone: '500100200',
      email: 'joanna@example.com',
      phone: '500100200',
      venue: 'Villa Love',
      city: 'Izdebnik',
    },
    date: '2026-07-29',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video Mini',
    packageId: 'pkg-1',
    price: 9500,
    depositAmount: 1000,
    currency: 'PLN',
    packageItems: [{ title: 'Video', sortOrder: 0, enabled: true }],
    coverageEndTime: '00:30',
    overtimeRate: 400,
    deliveryMonths: 3,
    finalPaymentDueDate: '2026-07-15',
    bridePreparationLocation: 'Zabrze prep',
    groomPreparationLocation: 'Ruda prep',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Villa Love',
    accentColor: '#0a0a0a',
    createdAt: '2026-01-01',
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    travelFeeStatus: 'included',
    ...overrides,
  } as Wedding
}

async function readiness(wedding: Wedding) {
  const ctx = new WeddingReadContext(wedding.id, {
    loadWedding: async () => wedding,
    seeded: { payments: wedding.payments ?? [] },
  })
  return inspectConcept(ctx, 'CONTRACT.READINESS')
}

console.log('k3 contextual audit rows present + classified')
{
  assert.ok(K3_CONTEXTUAL_AUDIT.length >= 5)
  for (const row of K3_CONTEXTUAL_AUDIT) {
    assert.ok(getCapability(row.id), row.id)
    assert.ok(
      ['CANONICAL_SHARED', 'DETERMINISTIC_FACTS', 'MISSING_SAFE_STATE'].includes(
        row.parity,
      ),
    )
  }
  const missing = K3_CONTEXTUAL_AUDIT.filter(
    (r) => r.parity === 'MISSING_SAFE_STATE',
  )
  assert.equal(missing.length, 0)
}

console.log('k3 — CONTRACT.READINESS still canonical (ready/blocked)')
{
  const blockedTravel = stubWedding({ travelFeeStatus: 'unresolved' as never })
  const ready = stubWedding({ travelFeeStatus: 'included' })

  const uiBlocked = mayGenerateContract(blockedTravel)
  const uiReady = mayGenerateContract(ready)
  assert.equal(uiBlocked.isReady, false)
  assert.equal(uiReady.isReady, true)

  const aBlocked = await readiness(blockedTravel)
  const aReady = await readiness(ready)
  assert.equal((aBlocked.value as { ready: boolean }).ready, false)
  assert.equal((aReady.value as { ready: boolean }).ready, true)
}

console.log('k3 — generic ready-state grounding (no contract-specific phrase rule)')
{
  const prompt = buildV7SystemPrompt({
    todayKey: '2026-09-15',
    availableHandles: [],
  })
  assert.ok(/kanoniczny stan/i.test(prompt))
  assert.ok(/nie wstawiaj tego samego wymagania/i.test(prompt))
  // Must NOT hardcode the DOCX template caveat as always-on
  assert.ok(!/upewnij się, że wybrany pakiet ma przypisany wzór DOCX/i.test(prompt))
}

console.log('k3 — no duplicated readiness implementation in knowledge layer')
{
  const knowledgeDir = join(SRC, 'features/assistant/v7/knowledge')
  const search = readFileSync(join(knowledgeDir, 'search.ts'), 'utf8')
  const registry = readFileSync(join(knowledgeDir, 'registry.ts'), 'utf8')
  assert.ok(!/mayGenerateContract|validateContractGeneration|travelFeeStatus/.test(search))
  assert.ok(!/mayGenerateContract|validateContractGeneration/.test(registry))
}

console.log('k3 — contextual caps have knowledge.mode contextual')
{
  const contextualIds = new Set(K3_CONTEXTUAL_AUDIT.map((r) => r.id))
  for (const id of contextualIds) {
    assert.equal(getCapability(id)!.knowledge.mode, 'contextual')
  }
  const modes = listCapabilities().filter((c) => c.knowledge.mode === 'contextual')
  assert.ok(modes.length >= contextualIds.size)
}

console.log('K3_CONTEXTUAL_PASS')
