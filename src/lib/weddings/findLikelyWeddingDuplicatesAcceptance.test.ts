/**
 * Soft duplicate detection for manual create + Path B approve.
 * Run: npx tsx src/lib/weddings/findLikelyWeddingDuplicatesAcceptance.test.ts
 */
import assert from 'node:assert/strict'
import { findLikelyWeddingDuplicates } from './findLikelyWeddingDuplicates'
import type { Wedding } from '@/types/wedding'

function wedding(partial: {
  id: string
  partner1: string
  partner2: string
  date?: string | null
  email?: string
  phone?: string
}): Wedding {
  return {
    id: partial.id,
    date: partial.date ?? null,
    accentColor: '#000',
    price: 0,
    packageName: '',
    packageItems: [],
    finalPaymentDueDate: null,
    finalPaymentTerms: null,
    travelFeeStatus: 'unresolved',
    travelFeeAmount: 0,
    couple: {
      partner1: partial.partner1,
      partner2: partial.partner2,
      email: partial.email ?? '',
      phone: partial.phone ?? '',
      venue: '',
      city: '',
    },
    status: 'active',
    workflowStage: 'reservation',
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
    createdAt: '',
  } as Wedding
}

const existing = [
  wedding({
    id: 'w1',
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    date: '2026-09-12',
    email: 'anna@example.com',
    phone: '500600700',
  }),
  wedding({
    id: 'w2',
    partner1: 'Ewa Inna',
    partner2: 'Piotr Inny',
    date: '2026-09-12',
  }),
]

{
  const hits = findLikelyWeddingDuplicates({
    weddingDate: '2026-09-12',
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    existingWeddings: existing,
  })
  assert.equal(hits.length, 1)
  assert.equal(hits[0]?.weddingId, 'w1')
  assert.ok(hits[0]?.reasons.includes('ta sama data i para'))
}

{
  const hits = findLikelyWeddingDuplicates({
    weddingDate: '2026-09-12',
    partner1: 'Zofia X',
    partner2: 'Marek Y',
    existingWeddings: existing,
  })
  assert.equal(hits.length, 0, 'same date different couple → no warn')
}

{
  const hits = findLikelyWeddingDuplicates({
    weddingDate: '2027-01-01',
    partner1: 'Ktoś',
    partner2: 'Inny',
    email: 'anna@example.com',
    existingWeddings: existing,
  })
  assert.equal(hits.length, 1, 'same email soft warn')
  assert.ok(hits[0]?.reasons.includes('ten sam e-mail'))
}

{
  const hits = findLikelyWeddingDuplicates({
    weddingDate: null,
    partner1: '',
    partner2: '',
    existingWeddings: existing,
  })
  assert.equal(hits.length, 0, 'incomplete → no false warn')
}

console.log('findLikelyWeddingDuplicatesAcceptance: ok')
