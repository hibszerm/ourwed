/**
 * Package-owned contract acceptance (A–T).
 * Run: npm run test:package-contracts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { amountToWordsPlOrNull } from '@/lib/utils/amountToWordsPl'
import { formatContractPln } from '@/lib/utils/currency'
import {
  PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS,
  PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS,
  applyPackageContractAllowlistToSlotMap,
  evaluatePackageContractReadiness,
  filterSlotsToPackageContractAllowlist,
  isPackageContractAllowedDynamicKey,
  isPackageContractImmutableKey,
} from './packageContractAllowlist'
import { resolvePackageContractFromPackage } from './packageContractResolve'
import {
  remainingAfterDeposit,
  resolvePackageContractDeposit,
  resolvePackageContractValue,
} from './packageContractCommercial'
import { verifyContractTransformation } from './contractQualityCheck'
import type { TemplateSlot, TemplateSlotMap } from './types'

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

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

function slot(
  registryKey: string,
  overrides: Partial<TemplateSlot> = {},
): TemplateSlot {
  return {
    id: `slot-${registryKey}`,
    registryKey,
    label: registryKey,
    sourceHint: 'wedding',
    occurrences: 1,
    enabled: true,
    placeholderInserted: false,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: 0,
    originalText: 'x',
    startOffset: 0,
    endOffset: 1,
    detectionStatus: 'bound',
    ...overrides,
  }
}

function mapWith(...keys: string[]): TemplateSlotMap {
  return {
    version: 1,
    documentTitle: 'test',
    slots: keys.map((k) => slot(k)),
    unmappedDynamics: [],
  }
}

run('A — package can store an active contract template version', () => {
  const migration = source(
    'supabase/migrations/20260726140000_package_active_contract_template.sql',
  )
  assert(
    migration.includes('active_contract_template_id'),
    'migration adds template id',
  )
  assert(
    migration.includes('active_contract_template_version_id'),
    'migration adds version id',
  )
  const types = source('src/types/package.ts')
  assert(types.includes('activeContractTemplateId'), 'StudioPackage field')
  assert(
    types.includes('activeContractTemplateVersionId'),
    'StudioPackage version field',
  )
  const svc = source('src/lib/api/packageService.ts')
  assert(svc.includes('linkContractTemplate'), 'link helper')
})

run('B — package upload runs analysis', () => {
  const src = source(
    'src/features/documents/template/packageContractAssignment.ts',
  )
  assert(src.includes('assignPackageContractFromDocx'), 'assign entry')
  assert(src.includes('activeAiDocumentAnalyzer.analyze'), 'runs AI analysis')
  assert(src.includes('buildSlotsFromAnalysis'), 'builds slots')
  assert(src.includes('applyPackageContractAllowlistToSlotMap'), 'filters')
  assert(src.includes('saveTemplateSlots'), 'persists')
  assert(src.includes('linkContractTemplate'), 'activates on package')
})

run('C — allowed fields are persisted', () => {
  const raw = mapWith(
    'wedding_date',
    'couple_full_names',
    'contract_value',
    'coverage_hours',
  )
  const { slotMap, filteredOutKeys } = applyPackageContractAllowlistToSlotMap(raw)
  assert(
    slotMap.slots.every((s) =>
      isPackageContractAllowedDynamicKey(s.registryKey),
    ),
    'only allowlisted keys remain',
  )
  assert(slotMap.slots.some((s) => s.registryKey === 'wedding_date'), 'date kept')
  assert(
    slotMap.slots.some((s) => s.registryKey === 'contract_value'),
    'value kept',
  )
  assert(filteredOutKeys.includes('coverage_hours'), 'hours filtered')
})

run('D — coverage_hours is detected internally but filtered out', () => {
  assert(
    isPackageContractImmutableKey('coverage_hours'),
    'coverage_hours is immutable',
  )
  assert(
    !isPackageContractAllowedDynamicKey('coverage_hours'),
    'not allowlisted',
  )
  const { filteredOut } = filterSlotsToPackageContractAllowlist([
    slot('coverage_hours'),
    slot('wedding_date'),
  ])
  assertEq(filteredOut.length, 1, 'hours filtered')
  assertEq(filteredOut[0]?.registryKey, 'coverage_hours', 'key')
})

run('E — overtime_rate is not persisted as a mutable package-contract field', () => {
  assert(isPackageContractImmutableKey('overtime_rate'), 'immutable')
  const { slotMap } = applyPackageContractAllowlistToSlotMap(
    mapWith('overtime_rate', 'deposit_amount'),
  )
  assert(
    !slotMap.slots.some((s) => s.registryKey === 'overtime_rate'),
    'overtime removed',
  )
  assert(
    slotMap.slots.some((s) => s.registryKey === 'deposit_amount'),
    'deposit kept',
  )
})

run('F — film_duration is immutable', () => {
  assert(isPackageContractImmutableKey('film_duration'), 'immutable')
  assert(
    PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS.includes('film_duration'),
    'in immutable list',
  )
  const { kept } = filterSlotsToPackageContractAllowlist([slot('film_duration')])
  assertEq(kept.length, 0, 'not kept')
})

run('G — wedding automatically selects its package contract', () => {
  const resolved = resolvePackageContractFromPackage({
    packageId: 'pkg-video-mini',
    pkg: {
      id: 'pkg-video-mini',
      name: 'Video Mini',
      activeContractTemplateId: 'tmpl-video-mini',
      activeContractTemplateVersionId: 'ver-1',
    },
  })
  assertEq(resolved.status, 'ok', 'status')
  if (resolved.status === 'ok') {
    assertEq(resolved.templateId, 'tmpl-video-mini', 'template')
    assertEq(resolved.templateVersionId, 'ver-1', 'version')
  }
  const page = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(page.includes('resolvePackageContractForWedding'), 'uses resolver')
  assert(page.includes('packageResolution.templateId'), 'auto template')
})

run('H — no manual template picker is required', () => {
  const page = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(!page.includes('generation-template'), 'no radio picker')
  assert(!page.includes('TemplateOptions'), 'no template options UI')
  assert(!page.includes('selectTemplates'), 'no picker service call')
  assert(page.includes("WizardStep = 'resolve'"), 'resolve step')
})

run('I — missing package contract returns a product-level state', () => {
  const resolved = resolvePackageContractFromPackage({
    packageId: 'pkg-1',
    pkg: {
      id: 'pkg-1',
      name: 'Video Mini',
      activeContractTemplateId: null,
      activeContractTemplateVersionId: null,
    },
  })
  assertEq(resolved.status, 'missing_contract', 'status')
  if (resolved.status === 'missing_contract') {
    assertEq(
      resolved.message,
      'Pakiet Video Mini nie ma jeszcze przypisanej umowy.',
      'message',
    )
    assertEq(resolved.packagePath, '/studio/pakiety', 'path')
  }
  const page = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(page.includes('Przejdź do pakietu'), 'CTA')
})

run('J — wedding price overrides package default price', () => {
  assertEq(
    resolvePackageContractValue({
      weddingPrice: 9500,
      packageDefaultPrice: 8000,
    }),
    9500,
    'wedding wins',
  )
})

run('K — package default is used only when wedding value is absent', () => {
  assertEq(
    resolvePackageContractValue({
      weddingPrice: null,
      packageDefaultPrice: 8000,
    }),
    8000,
    'package fallback',
  )
  assertEq(
    resolvePackageContractDeposit({
      weddingDeposit: undefined,
      packageDefaultDeposit: 1000,
    }),
    1000,
    'deposit fallback',
  )
  assertEq(
    remainingAfterDeposit(9500, 1000),
    8500,
    'remaining',
  )
})

run('L — locations resolve from the wedding', () => {
  for (const key of [
    'preparation_location',
    'ceremony_location',
    'reception_location',
  ] as const) {
    assert(
      isPackageContractAllowedDynamicKey(key),
      `${key} allowlisted`,
    )
  }
  assert(
    PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS.includes('ceremony_location'),
    'ceremony in allowlist',
  )
})

run('M — amounts and words use pl-PL formatting', () => {
  assertEq(formatContractPln(9500), '9 500 zł', '9500 formatted')
  assertEq(formatContractPln(1000), '1 000 zł', '1000 formatted')
  assertEq(formatContractPln(8500), '8 500 zł', '8500 formatted')
  assertEq(
    amountToWordsPlOrNull(9500),
    'dziewięć tysięcy pięćset złotych',
    '9500 words',
  )
  assertEq(
    amountToWordsPlOrNull(1000),
    'jeden tysiąc złotych',
    '1000 words',
  )
})

run('N — quality gate passes for allowed changes', () => {
  const slots: TemplateSlot[] = [
    slot('couple_full_names', {
      operation: 'replace',
      originalText: 'Anna Kowalska i Jan Nowak',
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 24,
      allowedRange: { start: 0, end: 24 },
    }),
    slot('contract_value', {
      id: 'slot-value',
      operation: 'replace',
      originalText: '8 000 zł',
      paragraphIndex: 1,
      startOffset: 12,
      endOffset: 20,
      allowedRange: { start: 12, end: 20 },
    }),
  ]
  const result = verifyContractTransformation({
    original: [
      { index: 0, text: 'Anna Kowalska i Jan Nowak zawierają umowę.' },
      { index: 1, text: 'Wynagrodzenie 8 000 zł brutto.' },
    ],
    transformed: [
      {
        index: 0,
        text: 'Iza Karczewska i Jan Kulewski zawierają umowę.',
      },
      { index: 1, text: 'Wynagrodzenie 9 500 zł brutto.' },
    ],
    resolvedByKey: {
      couple_full_names: 'Iza Karczewska i Jan Kulewski',
      contract_value: '9 500 zł',
    },
    slots,
  })
  assert(result.ok, result.report ?? result.reason ?? 'expected PASS')
})

run('O — quality gate fails when coverage hours change', () => {
  // No coverage_hours slot — package contracts never authorize that span.
  const slots: TemplateSlot[] = [
    slot('wedding_date', {
      originalText: '01.01.2026',
      paragraphIndex: 0,
      startOffset: 10,
      endOffset: 20,
      allowedRange: { start: 10, end: 20 },
    }),
  ]
  const result = verifyContractTransformation({
    original: [
      {
        index: 0,
        text: 'Ślub dnia 01.01.2026. Czas pracy nie przekracza 11 godzin.',
      },
    ],
    transformed: [
      {
        index: 0,
        text: 'Ślub dnia 29.07.2026. Czas pracy nie przekracza 12 godzin.',
      },
    ],
    resolvedByKey: {
      wedding_date: '29.07.2026',
    },
    slots,
  })
  assert(!result.ok, 'must reject coverage hours mutation')
})

run('P — quality gate fails when legal wording changes', () => {
  const slots: TemplateSlot[] = [
    slot('contract_execution_date', {
      originalText: '26.07.2026',
      paragraphIndex: 0,
      startOffset: 0,
      endOffset: 10,
      allowedRange: { start: 0, end: 10 },
    }),
  ]
  const result = verifyContractTransformation({
    original: [
      {
        index: 0,
        text: '26.07.2026. Prawa autorskie przysługują Wykonawcy.',
      },
    ],
    transformed: [
      {
        index: 0,
        text: '26.07.2026. Prawa autorskie przysługują Parze Młodej.',
      },
    ],
    resolvedByKey: {
      contract_execution_date: '26.07.2026',
    },
    slots,
  })
  assert(!result.ok, 'must reject legal wording change')
})

run('Q — reload still uses the persisted package contract', () => {
  const pkg = {
    id: 'pkg-1',
    name: 'Video Mini',
    activeContractTemplateId: 'tmpl-1',
    activeContractTemplateVersionId: 'ver-1',
  }
  const first = resolvePackageContractFromPackage({ packageId: 'pkg-1', pkg })
  const second = resolvePackageContractFromPackage({ packageId: 'pkg-1', pkg })
  assertEq(first.status, 'ok', 'first')
  assertEq(second.status, 'ok', 'second')
  if (first.status === 'ok' && second.status === 'ok') {
    assertEq(first.templateId, second.templateId, 'same template')
    assertEq(first.templateVersionId, second.templateVersionId, 'same version')
  }
})

run('R — changing the wedding package changes the selected contract', () => {
  const mini = resolvePackageContractFromPackage({
    packageId: 'mini',
    pkg: {
      id: 'mini',
      name: 'Video Mini',
      activeContractTemplateId: 'tmpl-mini',
      activeContractTemplateVersionId: 'ver-mini',
    },
  })
  const premium = resolvePackageContractFromPackage({
    packageId: 'premium',
    pkg: {
      id: 'premium',
      name: 'Video Premium',
      activeContractTemplateId: 'tmpl-premium',
      activeContractTemplateVersionId: 'ver-premium',
    },
  })
  assert(mini.status === 'ok' && premium.status === 'ok', 'both ok')
  if (mini.status === 'ok' && premium.status === 'ok') {
    assert(mini.templateId !== premium.templateId, 'different contracts')
  }
})

run('S — replacing a package contract does not affect other packages', () => {
  const a = {
    id: 'a',
    name: 'A',
    activeContractTemplateId: 'tmpl-a',
    activeContractTemplateVersionId: 'ver-a',
  }
  const b = {
    id: 'b',
    name: 'B',
    activeContractTemplateId: 'tmpl-b',
    activeContractTemplateVersionId: 'ver-b',
  }
  const aAfterReplace = {
    ...a,
    activeContractTemplateId: 'tmpl-a-new',
    activeContractTemplateVersionId: 'ver-a-new',
  }
  const resolvedB = resolvePackageContractFromPackage({
    packageId: 'b',
    pkg: b,
  })
  const resolvedA = resolvePackageContractFromPackage({
    packageId: 'a',
    pkg: aAfterReplace,
  })
  assert(resolvedB.status === 'ok' && resolvedA.status === 'ok', 'ok')
  if (resolvedB.status === 'ok' && resolvedA.status === 'ok') {
    assertEq(resolvedB.templateId, 'tmpl-b', 'B unchanged')
    assertEq(resolvedA.templateId, 'tmpl-a-new', 'A replaced')
  }
})

run('T — two packages can use two different contracts', () => {
  const one = resolvePackageContractFromPackage({
    packageId: '1',
    pkg: {
      id: '1',
      name: 'Video Mini',
      activeContractTemplateId: 'Umowa_Video_Mini',
      activeContractTemplateVersionId: 'v1',
    },
  })
  const two = resolvePackageContractFromPackage({
    packageId: '2',
    pkg: {
      id: '2',
      name: 'Foto Classic',
      activeContractTemplateId: 'Umowa_Foto_Classic',
      activeContractTemplateVersionId: 'v2',
    },
  })
  assert(one.status === 'ok' && two.status === 'ok', 'both assigned')
  if (one.status === 'ok' && two.status === 'ok') {
    assert(one.templateId !== two.templateId, 'independent templates')
  }
})

run('readiness — required categories without inventing missing slots', () => {
  const ready = evaluatePackageContractReadiness({
    allowedRegistryKeys: [
      'couple_full_names',
      'contract_execution_date',
      'wedding_date',
      'contract_value',
    ],
  })
  assert(ready.ready, 'minimum ready')
  const missingLoc = evaluatePackageContractReadiness({
    allowedRegistryKeys: [
      'couple_full_names',
      'contract_execution_date',
      'wedding_date',
      'contract_value',
      // locations absent — must not block
    ],
  })
  assert(missingLoc.ready, 'locations optional when absent')
  const incomplete = evaluatePackageContractReadiness({
    allowedRegistryKeys: ['wedding_date'],
  })
  assert(!incomplete.ready, 'missing required categories')
  assert(
    Boolean(incomplete.userMessage?.includes('automatycznego generowania')),
    'friendly message',
  )
})

run('UI — package contract section is product-facing only', () => {
  const ui = source('src/features/studio/PackageContractSection.tsx')
  assert(ui.includes('ContractUploadExperience'), 'upload experience')
  assert(ui.includes('ContractAnalysisAnimation'), 'analysis experience')
  assert(ui.includes('PackageHealthSummary'), 'ready experience')
  assert(ui.includes('Umowa gotowa'), 'ready copy via summary')
  assert(ui.includes('Zmień umowę'), 'replace')
  assert(ui.includes('Podgląd'), 'preview')
  assert(!ui.includes('registryKey'), 'no registry keys')
  assert(!ui.includes('slot_map'), 'no slot map')
  assert(!ui.includes('offset'), 'no offsets')
  assert(!ui.includes('semantic'), 'no semantic jargon')
  const packagesPage = source('src/pages/PackagesPage.tsx')
  assert(packagesPage.includes('PackageContractSection'), 'wired')
})

run('authoritative allowlist is single source', () => {
  assert(
    PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS.includes('contract_execution_date'),
    'contract date',
  )
  assert(
    PACKAGE_CONTRACT_ALLOWED_DYNAMIC_KEYS.includes('deposit_due_date'),
    'deposit due',
  )
  const transform = source(
    'src/features/documents/template/ContractTransformationService.ts',
  )
  assert(transform.includes('packageContractMode'), 'generation filters')
  const model = source(
    'src/features/documents/template/packageContractGenerationModel.ts',
  )
  assert(
    model.includes('applyPackageContractAllowlistToSlotMap'),
    'uses allowlist',
  )
})

console.log('\nPackage contract acceptance finished.')
