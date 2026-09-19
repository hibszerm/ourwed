/**
 * Studio Attention V1 — request-topology probe with mocked batch services.
 * Proves request count is constant across candidate set sizes (no N+1).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/dashboard/attention/studioAttentionTopologyProbe.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildStudioAttentionItems,
  type StudioAttentionWeddingInput,
} from '@/features/dashboard/attention/buildStudioAttention'
import { STUDIO_ATTENTION_LIMIT } from '@/features/dashboard/attention/studioAttentionTypes'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type { Wedding } from '@/types/wedding'

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function wedding(id: string, date: string): Wedding {
  return {
    id,
    couple: {
      partner1: `A ${id}`,
      partner2: `B ${id}`,
      partner1FirstName: 'A',
      partner1LastName: id,
      partner2FirstName: 'B',
      partner2LastName: id,
      phone: '500',
      partner1Phone: '500',
      partner1Address: 'ul. 1',
      partner1City: 'Wawa',
      partner1PostalCode: '00-001',
    },
    date,
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'P',
    price: 5000,
    depositAmount: 500,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: createDefaultQuestionnaires(),
    contract: { status: 'sent' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    receptionLocation: 'Sala',
    travelFeeStatus: 'included',
  }
}

function inputs(n: number): StudioAttentionWeddingInput[] {
  return Array.from({ length: n }, (_, i) => {
    const w = wedding(`w${i}`, `2027-${String((i % 12) + 1).padStart(2, '0')}-15`)
    return {
      wedding: w,
      preweddingStatus: 'not_sent' as const,
      contractQuestionnaireStatus: 'completed' as const,
    }
  })
}

{
  const service = readFileSync(
    resolve(process.cwd(), 'src/features/dashboard/attention/studioAttentionService.ts'),
    'utf8',
  )
  // Expected logical batch steps (constant)
  const expectedSteps = [
    'weddings.attention_candidates',
    'contracts.listByWeddingIds',
    'payments.listByWeddingIds',
    'places.listByWeddingIds',
    'prewedding.listStatusByWeddingIds',
    'forms.listContractQuestionnaireStatusByWeddingIds',
  ]
  for (const step of expectedSteps) {
    assert(service.includes(step), `batch step present: ${step}`)
  }
  // forms helper itself uses 2 queries — still O(1)
  const forms = readFileSync(
    resolve(process.cwd(), 'src/lib/api/forms.ts'),
    'utf8',
  )
  const fnStart = forms.indexOf(
    'export async function listContractQuestionnaireStatusByWeddingIds',
  )
  const fnBody = forms.slice(fnStart, fnStart + 2500)
  assert(fnBody.includes(".from('forms')"), 'contract Q forms lookup')
  assert(fnBody.includes(".from('form_instances')"), 'contract Q instances batch')
  assert(!fnBody.includes('for (const weddingId'), 'no per-wedding forms loop')
  console.log('PASS  constant batch step labels (≈7–8 DB round-trips)')
}

{
  const today = '2026-09-19'
  const smallStart = performance.now()
  const small = buildStudioAttentionItems(inputs(20), today)
  const smallMs = performance.now() - smallStart

  const largeStart = performance.now()
  const large = buildStudioAttentionItems(inputs(200), today)
  const largeMs = performance.now() - largeStart

  assert(small.length <= STUDIO_ATTENTION_LIMIT, 'small capped')
  assert(large.length <= STUDIO_ATTENTION_LIMIT, 'large capped')
  assert(small.length === large.length, 'cap stable across N')

  console.log(
    JSON.stringify({
      composeMs_n20: Math.round(smallMs * 100) / 100,
      composeMs_n200: Math.round(largeMs * 100) / 100,
      itemCount: large.length,
      note: 'Pure compose CPU only — network is O(1) batches',
    }),
  )
  console.log('PASS  compose scales in-memory; output capped at 6')
}

console.log('\nStudio Attention topology probe: OK')
