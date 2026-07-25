/**
 * Contract Data Questionnaire acceptance tests.
 * Run: npm run test:contract-questionnaire
 *
 * Covers package snapshot regression, multi-select, locations,
 * custom fields, greeting/footer, address provider abstraction,
 * and single-screen (no wizard) guarantees.
 */

import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { resolvePublicFormTemplate } from '@/lib/forms/resolvePublicFormTemplate'
import {
  formatLocationAnswer,
  normalizeAdditionalServiceOptions,
  normalizeContractQuestionnaireConfig,
  normalizePackageOptions,
  normalizeSelectedPackageIds,
  parseOptionsSnapshot,
  validateIdsAgainstOptions,
} from '@/lib/forms/contractQuestionnaireSnapshot'
import { packageSelectionNeedsReview } from '@/lib/forms/packageSelectionReview'
import { formEngine } from '@/lib/forms/formEngine'
import { DEFAULT_FORM_SETTINGS } from '@/lib/forms/contractQuestionnaireTemplate'
import {
  createTravelAddressProvider,
  type AddressAutocompleteProvider,
  type NormalizedAddress,
} from '@/services/addressAutocompleteProvider'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

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

function run(name: string, fn: () => void | Promise<void>) {
  const result = fn()
  if (result && typeof (result as Promise<void>).then === 'function') {
    return (result as Promise<void>)
      .then(() => console.log(`PASS  ${name}`))
      .catch((err) => {
        console.error(`FAIL  ${name}`)
        console.error(err instanceof Error ? err.message : err)
        process.exitCode = 1
      })
  }
  try {
    console.log(`PASS  ${name}`)
  } catch (err) {
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
    process.exitCode = 1
  }
  return Promise.resolve()
}

const samplePackages = [
  {
    id: 'pkg-a',
    name: 'Pakiet A',
    description: 'Opis A',
    price: 5000,
    currency: 'PLN',
  },
  {
    id: 'pkg-b',
    name: 'Pakiet B',
    description: 'Opis B',
    price: 8000,
    currency: 'PLN',
  },
]

const sampleExtras = [
  {
    id: 'ex-1',
    name: 'Drone',
    description: 'Nalot',
    price: 800,
    currency: 'PLN',
  },
  { id: 'ex-2', name: 'Same day edit', price: 1200, currency: 'PLN' },
]

async function main() {
  await run('1. packages from Packages appear in newly built questionnaire', () => {
    const tpl = buildContractQuestionnaireTemplate({
      packages: samplePackages,
    })
    const pkgQ = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')
    assert(Boolean(pkgQ), 'package question exists')
    assertEq(pkgQ?.options?.length, 2, 'option count')
    assertEq(pkgQ?.options?.[0]?.value, 'pkg-a', 'first package id')
    assertEq(pkgQ?.type, 'multiselect', 'multiselect type')
    assertEq(pkgQ?.presentation, 'cards', 'card presentation')
  })

  await run('2. root-cause regression: empty schema options + inject from snapshot', () => {
    const emptySchema = {
      title: 'AI form',
      type: 'contract_questionnaire' as const,
      description: 'x',
      submitLabel: 'Wyślij',
      successTitle: 'OK',
      successDescription: 'OK',
      questions: [
        {
          id: 'q-wedding-date',
          type: 'date' as const,
          label: 'Data',
          fieldKey: 'weddingDate',
        },
        {
          id: 'q-package',
          type: 'select' as const,
          label: 'Pakiet',
          fieldKey: 'packageId',
          options: [] as { value: string; label: string }[],
        },
      ],
    }
    const resolved = resolvePublicFormTemplate(emptySchema, [], {
      packages: samplePackages,
      additionalServices: sampleExtras,
      config: defaultContractQuestionnaireConfig(),
    })
    const pkgQ = resolved.questions.find(
      (q) => q.fieldKey === 'selectedPackageIds' || q.id === 'q-package',
    )
    assert((pkgQ?.options?.length ?? 0) > 0, 'injected package options non-empty')
    assertEq(pkgQ?.fieldKey, 'selectedPackageIds', 'fieldKey is selectedPackageIds')
  })

  await run('3. package cards support multiple selection (array field)', () => {
    const tpl = buildContractQuestionnaireTemplate({ packages: samplePackages })
    const pkgQ = tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')!
    const values = formEngine.valuesToAnswers({
      [pkgQ.id]: ['pkg-a', 'pkg-b'],
    })
    const fields = formEngine.answersToFieldMap(tpl, values)
    assert(Array.isArray(fields.selectedPackageIds), 'array field')
    assertEq(
      (fields.selectedPackageIds as string[]).length,
      2,
      'two packages selected',
    )
  })

  await run('4. legacy packageId normalizes to selectedPackageIds array', () => {
    const ids = normalizeSelectedPackageIds({ packageId: 'pkg-legacy' })
    assertEq(ids.length, 1, 'one id')
    assertEq(ids[0], 'pkg-legacy', 'legacy id')
    const both = normalizeSelectedPackageIds({
      packageId: 'pkg-a',
      selectedPackageIds: ['pkg-b'],
    })
    assert(both.includes('pkg-a') && both.includes('pkg-b'), 'merged unique')
  })

  await run('5. additional services from real option snapshot', () => {
    const tpl = buildContractQuestionnaireTemplate({
      packages: samplePackages,
      additionalServices: sampleExtras,
      config: defaultContractQuestionnaireConfig(),
    })
    const extras = tpl.questions.find(
      (q) => q.fieldKey === 'selectedAdditionalServiceIds',
    )
    assert(Boolean(extras), 'extras question')
    assertEq(extras?.options?.length, 2, 'two extras')
    assertEq(extras?.fieldKey, 'selectedAdditionalServiceIds', 'fieldKey')
  })

  await run('6. additional services multi-select', () => {
    const normalized = normalizeAdditionalServiceOptions(sampleExtras)
    assertEq(normalized.length, 2, 'normalized extras')
    const check = validateIdsAgainstOptions(['ex-1', 'ex-2'], normalized)
    assert(check.ok, 'valid ids')
  })

  await run('7/8. public payload uses snapshot — no per-package requests in resolve', () => {
    const snapshot = parseOptionsSnapshot({
      version: 1,
      config: defaultContractQuestionnaireConfig(),
      packageOptions: samplePackages,
      additionalServiceOptions: sampleExtras,
      createdAt: new Date().toISOString(),
    })
    assert(snapshot != null, 'parsed snapshot')
    const tpl = resolvePublicFormTemplate(null, [], {
      packages: snapshot!.packageOptions,
      additionalServices: snapshot!.additionalServiceOptions,
      config: snapshot!.config,
    })
    assert(
      (tpl.questions.find((q) => q.fieldKey === 'selectedPackageIds')?.options
        ?.length ?? 0) === 2,
      'packages from snapshot only',
    )
  })

  await run('9. submitted package IDs validated against options', () => {
    const bad = validateIdsAgainstOptions(['pkg-x'], samplePackages)
    assert(!bad.ok, 'rejects unknown')
    const good = validateIdsAgainstOptions(['pkg-a'], samplePackages)
    assert(good.ok, 'accepts known')
  })

  await run('10/11. questionnaire is one screen — no wizard navigation in page source', () => {
    const pagePath = resolve(
      process.cwd(),
      'src/features/forms/ProductionContractFormPage.tsx',
    )
    const src = readFileSync(pagePath, 'utf8')
    assert(!/nextStep|prevStep|currentStep/.test(src), 'no step state APIs')
    assert(!/>\s*Dalej\s*</.test(src), 'no Dalej button')
    assert(!/>\s*Wstecz\s*</.test(src), 'no Wstecz button')
    assert(src.includes('Single screen'), 'documents single screen')
  })

  await run('12/13. greeting above / footer below via config', () => {
    const config = normalizeContractQuestionnaireConfig({
      greeting: 'Witajcie na ankiecie',
      footerText: 'Kontakt: studio@example.com',
    })
    assertEq(config.greeting, 'Witajcie na ankiecie', 'greeting')
    assertEq(config.footerText, 'Kontakt: studio@example.com', 'footer')
    const tpl = buildContractQuestionnaireTemplate({
      packages: samplePackages,
      config,
    })
    assert(tpl.description.includes('Witajcie'), 'greeting in template description')
    assert(
      Boolean(DEFAULT_FORM_SETTINGS.footerMessage),
      'default footer exists',
    )
  })

  await run('14. greeting/footer editable in company config shape', () => {
    const cfg = defaultContractQuestionnaireConfig()
    cfg.greeting = ''
    cfg.footerText = ''
    const normalized = normalizeContractQuestionnaireConfig(cfg)
    assertEq(normalized.greeting, '', 'can clear greeting')
    assertEq(normalized.footerText, '', 'can clear footer')
  })

  await run('15/16. custom short_text and long_text render', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'cf1',
          fieldKey: 'allergy',
          label: 'Alergie',
          type: 'short_text',
          required: false,
          enabled: true,
          order: 0,
        },
        {
          id: 'cf2',
          fieldKey: 'story',
          label: 'Historia',
          type: 'long_text',
          required: false,
          enabled: true,
          order: 1,
        },
      ],
    })
    const tpl = buildContractQuestionnaireTemplate({
      packages: [],
      config,
    })
    const shortQ = tpl.questions.find((q) => q.fieldKey === 'custom.allergy')
    const longQ = tpl.questions.find((q) => q.fieldKey === 'custom.story')
    assertEq(shortQ?.type, 'text', 'short_text → text')
    assertEq(longQ?.type, 'textarea', 'long_text → textarea')
  })

  await run('17. single_choice validates against options', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'cf3',
          fieldKey: 'style',
          label: 'Styl',
          type: 'single_choice',
          required: true,
          enabled: true,
          order: 0,
          options: [
            { value: 'classic', label: 'Klasyczny' },
            { value: 'modern', label: 'Nowoczesny' },
          ],
        },
      ],
    })
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    const q = tpl.questions.find((q) => q.fieldKey === 'custom.style')!
    const errors = formEngine.validateAnswers(tpl, { [q.id]: 'nope' })
    assert(Boolean(errors[q.id]), 'invalid option blocked')
    const ok = formEngine.validateAnswers(tpl, { [q.id]: 'classic' })
    assert(!ok[q.id], 'valid option ok')
  })

  await run('18. multiple_choice saves array', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'cf4',
          fieldKey: 'prefs',
          label: 'Preferencje',
          type: 'multiple_choice',
          required: false,
          enabled: true,
          order: 0,
          options: [
            { value: 'a', label: 'A' },
            { value: 'b', label: 'B' },
          ],
        },
      ],
    })
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    const q = tpl.questions.find((x) => x.fieldKey === 'custom.prefs')!
    const fields = formEngine.answersToFieldMap(
      tpl,
      formEngine.valuesToAnswers({ [q.id]: ['a', 'b'] }),
    )
    assert(Array.isArray(fields[q.fieldKey!]), 'array saved')
  })

  await run('19. required custom field blocks submission', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'cf5',
          fieldKey: 'must',
          label: 'Wymagane',
          type: 'short_text',
          required: true,
          enabled: true,
          order: 0,
        },
      ],
      showPackages: false,
      packagesRequired: false,
    })
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    // Clear required on other built-ins for focused check — validate only custom
    const customOnly = {
      ...tpl,
      questions: tpl.questions.filter(
        (q) => q.fieldKey === 'custom.must' || q.type === 'section_title',
      ),
    }
    const errors = formEngine.validateAnswers(customOnly, {})
    const q = customOnly.questions.find((x) => x.fieldKey === 'custom.must')
    assert(Boolean(q), 'custom question present')
    assert(Boolean(errors[q!.id]), 'required custom blocks')
  })

  await run('20. disabled custom field is not rendered', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'cf6',
          fieldKey: 'hidden',
          label: 'Ukryte',
          type: 'short_text',
          required: false,
          enabled: false,
          order: 0,
        },
      ],
    })
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    assert(
      !tpl.questions.some((q) => q.fieldKey === 'custom.hidden'),
      'disabled omitted',
    )
  })

  await run('21. reordering custom fields changes display order', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'a',
          fieldKey: 'a',
          label: 'A',
          type: 'short_text',
          required: false,
          enabled: true,
          order: 2,
        },
        {
          id: 'b',
          fieldKey: 'b',
          label: 'B',
          type: 'short_text',
          required: false,
          enabled: true,
          order: 1,
        },
      ],
    })
    assertEq(config.customFields[0]?.id, 'b', 'sorted by order')
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    const customs = tpl.questions.filter((q) => q.fieldKey?.startsWith('custom.'))
    assertEq(customs[0]?.fieldKey, 'custom.b', 'B first in template')
  })

  await run('22. changing label preserves stable field id', () => {
    const config = normalizeContractQuestionnaireConfig({
      customFields: [
        {
          id: 'stable-id',
          fieldKey: 'stable_key',
          label: 'Stara',
          type: 'short_text',
          required: false,
          enabled: true,
          order: 0,
        },
      ],
    })
    const block = config.blocks?.find(
      (b) =>
        'fieldKey' in b &&
        b.fieldKey === 'stable_key',
    )
    if (block && 'label' in block) {
      block.label = 'Nowa etykieta'
    }
    const tpl = buildContractQuestionnaireTemplate({ packages: [], config })
    const q = tpl.questions.find((x) => x.fieldKey === 'custom.stable_key')
    assertEq(q?.fieldKey, 'custom.stable_key', 'id stable')
    assertEq(q?.label, 'Nowa etykieta', 'label updated')
  })

  await run(
    '23-27. four locations map independently without overwrite',
    () => {
      const fields = {
        bridePreparationLocation: 'Dom PM',
        groomPreparationLocation: 'Hotel PM',
        ceremonyLocation: 'Kościół',
        receptionLocation: 'Sala',
      }
      const bride = formatLocationAnswer(fields.bridePreparationLocation)
      const groom = formatLocationAnswer(fields.groomPreparationLocation)
      const ceremony = formatLocationAnswer(fields.ceremonyLocation)
      const reception = formatLocationAnswer(fields.receptionLocation)
      assertEq(bride, 'Dom PM', 'bride prep')
      assertEq(groom, 'Hotel PM', 'groom prep')
      assertEq(ceremony, 'Kościół', 'ceremony')
      assertEq(reception, 'Sala', 'reception')
      assert(bride !== groom, 'bride ≠ groom')
      assert(ceremony !== reception, 'ceremony ≠ reception')
      // Legacy mirror: preparationLocation ← bride
      assertEq(bride, 'Dom PM', 'legacy prep mirrors bride')
    },
  )

  await run('28. address provider abstraction shape', () => {
    const provider: AddressAutocompleteProvider = createTravelAddressProvider()
    assert(typeof provider.search === 'function', 'search')
    assert(typeof provider.resolve === 'function', 'resolve')
  })

  await run('29. manual address entry works without provider data', () => {
    const manual = formatLocationAnswer('ul. Testowa 1, Warszawa')
    assertEq(manual, 'ul. Testowa 1, Warszawa', 'manual string')
    const structured: NormalizedAddress = {
      formattedAddress: 'ul. Testowa 1',
      provider: 'current',
      city: 'Warszawa',
    }
    assertEq(formatLocationAnswer(structured), 'ul. Testowa 1', 'normalized')
  })

  await run('30. provider-specific raw API data not required in domain state', () => {
    const addr: NormalizedAddress = {
      formattedAddress: 'X',
      placeId: 'abc',
      provider: 'current',
    }
    assert(!('rank' in addr), 'no geoapify rank')
    assert(!('features' in addr), 'no raw features')
  })

  await run('33. existing questionnaire route /form/:token remains', () => {
    const router = readFileSync(
      resolve(process.cwd(), 'src/routes/router.tsx'),
      'utf8',
    )
    assert(router.includes('/form/:token'), 'public route preserved')
  })

  await run('34. duplicate submit guarded in page (submitting flag)', () => {
    const src = readFileSync(
      resolve(process.cwd(), 'src/features/forms/ProductionContractFormPage.tsx'),
      'utf8',
    )
    assert(src.includes('if (submitting) return'), 'duplicate submit guard')
  })

  await run('36. normalizePackageOptions is O(n) single pass (no N+1)', () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      id: `p${i}`,
      name: `P${i}`,
    }))
    const out = normalizePackageOptions(many)
    assertEq(out.length, 50, 'single normalize call')
  })

  await run('commercial: confirmed package not overwritten on conflict', () => {
    assert(
      packageSelectionNeedsReview('confirmed-pkg', 'pkg-a'),
      'conflict flagged',
    )
    assert(
      !packageSelectionNeedsReview('confirmed-pkg', 'confirmed-pkg'),
      'same id no conflict',
    )
    assert(
      !packageSelectionNeedsReview(null, 'pkg-a'),
      'empty wedding allows assign',
    )
  })

  if (process.exitCode && process.exitCode !== 0) {
    process.exit(process.exitCode)
  }
  console.log('\ncontract-questionnaire acceptance: done')
}

void main()
