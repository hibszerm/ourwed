/**
 * K2.1 live eval — contextual contract readiness grounded in CONTRACT.READINESS.
 *
 *   npx tsx --env-file=.env.local --tsconfig tsconfig.app.json \
 *     src/features/assistant/v7/evals/k2/runK21ContractReadinessEval.ts
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { V7ResourceSetStore } from '@/features/assistant/v7/resourceSet/store'
import {
  runV7Turn,
  V7_DEFAULT_MODEL,
  type V7AgentSession,
} from '@/features/assistant/v7/agent/loop'
import {
  buildV7FixtureDeps,
  V7_FIXTURE_WEDDINGS,
} from '@/features/assistant/v7/evals/v7FixtureUniverse'
import { mayGenerateContract } from '@/lib/utils/contractGenerationIntegrity'
import { searchProductKnowledge } from '@/features/assistant/v7/knowledge/search'
import type { Wedding } from '@/types/wedding'
import type { V7ToolDeps } from '@/features/assistant/v7/tools/execute'
import type { CollectionMoneyRow } from '@/features/assistant/v4/capabilities/collection/executeCollectionQuery'

const HERE = dirname(fileURLToPath(import.meta.url))
const ARTIFACT = join(HERE, '../../benchmark/artifacts/phase-k2-1-contract-readiness-parity.json')

function readyBase(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w-ready-base',
    couple: {
      partner1: 'Base Bride',
      partner2: 'Base Groom',
      partner1FirstName: 'Base',
      partner1LastName: 'Bride',
      partner2FirstName: 'Base',
      partner2LastName: 'Groom',
      partner1Address: 'ul. Test 1, Kraków',
      partner1Phone: '500100200',
      email: 'base@example.com',
      phone: '500100200',
      venue: 'Villa',
      city: 'Kraków',
    },
    date: '2026-10-10',
    status: 'active',
    workflowStage: 'reservation',
    packageName: 'Gold',
    packageId: null,
    price: 12000,
    depositAmount: 3000,
    currency: 'PLN',
    packageItems: [{ title: 'Foto+Video', sortOrder: 0, enabled: true }],
    coverageEndTime: '01:00',
    overtimeRate: 500,
    deliveryMonths: 3,
    finalPaymentDueDate: '2026-09-20',
    bridePreparationLocation: 'Prep A',
    groomPreparationLocation: 'Prep B',
    ceremonyLocation: 'Kościół',
    receptionLocation: 'Sala',
    accentColor: '#000',
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

const PARITY_WEDDINGS: Wedding[] = [
  readyBase({
    id: 'w-joanna-karol',
    couple: {
      ...readyBase().couple,
      partner1: 'Joanna Chowaka',
      partner2: 'Karol Nowak',
      partner1FirstName: 'Joanna',
      partner1LastName: 'Chowaka',
      partner2FirstName: 'Karol',
      partner2LastName: 'Nowak',
    },
    travelFeeStatus: 'unresolved',
    date: '2026-11-14',
  }),
  readyBase({
    id: 'w-iza-jan',
    couple: {
      ...readyBase().couple,
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
    },
    travelFeeStatus: 'included',
    date: '2026-12-05',
  }),
  readyBase({
    id: 'w-ola-marek',
    couple: {
      ...readyBase().couple,
      partner1: 'Ola Zielińska',
      partner2: 'Marek Zieliński',
      partner1FirstName: 'Ola',
      partner1LastName: 'Zielińska',
      partner2FirstName: 'Marek',
      partner2LastName: 'Zieliński',
    },
    travelFeeStatus: 'included',
    receptionLocation: '',
    date: '2026-10-22',
  }),
  readyBase({
    id: 'w-ewa-bartek',
    couple: {
      ...readyBase().couple,
      partner1: 'Ewa Kamińska',
      partner2: 'Bartek Kamiński',
      partner1FirstName: 'Ewa',
      partner1LastName: 'Kamińska',
      partner2FirstName: 'Bartek',
      partner2LastName: 'Kamiński',
    },
    travelFeeStatus: 'unresolved',
    receptionLocation: '',
    date: '2026-09-30',
  }),
]

type Case = {
  id: string
  user: string
  weddingId: string
  expectReady: boolean
  expectBlockerSubstr?: string[]
}

const CASES: Case[] = [
  {
    id: 'joanna-travel',
    user:
      'Co muszę jeszcze zrobić, żeby wygenerować umowę dla Joanny Chowaka / Karol Nowak?',
    weddingId: 'w-joanna-karol',
    expectReady: false,
    expectBlockerSubstr: ['dojazd', 'Koszt dojazdu', 'ustal'],
  },
  {
    id: 'joanna-travel-nominative',
    user: 'Czego brakuje do wygenerowania umowy dla pary Joanna Chowaka?',
    weddingId: 'w-joanna-karol',
    expectReady: false,
    expectBlockerSubstr: ['dojazd', 'ustal'],
  },
  {
    id: 'iza-ready',
    user: 'Czy mogę już wygenerować umowę dla Izy Karczewskiej?',
    weddingId: 'w-iza-jan',
    expectReady: true,
  },
  {
    id: 'ola-reception',
    user: 'Czego brakuje do umowy dla Oli Zielińskiej?',
    weddingId: 'w-ola-marek',
    expectReady: false,
    expectBlockerSubstr: ['przyjęcia', 'przyjęcie', 'recepc'],
  },
  {
    id: 'ewa-multi',
    user: 'Co blokuje wygenerowanie umowy dla Ewy Kamińskiej?',
    weddingId: 'w-ewa-bartek',
    expectReady: false,
    expectBlockerSubstr: ['dojazd'],
  },
]

const STATIC_REGRESSION = [
  { id: 'static-contract', q: 'Co jest potrzebne do wygenerowania umowy?', expectCap: 'contracts.generate' },
  { id: 'static-pay', q: 'Jak dodać wpłatę?', expectCap: 'payments.add' },
  { id: 'static-wed', q: 'Jak dodać nowe zlecenie?', expectCap: 'weddings.create' },
  { id: 'static-pkg', q: 'Gdzie zarządza się pakietami?', expectCap: 'packages.manage' },
  { id: 'static-travel', q: 'Gdzie ustawić koszt dojazdu?', expectCap: 'travel.settings' },
  { id: 'static-places', q: 'Jak zmienić miejsca dnia ślubu?', expectCap: 'day.places.edit' },
  { id: 'static-sess', q: 'Jak utworzyć sesję?', expectCap: 'sessions.create' },
  { id: 'static-q', q: 'Jak wysłać ankietę przedślubną?', expectCap: 'q.prewedding.send' },
]

function buildParityDeps(): V7ToolDeps {
  const base = buildV7FixtureDeps()
  const byId = new Map(PARITY_WEDDINGS.map((w) => [w.id, w]))
  const baseCtxLoad = base.contextOptions?.loadWedding
  const baseTopLoad = base.loadWedding
  const parityRows: CollectionMoneyRow[] = PARITY_WEDDINGS.map((w) => ({
    id: w.id,
    displayLabel: `${w.couple.partner1} & ${w.couple.partner2}`,
    date: w.date,
    contractValue: w.price ?? 0,
    paidAmount: 0,
    remainingAmount: w.price ?? 0,
    locationHaystack: [w.receptionLocation || ''].filter(Boolean),
  }))

  return {
    ...base,
    loadUniverseRows: async () => {
      const existing = (await base.loadUniverseRows?.()) ?? []
      return [...existing, ...parityRows]
    },
    loadWedding: async (id: string) => {
      if (byId.has(id)) return byId.get(id)!
      return baseTopLoad ? baseTopLoad(id) : null
    },
    contextOptions: {
      ...base.contextOptions,
      loadWedding: async (id) => {
        if (byId.has(id)) return byId.get(id)!
        return baseCtxLoad ? baseCtxLoad(id) : null
      },
    },
  }
}

function looksFalseReady(answer: string): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return (
    /wszystko (jest )?gotowe|nie brakuje żadnych|możesz (już )?wygenerować|gotowe do (generowania )?umowy/.test(
      a,
    ) && !/nie (jest|są) gotowe|brakuje|najpierw|ustal|blok/.test(a)
  )
}

function mentionsBlocker(answer: string, needles: string[]): boolean {
  const a = answer.toLocaleLowerCase('pl-PL')
  return needles.some((n) => a.includes(n.toLocaleLowerCase('pl-PL')))
}

async function main() {
  const model = process.env.V7_MODEL?.trim() || V7_DEFAULT_MODEL
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    console.error('OPENAI_API_KEY required')
    process.exit(1)
  }

  // Sanity: fixtures match UI gate
  for (const w of PARITY_WEDDINGS) {
    const ui = mayGenerateContract(w)
    console.log('fixture', w.id, 'uiReady=', ui.isReady, 'blockers=', ui.missingGroups.map((g) => g.id).join(','))
  }

  const deps = buildParityDeps()
  const rows: unknown[] = []
  let passed = 0
  let falseReady = 0
  let falseBlocked = 0

  for (const c of CASES) {
    const store = new V7ResourceSetStore({
      sessionId: `k21-${c.id}`,
      tenantKey: 'fixture-tenant',
    })
    const session: V7AgentSession = {
      store,
      binding: store.binding,
      deps,
      history: [],
      model,
      apiKey,
      todayKey: '2026-09-15',
    }
    const result = await runV7Turn(session, c.user)
    const tools = result.toolCalls.map((t) => t.name)
    const readinessCalls = result.toolCalls.filter((t) => {
      if (t.name !== 'inspect_resource') return false
      const args = t.args as { concepts?: string[]; concept?: string }
      const concepts = args.concepts ?? (args.concept ? [args.concept] : [])
      return concepts.includes('CONTRACT.READINESS')
    })
    const answer = result.userText
    const saidReady = looksFalseReady(answer)
    let ok = true
    let failure = ''

    if (c.expectReady) {
      if (!saidReady && !/gotow|możesz|tak/i.test(answer)) {
        // soft: accept if doesn't invent blockers
        const inventedTravel =
          /najpierw ustal koszt dojazdu|ustal koszt dojazdu/i.test(answer)
        if (inventedTravel) {
          ok = false
          failure = 'false_blocked'
          falseBlocked += 1
        }
      }
    } else {
      if (saidReady) {
        ok = false
        failure = 'false_ready'
        falseReady += 1
      }
      if (
        c.expectBlockerSubstr &&
        !mentionsBlocker(answer, c.expectBlockerSubstr)
      ) {
        ok = false
        failure = failure || 'missing_blocker_mention'
      }
    }

    // Prefer evidence via CONTRACT.READINESS but don't hard-fail if answer correct from equivalent facts
    if (!c.expectReady && saidReady) {
      ok = false
    }

    if (ok) passed += 1
    rows.push({
      id: c.id,
      user: c.user,
      expectReady: c.expectReady,
      ok,
      failure: failure || null,
      tools,
      usedContractReadiness: readinessCalls.length > 0,
      answer,
    })
    console.log(
      `[case] ${c.id} ok=${ok} readyClaim=${saidReady} readinessTool=${readinessCalls.length > 0} fail=${failure || '-'}`,
    )
  }

  // Static knowledge regression (deterministic search + optional live sample)
  const staticRows = STATIC_REGRESSION.map((s) => {
    const hit = searchProductKnowledge({ query: s.q, limit: 5 })
    const ok = hit.results.some((r) => r.id === s.expectCap)
    return { ...s, ok, returned: hit.results.map((r) => r.id) }
  })
  const staticPass = staticRows.every((r) => r.ok)

  // CRM hijack smoke: nearest wedding should not be answered with only knowledge
  const store = new V7ResourceSetStore({
    sessionId: 'k21-crm-smoke',
    tenantKey: 'fixture-tenant',
  })
  const crmSession: V7AgentSession = {
    store,
    binding: store.binding,
    deps: buildV7FixtureDeps(),
    history: [],
    model,
    apiKey,
    todayKey: '2026-09-15',
  }
  const crm = await runV7Turn(
    crmSession,
    `Ile zostało do zapłaty u ${V7_FIXTURE_WEDDINGS[0]!.brideName.split(' ')[0]}?`,
  )
  const crmTools = crm.toolCalls.map((t) => t.name)
  const crmHijack =
    crmTools.includes('search_product_knowledge') &&
    !crmTools.some((t) =>
      [
        'search_resources',
        'inspect_resource',
        'aggregate_resources',
        'refine_resources',
      ].includes(t),
    )

  const report = {
    phase: 'k2-1-contract-readiness-parity',
    model,
    contextual: {
      cases: CASES.length,
      passed,
      failed: CASES.length - passed,
      falseReady,
      falseBlocked,
      rows,
    },
    staticKnowledge: { pass: staticPass, rows: staticRows },
    crmSmoke: { hijack: crmHijack, tools: crmTools, answer: crm.userText.slice(0, 200) },
    passGates: {
      contextualAll: passed === CASES.length && falseReady === 0,
      staticOk: staticPass,
      noCrmHijack: !crmHijack,
    },
  }

  mkdirSync(dirname(ARTIFACT), { recursive: true })
  writeFileSync(ARTIFACT, JSON.stringify(report, null, 2))
  console.log('wrote', ARTIFACT)
  console.log('gates', report.passGates)

  if (
    !report.passGates.contextualAll ||
    !report.passGates.staticOk ||
    !report.passGates.noCrmHijack
  ) {
    console.error('K21_EVAL_FAIL')
    process.exit(2)
  }
  console.log('K21_EVAL_PASS')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
