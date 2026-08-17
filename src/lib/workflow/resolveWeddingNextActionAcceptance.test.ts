/**
 * Phase 1A / 1B.1 — shared resolveWeddingNextAction acceptance.
 * Run: npm run test:wedding-next-action
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  PRE_WEDDING_PREP_WINDOW_DAYS,
  resolveWeddingNextAction,
  type WeddingNextActionContext,
} from '@/lib/workflow/resolveWeddingNextAction'
import type { WeddingPlace } from '@/types/travel'
import type { Couple, Payment, Wedding } from '@/types/wedding'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq(a: unknown, b: unknown, m: string) {
  if (a !== b) {
    throw new Error(`${m}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`)
  }
}

function couple(partial: Partial<Couple> = {}): Couple {
  return {
    partner1: 'Anna Kowalska',
    partner2: 'Jan Nowak',
    partner1FirstName: 'Anna',
    partner1LastName: 'Kowalska',
    partner2FirstName: 'Jan',
    partner2LastName: 'Nowak',
    partner1Phone: '500100200',
    email: 'a@example.test',
    phone: '500100200',
    venue: '',
    city: '',
    ...partial,
  }
}

function stub(partial: Partial<Wedding> = {}): Wedding {
  return {
    id: 'wed-next-1',
    date: '2026-12-15',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Standard',
    price: 10000,
    depositAmount: 2000,
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
    accentColor: '#000',
    createdAt: '2026-01-01',
    couple: couple(),
    ...partial,
  }
}

/** Commercial-complete wedding (signed + deposit paid). */
function commercialReady(partial: Partial<Wedding> = {}): Wedding {
  return stub({
    ...partial,
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'not_sent' },
      ...partial.questionnaires,
    },
    contract: partial.contract ?? { status: 'signed', signedAt: '2026-01-05' },
    payments: partial.payments ?? [paidDeposit()],
  })
}

function place(
  role: WeddingPlace['role'],
  label: string,
  id = `place-${role}`,
): WeddingPlace {
  return {
    id,
    weddingId: 'wed-next-1',
    role,
    label,
    placeId: `ChIJ-${role}`,
    formattedAddress: `${label}, Polska`,
    latitude: 50,
    longitude: 19,
    sortOrder: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
}

function paidDeposit(amount = 2000): Payment {
  return {
    id: 'pay-1',
    label: 'Zadatek',
    amount,
    type: 'deposit',
    method: 'transfer',
    paid: true,
    paidAt: '2026-01-10',
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (e) {
    console.error(`FAIL  ${name}`)
    throw e
  }
}

const FAR = '2026-01-01' // ~348 days before 2026-12-15
const NEAR = '2026-12-01' // 14 days before
const IMMINENT = '2026-12-14' // 1 day before
const TODAY_WEDDING = '2026-12-15'
const PAST = '2026-12-20'
const D20 = '2026-11-25' // 20 days before
const D60 = '2026-10-16' // 60 days before

const corePlaces = () => [
  place('ceremony', 'Kościół'),
  place('reception', 'Sala'),
]

run('0. architecture freeze — pure resolver, no task persistence, legacy noted', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/workflow/resolveWeddingNextAction.ts'),
    'utf8',
  )
  assert(!src.includes('taskService'), 'no taskService')
  assert(!src.includes("from('tasks')"), 'no tasks table')
  assert(!src.includes('supabase'), 'no supabase')
  assert(!src.includes('await '), 'no async/await')
  assert(!src.includes('open_prewedding'), 'waiting open_prewedding removed')
  assert(!src.includes('open_cockpit'), 'cockpit next action removed')
  assert(src.includes('resolve_travel_fee'), 'travel gate id')
  assert(src.includes('mark_contract_signed'), 'mark signed id')
  assert(src.includes('PHASE A'), 'lifecycle phases')
  assert(src.includes('PHASE B'), 'deposit phase')
  assert(src.includes('PHASE C'), 'pre-wedding phase')
  assert(src.includes('PHASE D'), 'ops phase')
  assertEq(PRE_WEDDING_PREP_WINDOW_DAYS, 21, 'prep window')

  const engine = readFileSync(
    resolve(process.cwd(), 'src/lib/workflow/workflowEngine.ts'),
    'utf8',
  )
  assert(engine.includes('LEGACY (Phase 1A)'), 'legacy marker')
})

run('1. brand-new → send_contract_questionnaire', () => {
  assertEq(
    resolveWeddingNextAction(stub(), { today: FAR })?.id,
    'send_contract_questionnaire',
    'id',
  )
})

run('2. contract Q sent waiting → no fake Next Action from that domain', () => {
  const a = resolveWeddingNextAction(
    stub({
      questionnaires: {
        contractData: { status: 'sent', sentAt: '2026-01-02' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      couple: couple({
        partner1: '',
        partner2: '',
        partner1FirstName: '',
        partner1LastName: '',
        partner2FirstName: '',
        partner2LastName: '',
        partner1Phone: '',
        phone: '',
        email: '',
      }),
      contract: { status: 'none' },
      depositAmount: 0,
      ceremonyLocation: 'Kościół',
      receptionLocation: 'Sala',
      ceremonyTime: '16:00',
    }),
    { today: IMMINENT, places: corePlaces() },
  )
  assert(a?.id !== 'send_contract_questionnaire', 'not re-send')
  assert(a?.id !== 'generate_contract', 'cannot generate without party/Q complete')
  assert(a?.id !== 'set_ceremony_time', 'no ops leap while waiting')
  assertEq(a, null, 'waiting on couple → no invented CTA')
})

run('3. Q completed + contract none + travel unresolved → resolve_travel_fee', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
      }),
      { today: FAR },
    )?.id,
    'resolve_travel_fee',
    'id',
  )
})

run('3b. travel included + contract none → generate_contract', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
        travelFeeStatus: 'included',
      }),
      { today: FAR },
    )?.id,
    'generate_contract',
    'id',
  )
})

run('1B.1-1. Tomorrow + Q completed + no contract + travel included → generate_contract', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
        travelFeeStatus: 'included',
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces() },
    )?.id,
    'generate_contract',
    'imminent does not skip generate',
  )
})

run('1B.1-2. Tomorrow + generated + unsigned + missing time → mark_contract_signed', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'generated' },
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces() },
    )?.id,
    'mark_contract_signed',
    'commercial before ops',
  )
})

run('1B.1-3. Tomorrow + signed + unpaid deposit + missing time → record_deposit', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        contract: { status: 'signed' },
        depositAmount: 2000,
        payments: [],
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces() },
    )?.id,
    'record_deposit',
    'deposit before ops',
  )
})

run('1B.1-4. Tomorrow + commercial complete + pre not sent → send_prewedding', () => {
  assertEq(
    resolveWeddingNextAction(commercialReady(), {
      today: IMMINENT,
      places: corePlaces(),
    })?.id,
    'send_prewedding',
    'pre before ops',
  )
})

run('1B.1-5. Tomorrow + pre sent waiting + missing time → null', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'sent', sentAt: '2026-12-01' },
        },
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces(), canonicalApplyCandidateCount: 0 },
    ),
    null,
    'waiting — no ceremony-time CTA',
  )
})

run('1B.1-6. Tomorrow + completed + Apply → review_apply', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
      }),
      {
        today: IMMINENT,
        places: [],
        canonicalApplyCandidateCount: 2,
      },
    )?.id,
    'review_apply',
    'Apply after completion',
  )
})

run('1B.1-7. Tomorrow + completed + no Apply + missing location → locations', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyLocation: '',
        receptionLocation: '',
        ceremonyTime: '16:00',
      }),
      {
        today: IMMINENT,
        places: [],
        canonicalApplyCandidateCount: 0,
      },
    )?.id,
    'complete_core_locations',
    'locations',
  )
})

run('1B.1-8. Tomorrow + completed + locations ok + missing time → set_ceremony_time', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces(), canonicalApplyCandidateCount: 0 },
    )?.id,
    'set_ceremony_time',
    'time after completion',
  )
})

run('1B.1-9. Tomorrow + completed + ready → null (no cockpit)', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '16:00',
      }),
      { today: IMMINENT, places: corePlaces(), canonicalApplyCandidateCount: 0 },
    ),
    null,
    'ready → null',
  )
})

run('1B.1-10. 20 days + commercial + pre not sent → send_prewedding', () => {
  assertEq(
    resolveWeddingNextAction(commercialReady(), { today: D20 })?.id,
    'send_prewedding',
    'prep window',
  )
})

run('1B.1-11. 60 days + commercial + pre not sent → null', () => {
  assertEq(
    resolveWeddingNextAction(commercialReady(), { today: D60 }),
    null,
    'outside prep quiet',
  )
})

run('1B.1-12. pre sent waiting — 60/20/1 → no fake operational CTA', () => {
  const base = commercialReady({
    questionnaires: {
      contractData: { status: 'completed' },
      weddingQuestionnaire: { status: 'sent' },
    },
    ceremonyTime: undefined,
  })
  for (const today of [D60, D20, IMMINENT]) {
    const a = resolveWeddingNextAction(base, {
      today,
      places: corePlaces(),
      canonicalApplyCandidateCount: 0,
    })
    assert(a?.id !== 'set_ceremony_time', `${today}: no ceremony`)
    assert(a?.id !== 'complete_core_locations', `${today}: no locations`)
    assert(a?.id !== 'review_apply', `${today}: no apply`)
    assert(a?.id !== 'send_prewedding', `${today}: not re-send`)
    assertEq(a, null, `${today}: waiting null`)
  }
})

run('1B.1-13. manual wedding.ceremonyTime → never set_ceremony_time', () => {
  const a = resolveWeddingNextAction(
    commercialReady({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      ceremonyTime: '15:00',
    }),
    { today: IMMINENT, places: corePlaces(), canonicalApplyCandidateCount: 0 },
  )
  assert(a?.id !== 'set_ceremony_time', 'no set time')
  assertEq(a, null, 'ready → null')
})

run('1B.1-14. ops ceremony override → never set_ceremony_time', () => {
  const ceremony = place('ceremony', 'Kościół', 'cer-1')
  const reception = place('reception', 'Sala', 'rec-1')
  const a = resolveWeddingNextAction(
    commercialReady({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      ceremonyTime: undefined,
    }),
    {
      today: IMMINENT,
      places: [ceremony, reception],
      operationalTimes: { 'cer-1': '15:30' },
      canonicalApplyCandidateCount: 0,
    },
  )
  assert(a?.id !== 'set_ceremony_time', 'ops counts')
  assertEq(a, null, 'ready → null')
})

run('1B.1-15. questionnaire ceremony seed after completed → never set_ceremony_time', () => {
  const a = resolveWeddingNextAction(
    commercialReady({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      ceremonyTime: undefined,
    }),
    {
      today: IMMINENT,
      places: corePlaces(),
      questionnaireCeremonyTime: '14:00',
      canonicalApplyCandidateCount: 0,
    },
  )
  assert(a?.id !== 'set_ceremony_time', 'seed counts')
  assertEq(a, null, 'ready → null')
})

run('1B.1-16. stale workflowStage must not alter result', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        workflowStage: 'wedding_day',
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'generated' },
        ceremonyTime: undefined,
      }),
      { today: IMMINENT, places: corePlaces() },
    )?.id,
    'mark_contract_signed',
    'stage ignored',
  )
})

run('1B.1-17. past + unresolved commercial → preserve V1', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        contract: { status: 'signed' },
        depositAmount: 2000,
        payments: [],
        ceremonyTime: '16:00',
      }),
      { today: PAST, places: corePlaces() },
    )?.id,
    'record_deposit',
    'past money',
  )
})

run('1B.1-18. past + ops gaps only → null', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
        ceremonyLocation: '',
        receptionLocation: '',
      }),
      { today: PAST, places: [], canonicalApplyCandidateCount: 3 },
    ),
    null,
    'no past ops',
  )
})

run('4. contract generated far → mark_contract_signed', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'generated' },
      }),
      { today: FAR },
    )?.id,
    'mark_contract_signed',
    'generated',
  )
})

run('5. contract sent → mark_contract_signed (actionable, not wait copy)', () => {
  const a = resolveWeddingNextAction(
    stub({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      contract: { status: 'sent' },
    }),
    { today: FAR },
  )
  assertEq(a?.id, 'mark_contract_signed', 'id')
  assertEq(a?.title, 'Oznacz umowę jako podpisaną', 'action title')
  assert(!a?.title.toLowerCase().includes('oczek'), 'no waiting title')
})

run('6. signed + deposit unpaid far out → record_deposit', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'signed' },
        depositAmount: 2000,
        payments: [],
      }),
      { today: FAR },
    )?.id,
    'record_deposit',
    'id',
  )
})

run('7. no deposit required → skip deposit', () => {
  const a = resolveWeddingNextAction(
    commercialReady({
      depositAmount: 0,
      payments: [],
      ceremonyLocation: 'Kościół',
      receptionLocation: 'Sala',
      ceremonyTime: '16:00',
    }),
    { today: FAR, places: corePlaces() },
  )
  assert(a?.id !== 'record_deposit', 'skip')
})

run('8. 14 days out commercial ready + pre not sent → send_prewedding', () => {
  assertEq(
    resolveWeddingNextAction(commercialReady(), { today: NEAR })?.id,
    'send_prewedding',
    'id',
  )
})

run('9. pre-wedding sent waiting → null (no ops leap)', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'sent', sentAt: '2026-11-20' },
        },
      }),
      { today: NEAR, places: [], canonicalApplyCandidateCount: 0 },
    ),
    null,
    'waiting',
  )
})

run('10. Apply candidates before manual locations', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
      }),
      {
        today: NEAR,
        places: [],
        canonicalApplyCandidateCount: 3,
      },
    )?.id,
    'review_apply',
    'Apply before locations',
  )
})

run('11. locations before ceremony time', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
      }),
      { today: NEAR, places: [], canonicalApplyCandidateCount: 0 },
    )?.id,
    'complete_core_locations',
    'locations first',
  )
})

run('12. ceremony time when locations ok (completed only)', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
      }),
      { today: NEAR, places: corePlaces(), canonicalApplyCandidateCount: 0 },
    )?.id,
    'set_ceremony_time',
    'time',
  )
})

run('13. today fully ready → null (no cockpit)', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '14:00',
      }),
      {
        today: TODAY_WEDDING,
        places: corePlaces(),
        canonicalApplyCandidateCount: 0,
      },
    ),
    null,
    'today',
  )
})

run('14. past wedding ready → null (no invented post-prod)', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '16:00',
      }),
      { today: PAST, places: corePlaces(), canonicalApplyCandidateCount: 0 },
    ),
    null,
    'past null',
  )
})

run('15. pre-wedding not sent must not expose ceremony-time', () => {
  const a = resolveWeddingNextAction(
    commercialReady({
      ceremonyTime: undefined,
    }),
    { today: IMMINENT, places: corePlaces() },
  )
  assertEq(a?.id, 'send_prewedding', 'send first')
  assert(a?.id !== 'set_ceremony_time', 'no time')
})

run('16. no mutation / no service calls', () => {
  const before = stub()
  const clone = structuredClone(before)
  resolveWeddingNextAction(before, { today: FAR })
  assertEq(JSON.stringify(before), JSON.stringify(clone), 'immutable')
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/workflow/resolveWeddingNextAction.ts'),
    'utf8',
  )
  assert(!/Service\./.test(src), 'no Service.')
  assert(!src.includes('fetch('), 'no fetch')
})

run('17. deterministic priority multi-true → legal wins', () => {
  const ctx: WeddingNextActionContext = {
    today: IMMINENT,
    places: [],
    canonicalApplyCandidateCount: 5,
  }
  assertEq(
    resolveWeddingNextAction(
      stub({
        workflowStage: 'wedding_day',
        questionnaires: {
          contractData: { status: 'not_sent' },
          weddingQuestionnaire: { status: 'completed' },
        },
      }),
      ctx,
    )?.id,
    'send_contract_questionnaire',
    'priority',
  )
})

run('18. note-only / zero Apply count → no review_apply', () => {
  const a = resolveWeddingNextAction(
    commercialReady({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      ceremonyTime: '16:00',
    }),
    {
      today: NEAR,
      places: corePlaces(),
      canonicalApplyCandidateCount: 0,
    },
  )
  assert(a?.id !== 'review_apply', 'no apply')
})

run('19. send_prewedding title is send copy', () => {
  const a = resolveWeddingNextAction(commercialReady(), { today: NEAR })
  assertEq(a?.id, 'send_prewedding', 'id')
  assertEq(a?.title, 'Wyślij ankietę przedślubną', 'title')
})

run('A1. contract Q not sent + travel unresolved → send_contract_questionnaire', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({ travelFeeStatus: 'unresolved' }),
      { today: FAR },
    )?.id,
    'send_contract_questionnaire',
    'Q outranks travel',
  )
})

run('A2. contract Q sent/waiting + travel unresolved → no travel action', () => {
  const a = resolveWeddingNextAction(
    stub({
      questionnaires: {
        contractData: { status: 'sent', sentAt: '2026-01-02' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      couple: couple({
        partner1: '',
        partner2: '',
        partner1FirstName: '',
        partner1LastName: '',
        partner2FirstName: '',
        partner2LastName: '',
        partner1Phone: '',
        phone: '',
        email: '',
      }),
      contract: { status: 'none' },
      travelFeeStatus: 'unresolved',
    }),
    { today: FAR },
  )
  assert(a?.id !== 'resolve_travel_fee', 'no travel while waiting')
  assertEq(a, null, 'waiting')
})

run('A3. contract data ready + none + travel unresolved → resolve_travel_fee', () => {
  const a = resolveWeddingNextAction(
    stub({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'not_sent' },
      },
      contract: { status: 'none' },
      travelFeeStatus: 'unresolved',
    }),
    { today: FAR },
  )
  assertEq(a?.id, 'resolve_travel_fee', 'id')
  assertEq(a?.title, 'Ustal koszt dojazdu', 'title')
})

run('A4. travel included + contract none → generate_contract', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
        travelFeeStatus: 'included',
      }),
      { today: FAR },
    )?.id,
    'generate_contract',
    'included',
  )
})

run('A5. travel charged valid + contract none → generate_contract', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
        travelFeeStatus: 'charged',
        travelFeeAmount: 350,
      }),
      { today: FAR },
    )?.id,
    'generate_contract',
    'charged',
  )
})

run('A6. travel unresolved + contract generated → mark_contract_signed', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'generated' },
        travelFeeStatus: 'unresolved',
      }),
      { today: FAR },
    )?.id,
    'mark_contract_signed',
    'generated not retro travel',
  )
})

run('A7. travel unresolved + contract sent → mark_contract_signed', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'sent' },
        travelFeeStatus: 'unresolved',
      }),
      { today: FAR },
    )?.id,
    'mark_contract_signed',
    'sent not retro travel',
  )
})

run('A8. signed + deposit unpaid → record_deposit (travel unresolved ignored)', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'signed' },
        depositAmount: 2000,
        payments: [],
        travelFeeStatus: 'unresolved',
      }),
      { today: FAR },
    )?.id,
    'record_deposit',
    'deposit',
  )
})

run('A9. stale workflowStage has no effect on travel gate', () => {
  assertEq(
    resolveWeddingNextAction(
      stub({
        workflowStage: 'wedding_day',
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'not_sent' },
        },
        contract: { status: 'none' },
        travelFeeStatus: 'unresolved',
      }),
      { today: FAR },
    )?.id,
    'resolve_travel_fee',
    'stage ignored',
  )
})

run('B1. today + everything ready → null', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '16:00',
      }),
      {
        today: TODAY_WEDDING,
        places: corePlaces(),
        canonicalApplyCandidateCount: 0,
      },
    ),
    null,
    'today ready',
  )
})

run('B3. today + missing ceremony time → set_ceremony_time', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: undefined,
      }),
      {
        today: TODAY_WEDDING,
        places: corePlaces(),
        canonicalApplyCandidateCount: 0,
      },
    )?.id,
    'set_ceremony_time',
    'time',
  )
})

run('B4. today + missing locations → complete_core_locations', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '16:00',
        ceremonyLocation: '',
        receptionLocation: '',
      }),
      { today: TODAY_WEDDING, places: [], canonicalApplyCandidateCount: 0 },
    )?.id,
    'complete_core_locations',
    'locations',
  )
})

run('B5. today + Apply candidates → review_apply', () => {
  assertEq(
    resolveWeddingNextAction(
      commercialReady({
        questionnaires: {
          contractData: { status: 'completed' },
          weddingQuestionnaire: { status: 'completed' },
        },
        ceremonyTime: '16:00',
      }),
      {
        today: TODAY_WEDDING,
        places: corePlaces(),
        canonicalApplyCandidateCount: 2,
      },
    )?.id,
    'review_apply',
    'apply',
  )
})

run('B7. resolver never returns open_cockpit', () => {
  const src = readFileSync(
    resolve(process.cwd(), 'src/lib/workflow/resolveWeddingNextAction.ts'),
    'utf8',
  )
  assert(!src.includes('open_cockpit'), 'id absent')
  const ready = resolveWeddingNextAction(
    commercialReady({
      questionnaires: {
        contractData: { status: 'completed' },
        weddingQuestionnaire: { status: 'completed' },
      },
      ceremonyTime: '16:00',
    }),
    {
      today: TODAY_WEDDING,
      places: corePlaces(),
      canonicalApplyCandidateCount: 0,
    },
  )
  assertEq(ready, null, 'runtime null not cockpit')
})

console.log('\nOK wedding next-action Phase 1B.1 lifecycle acceptance')
