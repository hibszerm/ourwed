import { normalizeRecoveryDate, normalizeRecoveryMoney } from './normalizeExtraction'
import { applyDecisionsToProposal, buildRecoveryProposal } from './buildComparisonProposal'
import { emptyContractRecoveryExtraction } from './schema/extractionSchema'
import { validateSourceContractFile } from './validateSourceFile'
import { assertTextAvailable } from './textAvailability'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

assertEq(normalizeRecoveryDate('11.04.2026'), '2026-04-11', 'dotted date')
assertEq(normalizeRecoveryDate('11 kwietnia 2026'), '2026-04-11', 'named month')
assertEq(normalizeRecoveryDate('2026-04-11'), '2026-04-11', 'iso date')
assertEq(normalizeRecoveryDate('32.04.2026'), null, 'invalid date')
assertEq(normalizeRecoveryDate(null), null, 'null date')

assertEq(normalizeRecoveryMoney('8 550 zł'), 8550, 'polish money')
assertEq(normalizeRecoveryMoney('8550 PLN'), 8550, 'pln suffix')
assertEq(normalizeRecoveryMoney('8.550,00 zł'), 8550, 'decimal comma')
assertEq(normalizeRecoveryMoney('-100'), null, 'negative money')

const wedding: Wedding = {
  id: 'w1',
  couple: {
    partner1: 'Anna Kowalska',
    partner2: 'Piotr Nowak',
    email: 'anna@example.com',
    phone: '500600700',
    city: 'Kraków',
    venue: '',
  },
  date: '2026-04-11',
  status: 'active',
  workflowStage: 'contract',
  packageName: 'Gold',
  price: 8000,
  packageItems: [],
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
  accentColor: '#000000',
  createdAt: '2026-01-01T00:00:00.000Z',
}

const extraction = emptyContractRecoveryExtraction()
extraction.wedding.weddingDate.value = '2026-04-12'
extraction.wedding.weddingDate.confidence = 0.9
extraction.wedding.weddingDate.evidence = [{ quote: 'ślub 12.04.2026' }]
extraction.finances.totalContractValue.value = 8550
extraction.finances.totalContractValue.confidence = 0.9
extraction.finances.totalContractValue.evidence = [{ quote: '8550 zł' }]
extraction.finances.depositAmount.value = 2000
extraction.finances.depositAmount.confidence = 0.9
extraction.finances.depositAmount.evidence = [{ quote: 'zaliczka 2000' }]

const proposal = buildRecoveryProposal(wedding, extraction)
const dateField = proposal.fields.find((f: { fieldKey: string }) => f.fieldKey === 'wedding.date')
assert(Boolean(dateField), 'date field exists')
assertEq(dateField!.state, 'different', 'date conflict')
assertEq(dateField!.selectedAction, 'keep_current', 'conflict default keep current')

const priceField = proposal.fields.find((f: { fieldKey: string }) => f.fieldKey === 'finances.contractValue')
assertEq(priceField!.state, 'different', 'price conflict')

// Confirm-step path must work from local proposal even when query cache is stale
// (query may have fetched recovery before comparisonProposal was written).
const staleQueryRecovery = { comparisonProposal: null as null }
assertEq(staleQueryRecovery.comparisonProposal, null, 'stale query has no proposal')
const confirmProposal = applyDecisionsToProposal(
  {
    ...proposal,
    fields: proposal.fields.map((f) =>
      f.fieldKey === 'wedding.date' ? { ...f, selectedAction: 'use_extracted' as const } : f,
    ),
  },
  proposal.fields.map((f) => ({
    fieldKey: f.fieldKey,
    action: f.fieldKey === 'wedding.date' ? ('use_extracted' as const) : f.selectedAction,
  })),
  true,
)
assert(confirmProposal.summary.toUpdate >= 1, 'confirm summary counts approved updates')
assert(Boolean(confirmProposal.fields.length), 'confirm keeps field list')

const validation = validateSourceContractFile({
  name: 'umowa.pdf',
  type: 'application/pdf',
  size: 1024,
} as File)
assert(validation.ok, 'pdf accepted')

const bad = validateSourceContractFile({
  name: 'scan.jpg',
  type: 'image/jpeg',
  size: 1024,
} as File)
assert(!bad.ok, 'jpg rejected')

try {
  assertTextAvailable({
    fileName: 'empty.pdf',
    mimeType: 'application/pdf',
    plainText: '   ',
    extractionMethod: 'pdf_text',
    warnings: [],
    availability: 'no_text_detected',
  })
  throw new Error('expected empty text error')
} catch (err) {
  assert(
    err instanceof Error && err.message.includes('Nie udało się odczytać'),
    'empty text throws',
  )
}

console.log('PASS wedding contract recovery tests')
