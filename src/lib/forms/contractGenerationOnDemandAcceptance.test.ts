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
const host = resolve(
  process.cwd(),
  'src/features/weddings/detail/useWeddingDetailHost.ts',
)
const dialog = resolve(
  process.cwd(),
  'src/features/weddings/actions/MissingContractDataDialog.tsx',
)
const generateModal = resolve(
  process.cwd(),
  'src/features/weddings/actions/GenerateContractModal.tsx',
)
const v2Shell = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
)
const finance = resolve(
  process.cwd(),
  'src/features/weddings/detail/v2/WeddingContractFinanceWorkspace.tsx',
)

run('1–3. Workspace does not show persistent Gotowość umowy', () => {
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
  const sources = [v2Shell, finance].map((p) =>
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
  const hostSrc = readFileSync(host, 'utf8')
  assert(hostSrc.includes('validateContractGeneration'), 'guard wired')
  assert(hostSrc.includes('handleGenerateContract'), 'shared handler')
  assert(hostSrc.includes("case 'generate_contract'"), 'hero action')
  assert(
    hostSrc.includes('MissingContractDataDialog') ||
      readFileSync(
        resolve(
          process.cwd(),
          'src/features/weddings/detail/WeddingDetailHostModals.tsx',
        ),
        'utf8',
      ).includes('MissingContractDataDialog'),
    'missing dialog',
  )

  const incomplete = validateContractGeneration(stubWedding(), stubCompany())
  assertEq(incomplete.isReady, false, 'not ready')
  assert(incomplete.missingGroups.length > 0, 'has groups')

  const readyWedding = stubWedding({
    travelFeeStatus: 'included',
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

  const travelUnresolved = validateContractGeneration(
    stubWedding({
      travelFeeStatus: 'unresolved',
      couple: {
        ...stubWedding().couple,
        partner1Address: 'ul. Test 1, Kraków',
        partner1Phone: '500100200',
      },
    }),
    buildReferenceCompany(),
  )
  assertEq(travelUnresolved.isReady, false, 'travel unresolved blocks')
  assertEq(
    travelUnresolved.blockCode,
    'TRAVEL_FEE_UNRESOLVED',
    'controlled travel code',
  )
  assertEq(
    travelUnresolved.title,
    'Najpierw ustal koszt dojazdu.',
    'travel polish title',
  )
  assertEq(
    travelUnresolved.primaryCorrection?.kind,
    'edit_travel_fee',
    'travel correction',
  )

  const travelChargedZero = validateContractGeneration(
    stubWedding({
      travelFeeStatus: 'charged',
      travelFeeAmount: 0,
      couple: {
        ...stubWedding().couple,
        partner1Address: 'ul. Test 1, Kraków',
        partner1Phone: '500100200',
      },
    }),
    buildReferenceCompany(),
  )
  assertEq(travelChargedZero.isReady, false, 'charged 0 blocks')

  const travelChargedOk = validateContractGeneration(
    stubWedding({
      travelFeeStatus: 'charged',
      travelFeeAmount: 350,
      couple: {
        ...stubWedding().couple,
        partner1Address: 'ul. Test 1, Kraków',
        partner1Phone: '500100200',
      },
    }),
    buildReferenceCompany(),
  )
  assertEq(travelChargedOk.isReady, true, 'charged valid allows')

  const travelLegacyNull = validateContractGeneration(
    stubWedding({
      travelFeeStatus: undefined,
      travelFeeAmount: undefined,
      couple: {
        ...stubWedding().couple,
        partner1Address: 'ul. Test 1, Kraków',
        partner1Phone: '500100200',
      },
    }),
    buildReferenceCompany(),
  )
  assertEq(travelLegacyNull.isReady, false, 'legacy null blocks')
})

run('company optional fields do not globally block generation', () => {
  const readyWedding = stubWedding({
    travelFeeStatus: 'included',
    couple: {
      ...stubWedding().couple,
      partner1Address: 'ul. Test 1, Kraków',
      partner1Phone: '500100200',
    },
  })
  const sparseCompany = buildReferenceCompany({
    nip: null,
    regon: null,
    phone: null,
    email: null,
    bankAccount: null,
    iban: null,
    logoPath: null,
    signaturePath: null,
    stampPath: null,
  })
  const ready = validateContractGeneration(readyWedding, sparseCompany)
  assertEq(ready.isReady, true, 'ready without nip/regon/phone/bank')
  assert(
    !ready.missingGroups.some((g) => g.id === 'company'),
    'no company blocker group',
  )
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
    !validation.missingGroups.some((g) => g.items.includes('REGON')),
    'REGON is not a global blocker',
  )
  assert(
    !validation.missingGroups.some((g) => g.items.includes('Numer konta')),
    'bank account is not a global blocker',
  )
  assert(
    !validation.missingGroups.some((g) => g.items.includes('NIP')),
    'NIP is not a global blocker',
  )
  assert(
    !validation.missingGroups.some((g) => g.items.includes('Telefon firmy')),
    'phone is not a global blocker',
  )
})

run('14–17. Contextual correction actions do not include company Settings', () => {
  const validation = validateContractGeneration(
    stubWedding(),
    buildReferenceCompany({
      companyName: null,
      address: null,
      city: null,
    }),
  )
  assert(
    !validation.missingGroups.some((g) => g.id === 'company'),
    'empty company profile is not a generation group',
  )

  const readyWedding = stubWedding({
    travelFeeStatus: 'included',
    couple: {
      ...stubWedding().couple,
      partner1Address: 'ul. Test 1, Kraków',
      partner1Phone: '500100200',
    },
  })
  const emptyStudio = validateContractGeneration(readyWedding, null)
  assertEq(emptyStudio.isReady, true, 'ready wedding + empty studio_details')

  const hostSrc = readFileSync(host, 'utf8')
  const modalsSrc = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/WeddingDetailHostModals.tsx',
    ),
    'utf8',
  )
  assert(hostSrc.includes("openEditor('contacts')"), 'edit couple')
  assert(hostSrc.includes("openEditor('package')"), 'edit package')
  assert(hostSrc.includes("asDeposit: true"), 'deposit action')
  assert(hostSrc.includes("case 'edit_travel_fee'"), 'travel correction')
  assert(modalsSrc.includes('TravelFeeResolveModal'), 'travel modal reused')
})

run('14b. Dialog uses travel title override when travel-only', () => {
  const src = readFileSync(dialog, 'utf8')
  assert(src.includes('validation?.title'), 'title override')
  assert(src.includes('validation?.description'), 'description override')
})

run('14c. Direct generation route guards unresolved travel', () => {
  const genPage = resolve(
    process.cwd(),
    'src/pages/WeddingContractGenerationPage.tsx',
  )
  const src = readFileSync(genPage, 'utf8')
  assert(src.includes('isTravelFeeResolved'), 'shared travel helper')
  assert(src.includes('travel-fee-generation-block'), 'block UI')
  assert(src.includes('Najpierw ustal koszt dojazdu.'), 'polish guidance')
  assert(
    src.includes("navigate(`/sluby/${wedding.id}?tab=overview`)"),
    'back to overview',
  )
  assert(
    src.includes('if (!isTravelFeeResolved(wedding))'),
    'generate() hard stop',
  )
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
  const hostSrc = readFileSync(host, 'utf8')
  assert(hostSrc.includes('setMissingValidation(null)'), 'clears prior')
  assert(hostSrc.includes('validateContractGeneration(wedding)'), 'fresh call')
})

run('20. V2 uses the page-level generation guard', () => {
  const pageSrc = readFileSync(page, 'utf8')
  const hostSrc = readFileSync(host, 'utf8')
  assert(pageSrc.includes('WeddingDetailV2'), 'v2')
  assert(!pageSrc.includes('WeddingDetailV1'), 'no v1')
  assert(hostSrc.includes('onHeroAction: handleHeroAction'), 'shared')
  assertEq(
    (hostSrc.match(/handleGenerateContract/g) ?? []).length >= 2,
    true,
    'defined and used',
  )
})

run('21. Detail generate does not fetch company for an artificial gate', () => {
  const shell = readFileSync(v2Shell, 'utf8')
  assert(!shell.includes('companyDetailsService'), 'v2 no company')
  assert(!shell.includes('evaluateWeddingContractReadiness'), 'v2 no eval')
  const hostSrc = readFileSync(host, 'utf8')
  assert(!hostSrc.includes('companyDetailsService'), 'generate does not load studio_details')
  assert(
    !hostSrc.includes("queryKey: ['company-details', userId]"),
    'no company fetch on generate',
  )
  assert(hostSrc.includes('handleGenerateContract'), 'lazy path')
  assert(hostSrc.includes("navigate(`/sluby/${wedding.id}/umowy/nowa`)"), 'opens generate route')
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
