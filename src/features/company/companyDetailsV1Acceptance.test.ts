/**
 * OurWed V1 Studio Profile — visible form, generation gate, hidden-field
 * persistence, public branding, and legacy document variables.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildStudioDetailsColumnPatch } from '@/lib/api/companyDetailsService'
import { buildReferenceCompany } from '@/lib/dev/referenceWedding'
import { validateContractGeneration } from '@/lib/utils/validateContractGeneration'
import { evaluateWeddingContractReadiness } from '@/lib/utils/weddingContractReadiness'
import { SystemVariableRegistry } from '@/lib/variables/registry'
import { COMPANY_VARIABLES } from '@/lib/variables/registry/definitions/company'
import { validateTemplateSlotBindings } from '@/features/documents/template/templateReadiness'
import type { TemplateSlot, TemplateSlotMap } from '@/features/documents/template/types'
import type { UpsertCompanyDetailsInput } from '@/types/company'
import type { Wedding } from '@/types/wedding'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

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

const page = read('src/pages/CompanyDetailsPage.tsx')
const service = read('src/lib/api/companyDetailsService.ts')
const provider = read('src/lib/variables/providers/CompanyProvider.ts')
const registry = read('src/lib/variables/registry/definitions/company.ts')
const healthSrc = read('src/features/company/companyHealth.ts')
const readinessSrc = read('src/lib/utils/weddingContractReadiness.ts')
const slotSrc = read('src/features/documents/template/slotClassification.ts')
const travelPage = read('src/pages/TravelSettingsPage.tsx')
const travelService = read('src/lib/api/studioTravelSettingsService.ts')
const hostSrc = read('src/features/weddings/detail/useWeddingDetailHost.ts')
const datasetSrc = read(
  'src/features/ai-contract-transform/transformationDataset.ts',
)
const sparseService = read(
  'src/features/documents/template/WeddingSparseContractGenerationService.ts',
)
const uploadSrc = read(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
const brandingRestore = read(
  'supabase/migrations/20260729220000_prewedding_public_studio_branding_restore.sql',
)
const brandingService = read('src/lib/api/preweddingQuestionnaireService.ts')
const publicForm = read('src/features/prewedding/PreWeddingPublicFormPage.tsx')
const createFull = read('src/features/weddings/createFullWedding.ts')
const quickPayload = read('src/features/weddings/buildNewWeddingCreatePayload.ts')

const VISIBLE_LABELS = ['Nazwa studia'] as const

const HIDDEN_FROM_V1_UI = [
  'Właściciel / reprezentant',
  'NIP',
  'REGON',
  'Adres',
  'Kod pocztowy',
  'Miasto',
  'Numer konta',
  'Telefon',
  'E-mail',
  'VAT ID',
  'IBAN',
  'SWIFT',
  'Strona WWW',
  'Instagram',
  'Facebook',
  'Pieczęć',
  'Podpis',
  'Logo',
] as const

const HIDDEN_PATCH_COLUMNS = [
  'owner_name',
  'nip',
  'regon',
  'address',
  'city',
  'bank_account',
  'iban',
  'phone',
  'email',
  'logo_path',
  'signature_path',
  'stamp_path',
  'vat_id',
  'website',
  'instagram',
  'facebook',
  'postal_code',
  'swift',
  'country',
] as const

const LEGACY_VARIABLE_IDS = [
  'company_name',
  'company_owner',
  'company_representative',
  'company_address',
  'company_city',
  'company_nip',
  'company_regon',
  'company_vat',
  'company_bank_account',
  'company_iban',
  'company_swift',
  'company_phone',
  'company_email',
  'company_website',
  'company_instagram',
  'company_facebook',
  'company_logo',
  'company_signature',
  'company_stamp',
] as const

function nameOnlyUpsert(
  overrides: Partial<UpsertCompanyDetailsInput> = {},
): UpsertCompanyDetailsInput {
  return {
    companyName: 'Studio Testowe',
    ...overrides,
  }
}

function slot(
  key: string,
  patch: Partial<TemplateSlot> = {},
): TemplateSlot {
  return {
    id: `slot-${key}`,
    registryKey: key,
    label: key,
    sourceHint: 'company',
    occurrences: 1,
    enabled: true,
    physicallyBound: false,
    requirement: 'optional',
    ...patch,
  }
}

function readyWedding(overrides: Partial<Wedding> = {}): Wedding {
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
      partner1Phone: '500100200',
      partner1Address: 'ul. Test 1, Kraków',
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
    travelFeeStatus: 'included',
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

run('C. Studio Profile only exposes the V1 field set', () => {
  assert(page.includes('title="Profil studia"'), 'page title')
  assert(page.includes('label="Nazwa studia"'), 'studio name control')
  for (const label of VISIBLE_LABELS) {
    assert(page.includes(label), label)
  }
  for (const label of HIDDEN_FROM_V1_UI) {
    assert(!page.includes(`label="${label}"`), `${label} hidden`)
  }
  assert(!page.includes('CompanySignatureSection'), 'signature off default UI')
  assert(!page.includes('CompanyLogoSection'), 'logo off default UI')
  assert(!page.includes('Informacje o firmie'), 'no legal identity section')
  assert(!page.includes('Dane do umowy'), 'no contract-data section')
  assert(!page.includes('Logo i podpis'), 'no logo/signature section')
})

run('D. no NIP / REGON / bank / address / phone / email / signature completeness', () => {
  assert(!page.includes('buildCompanyHealth'), 'page does not use health')
  assert(!page.includes('SettingsHealthSummary'), 'no health summary')
  assert(!page.includes('Konfiguracja firmy'), 'no completeness title')
  assert(!page.includes('Brak nazwy'), 'no missing-name meter')
  assert(!page.includes('Brak logo'), 'no missing-logo copy')
  assert(!page.includes('Brak podpisu'), 'no missing-signature copy')
  assert(!healthSrc.includes('nip'), 'health ignores NIP')
  assert(!healthSrc.includes('regon'), 'health ignores REGON')
  assert(!healthSrc.includes('bankAccount'), 'health ignores bank')
  assert(!healthSrc.includes('logo'), 'health ignores logo')
  assert(!healthSrc.includes('signature'), 'health ignores signature')
})

run('E. company health is not a generation blocker', () => {
  assert(!hostSrc.includes('companyDetailsService'), 'generate does not fetch company')
  assert(!hostSrc.includes("queryKey: ['company-details', userId]"), 'no company query on generate')
  assert(hostSrc.includes('validateContractGeneration(wedding)'), 'wedding-only guard')
  assert(hostSrc.includes("navigate(`/sluby/${wedding.id}/umowy/nowa`)"), 'reaches generate route')
  assert(
    !readinessSrc.includes("'company_name'"),
    'readiness dropped company_name id',
  )
  assert(
    !readinessSrc.includes("'company_address'"),
    'readiness dropped company_address id',
  )
  assert(!readinessSrc.includes("'company_nip'"), 'readiness dropped NIP id')
  assert(!readinessSrc.includes("'company_regon'"), 'readiness dropped REGON id')
})

run('A–B. company profile fields do not block sparse generation', () => {
  const emptyCompany = validateContractGeneration(readyWedding(), null)
  assertEq(emptyCompany.isReady, true, 'empty studio_details is ready')
  assertEq(emptyCompany.missingGroups.length, 0, 'no blockers')
  assert(
    !emptyCompany.missingGroups.some((g) => g.id === 'company'),
    'no company group',
  )

  const blankCompany = validateContractGeneration(
    readyWedding(),
    buildReferenceCompany({
      companyName: null,
      ownerName: null,
      nip: null,
      regon: null,
      address: null,
      city: null,
      bankAccount: null,
      phone: null,
      email: null,
      logoPath: null,
      signaturePath: null,
    }),
  )
  assertEq(blankCompany.isReady, true, 'blank company row is ready')

  const readiness = evaluateWeddingContractReadiness(readyWedding(), null)
  assert(
    !readiness.items.some((item) => item.group === 'company'),
    'no company readiness items',
  )

  const stillBlocksClient = validateContractGeneration(
    readyWedding({
      couple: {
        ...readyWedding().couple,
        partner1: '',
        partner1FirstName: '',
        partner1LastName: '',
        partner1Address: '',
        partner1Phone: '',
        phone: '',
      },
    }),
    null,
  )
  assertEq(stillBlocksClient.isReady, false, 'client data still required')
  assert(
    stillBlocksClient.missingGroups.some((g) => g.id === 'client'),
    'client group remains',
  )
})

run('copy does not claim contracts / billing / invoices', () => {
  assert(
    page.includes(
      'Te informacje identyfikują Twoje studio w OurWed i na wybranych',
    ),
    'truthful identity callout',
  )
  assert(
    !page.includes('generowania umów'),
    'does not mention contract generation',
  )
  assert(!page.includes('wymagane do wygenerowania'), 'no required-for-contract')
  assert(!page.includes('faktur'), 'no invoice claim')
  assert(!page.includes('płatności'), 'no payment claim')
  assert(!page.includes('rozliczeń'), 'no billing claim')
})

run('F. editing Studio Name preserves hidden legacy DB columns', () => {
  const patch = buildStudioDetailsColumnPatch(nameOnlyUpsert())
  assertEq(patch.company_name, 'Studio Testowe', 'writes visible name')
  for (const column of HIDDEN_PATCH_COLUMNS) {
    assert(!(column in patch), `${column} not in name-only autosave patch`)
  }

  const upsertStart = page.indexOf('function formToUpsertInput')
  const upsertBlock = page.slice(
    upsertStart,
    page.indexOf('export function CompanyDetailsPage'),
  )
  assert(upsertBlock.includes('companyName:'), 'writes companyName')
  for (const key of [
    'ownerName',
    'nip',
    'regon',
    'address',
    'city',
    'bankAccount',
    'iban',
    'phone',
    'email',
    'logoPath',
    'signaturePath',
    'stampPath',
    'vatId',
    'website',
    'instagram',
    'facebook',
  ]) {
    assert(!upsertBlock.includes(`${key}:`), `form omits ${key}`)
  }
  assert(service.includes('if (input[key] !== undefined)'), 'defined-only patch')
})

run('G. public pre-wedding studio name still comes from company_name', () => {
  assert(
    brandingRestore.includes('sd.company_name'),
    'RPC reads company_name',
  )
  assert(brandingRestore.includes('studio_name'), 'RPC returns studio_name')
  assert(
    brandingService.includes(
      'studioName: (row.studio_name as string | null) ?? null',
    ),
    'client maps studio_name',
  )
  assert(publicForm.includes('form.studioName'), 'public form renders name')
  assert(!brandingService.includes('logo_path'), 'client does not read logo_path')
})

run('H. Travel settings remain a separate source of truth', () => {
  assert(
    travelPage.includes('studioTravelSettingsService') ||
      travelService.includes('studio_travel_settings'),
    'travel storage intact',
  )
  assert(!page.includes('studioTravelSettingsService'), 'company page does not write travel')
  assert(!service.includes('studio_travel_settings'), 'company service does not touch travel')
  assert(travelPage.includes('title="Rozliczanie dojazdu"'), 'travel page title unchanged')
})

run('I. CompanyProvider legacy keys/aliases remain unchanged', () => {
  for (const id of LEGACY_VARIABLE_IDS) {
    assert(
      COMPANY_VARIABLES.some((def) => def.id === id),
      `${id} remains in registry`,
    )
    assert(provider.includes(`'${id}'`), `CompanyProvider still emits ${id}`)
    assert(registry.includes(`id: '${id}'`), `registry still defines ${id}`)
  }
  const vat = COMPANY_VARIABLES.find((def) => def.id === 'company_vat')
  const iban = COMPANY_VARIABLES.find((def) => def.id === 'company_iban')
  const stamp = COMPANY_VARIABLES.find((def) => def.id === 'company_stamp')
  assert(vat?.aliases?.includes('vat') === true, 'vat alias')
  assert(iban?.aliases?.includes('iban') === true, 'iban alias')
  assert(stamp?.aliases?.includes('stamp') === true, 'stamp alias')
  assert(vat?.legacyKey === 'studio.vat', 'vat legacy key')

  const out: Record<string, string> = {}
  SystemVariableRegistry.emit(out, 'company_vat', 'EU123456')
  SystemVariableRegistry.emit(out, 'company_iban', 'PL61109010140000071219812874')
  SystemVariableRegistry.emit(out, 'company_instagram', '@atelier')
  SystemVariableRegistry.emit(out, 'company_stamp', 'https://signed.example/stamp.png')
  assertEq(out.company_vat, 'EU123456', 'vat id')
  assertEq(out['studio.vat'], 'EU123456', 'vat legacy')
  assertEq(out.vat, 'EU123456', 'vat alias')
  assertEq(out.company_iban, 'PL61109010140000071219812874', 'iban id')
  assertEq(out.iban, 'PL61109010140000071219812874', 'iban alias')
  assertEq(out.company_instagram, '@atelier', 'instagram id')
  assertEq(out.instagram, '@atelier', 'instagram alias')
  assertEq(out.company_stamp, 'https://signed.example/stamp.png', 'stamp id')
  assertEq(out.stamp, 'https://signed.example/stamp.png', 'stamp alias')
})

run('J. Quick / Full wedding creation flows are unaffected', () => {
  assert(!createFull.includes('companyDetailsService'), 'full create ignores company profile')
  assert(!quickPayload.includes('companyDetailsService'), 'quick create ignores company profile')
  assert(!createFull.includes('validateContractGeneration'), 'full create is not generate-gated')
  assert(
    !quickPayload.includes('validateContractGeneration'),
    'quick payload is not generate-gated',
  )
})

run('K. sparse generation dataset still contains no company fields', () => {
  assert(
    !datasetSrc.includes('company_name'),
    'dataset builder has no company_name',
  )
  assert(!datasetSrc.includes('CompanyProvider'), 'dataset does not load CompanyProvider')
  assert(
    !sparseService.includes('companyDetailsService'),
    'sparse service does not load studio_details',
  )
  assert(
    !sparseService.includes('CompanyProvider'),
    'sparse service does not use CompanyProvider',
  )
  assert(
    sparseService.includes('buildContractTransformationDataset'),
    'sparse path still uses wedding dataset',
  )
})

run('L. package contract upload still creates no company bindings', () => {
  assert(!uploadSrc.includes('company_name'), 'upload has no company_name binding')
  assert(!uploadSrc.includes('CompanyProvider'), 'upload does not use CompanyProvider')
  assert(!uploadSrc.includes('slot_map'), 'upload does not write slot maps')
  assert(uploadSrc.includes('sparseTemplateOnly: true'), 'sparse template only')
})

run('template slot architecture still classifies required company keys', () => {
  assert(slotSrc.includes("'company_regon'"), 'REGON remains a known slot')
  assert(slotSrc.includes("'company_phone'"), 'phone remains a known slot')
  assert(slotSrc.includes("'company_bank_account'"), 'bank remains a known slot')
  assert(slotSrc.includes("'company_nip'"), 'NIP remains a known slot')

  const requiredUnbound: TemplateSlotMap = {
    version: 1,
    slots: [
      slot('company_nip', {
        requirement: 'required',
        detectionStatus: 'required_unbound',
        enabled: true,
      }),
    ],
    unmappedDynamics: [],
    counters: {
      detectedSlotCount: 1,
      requiredSlotCount: 1,
      optionalSlotCount: 0,
      boundRequiredSlotCount: 0,
      unresolvedRequiredSlotCount: 1,
      ambiguousSlotCount: 0,
      falsePositiveCount: 0,
    },
  }
  const blocked = validateTemplateSlotBindings(requiredUnbound)
  assert(!blocked.ready, 'required unbound company_nip blocks template readiness')
  assert(
    blocked.unresolvedKeys.includes('company_nip'),
    'required company_nip is unresolved',
  )

  const guard = read('src/lib/utils/validateContractGeneration.ts')
  assert(
    !guard.includes('validateTemplateSlotBindings'),
    'global generation gate does not invent a second template-value system',
  )
})

run('Settings mobile architecture is unchanged', () => {
  assert(page.includes('SettingsLayout'), 'company stays in Settings shell')
  assert(!page.includes('SettingsMobileIndex'), 'no mobile directory')
  const settingsPage = read('src/pages/SettingsPage.tsx')
  assert(!settingsPage.includes('SettingsMobileIndex'), 'index is not a directory')
  const layout = read('src/features/settings/SettingsLayout.tsx')
  assert(layout.includes('SettingsPrimaryNavigation'), 'unified tabs remain')
  assert(!layout.includes('← Ustawienia'), 'no back-to-directory')
})

run('signature component and storage remain available off the V1 page', () => {
  const signature = read('src/features/company/signature/CompanySignatureSection.tsx')
  assert(signature.includes('Podpis'), 'legacy signature UI still exists')
  assert(service.includes('signature_path'), 'signature column still mapped')
  assert(service.includes('logo_path'), 'logo column still mapped')
  assert(service.includes('stamp_path'), 'stamp column still mapped')
})

console.log('Company Details V1 acceptance done.')
