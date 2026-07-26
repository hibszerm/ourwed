/**
 * On-demand contract generation guard + missing-data dialog acceptance.
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildReferenceCompany } from '@/lib/dev/referenceWedding'
import { validateContractGeneration } from '@/lib/utils/validateContractGeneration'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import type { Wedding } from '@/types/wedding'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq(actual: unknown, expected: unknown, label: string) {
  if (actual !== expected) {
    throw new Error(
      `${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
}

function stubWedding(overrides: Partial<Wedding> = {}): Wedding {
  return {
    id: 'w1',
    couple: {
      partner1: 'Iza Karczewska',
      partner2: 'Jan Kulewski',
      partner1FirstName: 'Iza',
      partner1LastName: 'Karczewska',
      partner2FirstName: 'Jan',
      partner2LastName: 'Kulewski',
      email: 'iza@example.com',
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
    ...overrides,
  }
}

function stubCompany() {
  return buildReferenceCompany({
    regon: null,
    bankAccount: null,
    iban: null,
  })
}

const page = resolve(process.cwd(), 'src/pages/WeddingDetailPage.tsx')
const dialog = resolve(
  process.cwd(),
  'src/features/weddings/actions/MissingContractDataDialog.tsx',
)
const generateModal = resolve(
  process.cwd(),
  'src/features/weddings/actions/GenerateContractModal.tsx',
)
const v1 = resolve(
  process.cwd(),
  'src/features/weddings/detail/v1/WeddingDetailV1.tsx',
)
const v2Shell = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
)
const finance = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
)

run('1–3. V1/V2/workspace do not show persistent Gotowość umowy', () => {
  assert(!readFileSync(v1, 'utf8').includes('Gotowość umowy'), 'v1')
  assert(!readFileSync(v2Shell, 'utf8').includes('Gotowość umowy'), 'v2 shell')
  assert(!readFileSync(finance, 'utf8').includes('Gotowość umowy'), 'finance')
  assert(
    !existsSync(
      resolve(
        process.cwd(),
        'src/features/weddings/components/detail/WeddingContractReadiness.tsx',
      ),
    ),
    'panel deleted',
  )
})

run('4–7. No readiness counts / categories / checklist on detail', () => {
  const sources = [v1, v2Shell, finance].map((p) =>
    readFileSync(p, 'utf8'),
  ).join('\n')
  assert(!sources.includes('Wymaga uzupełnienia'), 'no status')
  assert(!sources.includes('requiredTotal'), 'no totals')
  assert(!sources.includes('getReadinessGroups'), 'no groups selector')
  const financeSrc = readFileSync(finance, 'utf8')
  assert(!financeSrc.includes('progressTrack'), 'no progress')
  assert(!financeSrc.includes('Firma 4'), 'no category counters')
  assert(financeSrc.includes('Pakiet i usługi'), 'commercial section')
  assert(
    financeSrc.includes('Umowa nie została jeszcze wygenerowana'),
    'lifecycle',
  )
})

run('8–10. Shared guard: complete opens flow; missing blocks', () => {
  const pageSrc = readFileSync(page, 'utf8')
  assert(pageSrc.includes('validateContractGeneration'), 'guard wired')
  assert(pageSrc.includes('handleGenerateContract'), 'shared handler')
  assert(pageSrc.includes("case 'generate_contract'"), 'hero action')
  assert(
    pageSrc.includes('MissingContractDataDialog'),
    'missing dialog',
  )

  const incomplete = validateContractGeneration(stubWedding(), stubCompany())
  assertEq(incomplete.isReady, false, 'not ready')
  assert(incomplete.missingGroups.length > 0, 'has groups')

  const readyWedding = stubWedding({
    couple: {
      ...stubWedding().couple,
      partner1Address: 'ul. Test 1, Kraków',
      partner1Phone: '500100200',
    },
  })
  const ready = validateContractGeneration(
    readyWedding,
    buildReferenceCompany(),
  )
  assertEq(ready.isReady, true, 'ready when complete')
  assertEq(ready.missingGroups.length, 0, 'no blockers')
})

run('11–13. Missing dialog shows only blockers, no counts/percent', () => {
  const src = readFileSync(dialog, 'utf8')
  assert(src.includes('Uzupełnij dane do umowy'), 'title')
  assert(
    src.includes('Przed wygenerowaniem umowy uzupełnij poniższe informacje.'),
    'description',
  )
  assert(!src.includes('%'), 'no percent')
  assert(!src.includes('requiredTotal'), 'no totals')
  assert(!src.includes('status === \'complete\''), 'no complete status UI')
  assert(src.includes('group.items.map'), 'lists missing labels')

  const validation = validateContractGeneration(stubWedding(), stubCompany())
  for (const g of validation.missingGroups) {
    assert(g.items.length > 0, 'group has items')
    assert(!g.items.some((i) => i.includes('/')), 'no fraction labels')
  }
  assert(
    validation.missingGroups.some((g) => g.items.includes('REGON')),
    'REGON blocker',
  )
  assert(
    validation.missingGroups.some((g) => g.items.includes('Numer konta')),
    'account blocker',
  )
})

run('14–17. Contextual correction actions', () => {
  const validation = validateContractGeneration(stubWedding(), stubCompany())
  const company = validation.missingGroups.find((g) => g.id === 'company')
  assertEq(company?.contextualAction.kind, 'company_settings', 'company')
  assert(
    Boolean(company?.contextualAction.label.includes('firm')),
    'company label',
  )

  const pageSrc = readFileSync(page, 'utf8')
  assert(pageSrc.includes("navigate('/ustawienia/firma')"), 'company route')
  assert(pageSrc.includes('beginEdit()'), 'edit couple/package')
  assert(pageSrc.includes("asDeposit: true"), 'deposit action')
})

run('18. Template blockers remain in GenerateContractModal', () => {
  const src = readFileSync(generateModal, 'utf8')
  assert(src.includes('incomplete'), 'incomplete templates')
  assert(src.includes('Dokończ konfigurację'), 'template action')
  assert(
    src.includes('WeddingContractGenerationService.selectTemplates'),
    'shared picker service',
  )
  assert(
    !src.includes('evaluateWeddingContractReadiness'),
    'no wedding readiness UI in modal',
  )
})

run('19. Validation recomputes each attempt (pure function, no cache)', () => {
  const a = validateContractGeneration(stubWedding(), stubCompany())
  const b = validateContractGeneration(stubWedding(), stubCompany())
  assertEq(a.isReady, b.isReady, 'same input same result')
  assert(a !== b, 'new object each call')
  const pageSrc = readFileSync(page, 'utf8')
  assert(pageSrc.includes('setMissingValidation(null)'), 'clears prior')
  assert(
    pageSrc.includes('validateContractGeneration(wedding, company)'),
    'fresh call',
  )
})

run('20. V1/V2 share the same page-level generation guard', () => {
  const pageSrc = readFileSync(page, 'utf8')
  assert(pageSrc.includes('WeddingDetailV1'), 'v1')
  assert(pageSrc.includes('WeddingDetailV2'), 'v2')
  assert(pageSrc.includes('onHeroAction: handleHeroAction'), 'shared')
  assertEq(
    (pageSrc.match(/handleGenerateContract/g) ?? []).length >= 2,
    true,
    'defined and used',
  )
})

run('21. Detail load does not fetch company for readiness UI', () => {
  const shell = readFileSync(v2Shell, 'utf8')
  assert(!shell.includes('companyDetailsService'), 'v2 no company')
  assert(!shell.includes('evaluateWeddingContractReadiness'), 'v2 no eval')
  const v1Src = readFileSync(v1, 'utf8')
  assert(!v1Src.includes('companyDetailsService'), 'v1 no company')
  assert(!v1Src.includes('evaluateWeddingContractReadiness'), 'v1 no eval')
  const pageSrc = readFileSync(page, 'utf8')
  assert(
    pageSrc.includes("queryKey: ['company-details', userId]"),
    'fetch on generate',
  )
  assert(pageSrc.includes('handleGenerateContract'), 'lazy path')
})

run('22. Underlying readiness validator still used by guard', () => {
  const readiness = evaluateWeddingContractReadiness(
    stubWedding(),
    stubCompany(),
  )
  assert(readiness.requiredMissing > 0, 'validator still works')
  const guardSrc = readFileSync(
    resolve(process.cwd(), 'src/lib/utils/validateContractGeneration.ts'),
    'utf8',
  )
  assert(guardSrc.includes('evaluateWeddingContractReadiness'), 'wraps')
})

console.log('\ncontract generation on-demand guard: done')
