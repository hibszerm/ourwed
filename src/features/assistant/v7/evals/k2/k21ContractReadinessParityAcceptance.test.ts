/**
 * K2.1 — CONTRACT.READINESS must mirror UI mayGenerateContract / validateContractGeneration.
 * No duplicated readiness rules in the Assistant adapter.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mayGenerateContract } from '@/lib/utils/contractGenerationIntegrity'
import { validateContractGeneration } from '@/lib/utils/validateContractGeneration'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import { inspectConcept } from '@/features/assistant/v6/adapters/inspectAdapters'
import { WeddingReadContext } from '@/features/assistant/v6/adapters/WeddingReadContext'
import type { Wedding } from '@/types/wedding'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '../../../../../')

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-parity',
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
    packageId: null,
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
      contractData: { status: 'not_sent' },
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

async function inspectReadiness(wedding: Wedding) {
  const ctx = new WeddingReadContext(wedding.id, {
    loadWedding: async () => wedding,
    seeded: { payments: wedding.payments ?? [] },
  })
  return inspectConcept(ctx, 'CONTRACT.READINESS')
}

console.log('k2.1 A — unresolved travel: UI blocked == Assistant blocked')
{
  const w = stubWedding({ travelFeeStatus: 'unresolved' })
  const ui = mayGenerateContract(w)
  assert.equal(ui.isReady, false)
  assert.equal(ui.blockCode, 'TRAVEL_FEE_UNRESOLVED')
  assert.equal(ui.title, 'Najpierw ustal koszt dojazdu.')
  // Incomplete helper alone would wrongly look ready for commercial fields
  const incomplete = evaluateWeddingContractReadiness(w)
  assert.equal(incomplete.overall, 'ready')

  const inspected = await inspectReadiness(w)
  const value = inspected.value as {
    ready: boolean
    overall: string
    blockers: Array<{ code: string; label: string }>
    blockCode?: string
    title?: string
  }
  assert.equal(value.ready, false)
  assert.equal(value.overall, 'needs_attention')
  assert.equal(value.blockCode, 'TRAVEL_FEE_UNRESOLVED')
  assert.ok(value.blockers.some((b) => b.label === 'Koszt dojazdu'))
  assert.equal(inspected.displayText, 'Najpierw ustal koszt dojazdu.')
  console.log('  PASS travel parity')
}

console.log('k2.1 B — fully ready')
{
  const w = stubWedding({ travelFeeStatus: 'included' })
  const ui = mayGenerateContract(w)
  assert.equal(ui.isReady, true)
  const inspected = await inspectReadiness(w)
  const value = inspected.value as { ready: boolean; overall: string; blockers: unknown[] }
  assert.equal(value.ready, true)
  assert.equal(value.overall, 'ready')
  assert.equal(value.blockers.length, 0)
  assert.match(inspected.displayText ?? '', /Gotowe/)
  console.log('  PASS ready parity')
}

console.log('k2.1 C — missing reception (non-travel blocker)')
{
  const w = stubWedding({
    travelFeeStatus: 'included',
    receptionLocation: '',
  })
  const ui = mayGenerateContract(w)
  assert.equal(ui.isReady, false)
  assert.ok(ui.missingGroups.some((g) => g.id === 'client'))
  const inspected = await inspectReadiness(w)
  const value = inspected.value as {
    ready: boolean
    blockers: Array<{ label: string; group: string }>
  }
  assert.equal(value.ready, false)
  assert.ok(value.blockers.some((b) => b.label.includes('przyjęcia') || b.group === 'client'))
  console.log('  PASS reception blocker parity')
}

console.log('k2.1 D — multiple blockers (travel + reception)')
{
  const w = stubWedding({
    travelFeeStatus: 'unresolved',
    receptionLocation: '',
  })
  const ui = mayGenerateContract(w)
  assert.equal(ui.isReady, false)
  assert.ok(ui.missingGroups.length >= 2)
  const inspected = await inspectReadiness(w)
  const value = inspected.value as {
    ready: boolean
    blockers: Array<{ group: string }>
  }
  assert.equal(value.ready, false)
  const groups = new Set(value.blockers.map((b) => b.group))
  assert.ok(groups.has('travel'))
  assert.ok(groups.has('client'))
  assert.ok(value.blockers.length >= 2)
  console.log('  PASS multi-blocker parity')
}

console.log('k2.1 E — contract status none vs generated does not invent ready')
{
  const w = stubWedding({
    travelFeeStatus: 'unresolved',
    contract: { status: 'none' } as Wedding['contract'],
  })
  const ui = mayGenerateContract(w)
  assert.equal(ui.isReady, false)
  const inspected = await inspectReadiness(w)
  assert.equal((inspected.value as { ready: boolean }).ready, false)
  console.log('  PASS generated-state does not override gate')
}

console.log('k2.1 — adapter reuses mayGenerateContract (no duplicate rule body)')
{
  const adapter = readFileSync(
    join(SRC, 'features/assistant/v6/adapters/inspectAdapters.ts'),
    'utf8',
  )
  const block = adapter.slice(
    adapter.indexOf("'contract.readiness'"),
    adapter.indexOf("'task.open_count'"),
  )
  assert.ok(block.includes('projectContractGenerationReadiness'))
  assert.ok(!block.includes('evaluateWeddingContractReadiness('))
  assert.ok(
    !/isTravelFeeResolved\(/.test(block),
    'adapter must not re-implement travel check',
  )
  // Integrity helper projects mayGenerateContract
  const integrity = readFileSync(
    join(SRC, 'lib/utils/contractGenerationIntegrity.ts'),
    'utf8',
  )
  assert.ok(integrity.includes('projectContractGenerationReadiness'))
  assert.ok(integrity.includes('mayGenerateContract(wedding'))
  // UI gate remains validateContractGeneration
  assert.equal(
    mayGenerateContract(stubWedding({ travelFeeStatus: 'unresolved' })).title,
    validateContractGeneration(stubWedding({ travelFeeStatus: 'unresolved' }))
      .title,
  )
  console.log('  PASS single canonical rule')
}

console.log('k2.1 anti-sprawl — no contract NL routers')
{
  const host = readFileSync(join(SRC, 'features/assistant/AssistantHost.tsx'), 'utf8')
  const loop = readFileSync(join(SRC, 'features/assistant/v7/agent/loop.ts'), 'utf8')
  const blob = host + loop
  assert.equal(/contractReadinessIntent|if\s*\([^)]*wygenerowa[cć]/i.test(blob), false)
  assert.equal(/SYNONYM_MAP|productHelpIntent/.test(blob), false)
  console.log('  PASS anti-sprawl')
}

console.log('K21_CONTRACT_READINESS_PARITY_PASS')
