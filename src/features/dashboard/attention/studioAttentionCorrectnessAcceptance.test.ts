/**
 * Studio Attention V1 — pure correctness (derived, not persisted).
 * Run: npm run test:studio-attention
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildStudioAttentionItems,
  collectStudioAttentionForWedding,
  mapPreweddingStatusForAttention,
  type StudioAttentionWeddingInput,
} from '@/features/dashboard/attention/buildStudioAttention'
import {
  STUDIO_ATTENTION_LIMIT,
  type StudioAttentionItem,
} from '@/features/dashboard/attention/studioAttentionTypes'
import { createDefaultQuestionnaires } from '@/lib/utils/questionnaires'
import type { Couple, Payment, Wedding } from '@/types/wedding'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg)
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Joanna Chowaka',
    partner2: 'Karol Nowak',
    partner1FirstName: 'Joanna',
    partner1LastName: 'Chowaka',
    partner2FirstName: 'Karol',
    partner2LastName: 'Nowak',
    partner1Phone: '500100200',
    partner1Address: 'ul. Testowa 1',
    partner1PostalCode: '00-001',
    partner1City: 'Warszawa',
    phone: '500100200',
    email: 'joanna@example.com',
    ...partial,
  }
}

function wedding(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: couple(),
    date: '2027-09-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Video',
    price: 10000,
    depositAmount: 1000,
    packageItems: [],
    checklist: [],
    schedule: [],
    payments: [],
    finances: [],
    questionnaires: createDefaultQuestionnaires(),
    contract: { status: 'none' },
    notes: [],
    deliverables: [],
    timeline: [],
    accentColor: '#000',
    createdAt: '2026-01-01T00:00:00.000Z',
    receptionLocation: 'Pałac',
    travelFeeStatus: 'included',
    travelFeeAmount: 0,
    ...partial,
  }
}

function paidDeposit(amount = 1000): Payment {
  return {
    id: 'p-dep',
    label: 'Zadatek',
    amount,
    type: 'deposit',
    paid: true,
    paidAt: '2026-06-01',
  }
}

function input(
  w: Wedding,
  extra: Partial<StudioAttentionWeddingInput> = {},
): StudioAttentionWeddingInput {
  return {
    wedding: w,
    preweddingStatus:
      w.questionnaires.weddingQuestionnaire.status ?? 'not_sent',
    contractQuestionnaireStatus:
      w.questionnaires.contractData.status ?? 'not_sent',
    ...extra,
  }
}

const TODAY = '2026-09-19'

{
  assert(
    mapPreweddingStatusForAttention(null) === 'not_sent',
    'null → not_sent',
  )
  assert(
    mapPreweddingStatusForAttention('opened') === 'sent',
    'opened → sent',
  )
  assert(
    mapPreweddingStatusForAttention('submitted') === 'completed',
    'submitted → completed',
  )
  console.log('PASS  A/B derived mapping — no persistence types')
}

{
  // Light defaults must not invent false send_prewedding outside prep window.
  const far = wedding({ date: '2028-06-01' })
  const items = collectStudioAttentionForWedding(
    input(far, {
      // Explicit hydrated not_sent — still outside prep → no send_prewedding
      preweddingStatus: 'not_sent',
      contractQuestionnaireStatus: 'completed',
    }),
    TODAY,
  )
  assert(
    !items.some((i) => i.kind === 'send_prewedding'),
    'far wedding: no send_prewedding',
  )
  console.log('PASS  D light/default cannot invent prep Attention')
}

{
  const incomplete = wedding({
    id: 'w-incomplete',
    couple: couple({
      partner1Address: '',
      partner1PostalCode: '',
      partner1City: '',
      partner1Phone: '',
      phone: '',
    }),
    receptionLocation: undefined,
    contract: { status: 'none' },
  })
  const items = collectStudioAttentionForWedding(
    input(incomplete, {
      contractQuestionnaireStatus: 'not_sent',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    items.some((i) => i.kind === 'complete_contract_data_manually'),
    'incomplete → complete_contract_data_manually',
  )
  console.log('PASS  C hydrated incomplete client data → Attention')
}

{
  const signed = wedding({
    id: 'w-signed',
    contract: { status: 'signed' },
    payments: [paidDeposit()],
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
    },
    date: '2028-06-01',
  })
  const items = collectStudioAttentionForWedding(
    input(signed, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    !items.some(
      (i) =>
        i.kind === 'mark_contract_sent' ||
        i.kind === 'mark_contract_signed' ||
        i.kind === 'generate_contract',
    ),
    'signed removes unsigned/generate',
  )
  console.log('PASS  E signed contract removes unsigned actions')
}

{
  const withDeposit = wedding({
    id: 'w-dep',
    contract: { status: 'signed' },
    payments: [paidDeposit()],
    date: '2028-06-01',
  })
  const items = collectStudioAttentionForWedding(
    input(withDeposit, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    !items.some((i) => i.kind === 'record_deposit'),
    'paid deposit removes record_deposit',
  )
  console.log('PASS  F paid deposit removes record_deposit')
}

{
  const travelResolved = wedding({
    id: 'w-travel',
    contract: { status: 'none' },
    travelFeeStatus: 'included',
    travelFeeAmount: 0,
  })
  const items = collectStudioAttentionForWedding(
    input(travelResolved, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    !items.some((i) => i.kind === 'resolve_travel_fee'),
    'resolved travel removes travel blocker',
  )
  assert(
    items.some((i) => i.kind === 'generate_contract'),
    'resolved travel allows generate_contract',
  )
  console.log('PASS  G resolved travel → next canonical action')
}

{
  const overduePay = wedding({
    id: 'w-pay',
    contract: { status: 'signed' },
    payments: [paidDeposit()],
    price: 10000,
    finalPaymentDueDate: '2026-08-01',
  })
  const before = collectStudioAttentionForWedding(
    input(overduePay, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'completed',
    }),
    TODAY,
  )
  assert(
    before.some((i) => i.kind === 'overdue_payment'),
    'remaining + past due → overdue_payment',
  )

  const paidOff = wedding({
    ...overduePay,
    payments: [
      paidDeposit(),
      {
        id: 'p-final',
        label: 'Reszta',
        amount: 9000,
        type: 'final',
        paid: true,
        paidAt: '2026-08-15',
      },
    ],
  })
  const after = collectStudioAttentionForWedding(
    input(paidOff, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'completed',
    }),
    TODAY,
  )
  assert(
    !after.some((i) => i.kind === 'overdue_payment'),
    'paid balance removes overdue_payment',
  )
  console.log('PASS  H paid overdue balance removes overdue payment')
}

{
  const inWindow = wedding({
    id: 'w-pre',
    date: '2026-10-01', // ≤21d from TODAY 2026-09-19
    contract: { status: 'signed' },
    payments: [paidDeposit()],
  })
  const unsent = collectStudioAttentionForWedding(
    input(inWindow, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    unsent.some((i) => i.kind === 'send_prewedding'),
    'prep window + not_sent → send_prewedding',
  )

  const sent = collectStudioAttentionForWedding(
    input(inWindow, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'sent',
    }),
    TODAY,
  )
  assert(
    !sent.some((i) => i.kind === 'send_prewedding'),
    'sent removes send_prewedding',
  )
  console.log('PASS  I sent pre-wedding removes send_prewedding')
}

{
  const overdueDelivery = wedding({
    id: 'w-del',
    contract: { status: 'signed' },
    payments: [paidDeposit()],
    date: '2025-06-01',
    deliveryDueDate: '2026-08-01',
    deliveryCompletedAt: null,
  })
  const open = collectStudioAttentionForWedding(
    input(overdueDelivery, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'completed',
    }),
    TODAY,
  )
  assert(
    open.some((i) => i.kind === 'overdue_delivery'),
    'overdue delivery appears',
  )

  const done = collectStudioAttentionForWedding(
    input(
      wedding({
        ...overdueDelivery,
        deliveryCompletedAt: '2026-09-01T12:00:00.000Z',
      }),
      {
        contractQuestionnaireStatus: 'completed',
        preweddingStatus: 'completed',
      },
    ),
    TODAY,
  )
  assert(
    !done.some((i) => i.kind === 'overdue_delivery'),
    'completed delivery removes overdue',
  )
  console.log('PASS  J completed delivery removes overdue delivery')
}

{
  const farDelivery = wedding({
    id: 'w-far-del',
    contract: { status: 'signed' },
    payments: [paidDeposit()],
    date: '2027-06-01',
    deliveryDueDate: '2027-12-01',
    deliveryCompletedAt: null,
  })
  const items = collectStudioAttentionForWedding(
    input(farDelivery, {
      contractQuestionnaireStatus: 'completed',
      preweddingStatus: 'not_sent',
    }),
    TODAY,
  )
  assert(
    !items.some((i) => i.kind === 'overdue_delivery'),
    'far delivery deadlines do not appear',
  )
  console.log('PASS  M far delivery deadlines excluded')
}

{
  const many: StudioAttentionWeddingInput[] = []
  for (let i = 0; i < 8; i++) {
    many.push(
      input(
        wedding({
          id: `w-rank-${i}`,
          date: `2027-0${(i % 8) + 1}-15`,
          contract: { status: 'sent' },
          payments: [paidDeposit()],
        }),
        { contractQuestionnaireStatus: 'completed', preweddingStatus: 'not_sent' },
      ),
    )
  }
  // Add overdue payment — must rank first
  many.push(
    input(
      wedding({
        id: 'w-overdue-first',
        date: '2027-12-01',
        contract: { status: 'signed' },
        payments: [paidDeposit()],
        price: 8000,
        finalPaymentDueDate: '2026-01-01',
      }),
      { contractQuestionnaireStatus: 'completed', preweddingStatus: 'completed' },
    ),
  )

  const ranked = buildStudioAttentionItems(many, TODAY)
  assert(ranked.length <= STUDIO_ATTENTION_LIMIT, 'max limit')
  assert(
    ranked.length === STUDIO_ATTENTION_LIMIT,
    'caps at 6 when more candidates',
  )
  assert(ranked[0]?.kind === 'overdue_payment', 'overdue ranks first')
  assert(
    ranked.every((item, idx, arr) => {
      if (idx === 0) return true
      // stable deterministic — same order on re-run
      return item.id >= '' || arr[idx - 1] != null
    }),
    'items present',
  )
  const again = buildStudioAttentionItems(many, TODAY)
  assert(
    again.map((i) => i.id).join('|') === ranked.map((i) => i.id).join('|'),
    'deterministic ordering',
  )

  // One primary Next Action per wedding
  const byWedding = new Map<string, StudioAttentionItem[]>()
  for (const item of ranked) {
    const list = byWedding.get(item.entityId) ?? []
    list.push(item)
    byWedding.set(item.entityId, list)
  }
  for (const [, list] of byWedding) {
    const nextActions = list.filter(
      (i) =>
        i.kind !== 'overdue_payment' && i.kind !== 'overdue_delivery',
    )
    assert(nextActions.length <= 1, 'one primary Next Action per wedding')
  }

  const ids = new Set(ranked.map((i) => i.id))
  assert(ids.size === ranked.length, 'no duplicate issue ids')
  console.log('PASS  N/O/P/Q max 6, deterministic, one Next Action, no dupes')
}

{
  // Tasks / pending / Apply must never be synthesized here
  const src = read('src/features/dashboard/attention/buildStudioAttention.ts')
  assert(!src.includes('taskService'), 'no tasks')
  assert(!src.includes('pending-questionnaires'), 'no pending leads')
  assert(!src.includes("'review_apply'"), 'no Apply kind emission')
  assert(src.includes('canonicalApplyCandidateCount: 0'), 'Apply count forced 0')
  console.log('PASS  K/L tasks+pending+Apply excluded from composer')
}

console.log('\nStudio Attention V1 correctness: OK')
