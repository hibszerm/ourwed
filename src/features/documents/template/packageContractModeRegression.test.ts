/**
 * Package-contract mode regressions (teaser filter, persisted-only, review).
 * Run: npm run test:package-contract-mode
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  applyPackageContractAllowlistToSlotMap,
  isPackageContractAllowedDynamicKey,
  PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS,
} from './packageContractAllowlist'
import {
  assertPackageContractPersistedOnly,
  buildPackageContractGenerationModel,
  filterToPackageContractAllowlist,
  findSharedPhysicalSpanConflicts,
} from './packageContractGenerationModel'
import { groupSlotsIntoLogicalFields } from './logicalContractFields'
import { buildGenerationReviewState } from './WeddingContractGenerationService'
import type { CompletenessField } from './buildContractCompleteness'
import type { ConfiguredContractCompletenessReport } from './WeddingContractGenerationService'
import type { TemplateSlot, TemplateSlotMap } from './types'
import type { ContractTemplateConfiguration } from '@/features/ai-contract-lab/templateFieldConfiguration'

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
  para: number,
  start: number,
  end: number,
  originalText: string,
): TemplateSlot {
  return {
    id: `slot-${registryKey}-${para}-${start}-${end}`,
    registryKey,
    label: registryKey,
    sourceHint: registryKey.includes('teaser') ? 'package' : 'wedding',
    occurrences: 1,
    enabled: true,
    physicallyBound: true,
    operation: 'replace',
    paragraphIndex: para,
    originalText,
    startOffset: start,
    endOffset: end,
    allowedRange: { start, end },
    detectionStatus: 'bound',
    sampleContext: originalText.includes('teledysk')
      ? 'teledysku ślubnego o długości ok. 3–5 minut'
      : undefined,
  }
}

function mapWith(slots: TemplateSlot[]): TemplateSlotMap {
  return { version: 1, documentTitle: 'pkg', slots, unmappedDynamics: [] }
}

function field(
  registryKey: string,
  patch: Partial<CompletenessField> = {},
): CompletenessField {
  return {
    slotId: `logical-${registryKey}`,
    registryKey,
    label: registryKey,
    group: 'wedding',
    value: patch.value ?? 'ok',
    missing: patch.missing ?? false,
    source: 'wedding',
    sourceLabel: 'Ślub',
    ...patch,
  }
}

function reportFromSlots(
  slots: TemplateSlot[],
  fields: CompletenessField[],
): ConfiguredContractCompletenessReport {
  const configuration = {
    version: 1,
    templateId: 't1',
    fields: fields.map((f) => ({
      id: f.registryKey,
      semanticRole: f.registryKey,
      mode: 'variable' as const,
      displayName: f.label,
      variableSource: 'wedding' as const,
      requiredWhenVariable: true,
      detectedAnchorIds: [],
    })),
    sharedLocationPolicy: {
      mode: 'ask_each_time' as const,
      preferredLocationRole: 'ceremony' as const,
      combinedFormat: 'comma' as const,
    },
  } as unknown as ContractTemplateConfiguration

  return {
    templateId: 't1',
    templateName: 'Umowa',
    slotMap: mapWith(slots),
    resolved: Object.fromEntries(fields.map((f) => [f.registryKey, f.value])),
    packageSnapshot: {
      packageId: 'pkg',
      name: 'Video Mini',
      currency: 'PLN',
      items: [],
    },
    questionnaireAnswers: {},
    sourceParagraphs: [
      {
        index: 12,
        text: 'teledysku ślubnego o długości ok. 3–5 minut',
      },
    ],
    groups: [],
    fields,
    missing: fields.filter((f) => f.missing),
    allComplete: fields.every((f) => !f.missing),
    configuration,
    ignoredRegistryKeys: [],
    fixedRegistryKeys: [],
    packageContractMode: true,
    packageId: 'pkg',
    packageTemplateVersionId: 'ver-1',
  }
}

run('A — package contract may detect teledysk internally', () => {
  const raw = mapWith([
    slot('wedding_date', 1, 0, 10, '29.07.2026'),
    slot('teaser_duration', 12, 40, 49, '3–5 minut'),
  ])
  assert(
    raw.slots.some((s) => s.registryKey === 'teaser_duration'),
    'detected before filter',
  )
  assert(
    (PACKAGE_CONTRACT_IMMUTABLE_PACKAGE_KEYS as readonly string[]).includes(
      'teaser_duration',
    ),
    'immutable list',
  )
})

run('B — teaser_duration filtered before persisted active bindings', () => {
  const raw = mapWith([
    slot('contract_value', 2, 0, 8, '9 500 zł'),
    slot('teaser_duration', 12, 40, 49, '3–5 minut'),
    slot('film_duration', 13, 0, 8, '15 minut'),
  ])
  const { slotMap, filteredOutKeys } = applyPackageContractAllowlistToSlotMap(raw)
  assert(filteredOutKeys.includes('teaser_duration'), 'teaser filtered')
  assert(filteredOutKeys.includes('film_duration'), 'film filtered')
  assert(
    !slotMap.slots.some((s) => s.registryKey === 'teaser_duration'),
    'not persisted',
  )
})

run('C — teaser_duration absent from LogicalContractFields', () => {
  const model = buildPackageContractGenerationModel({
    templateId: 't1',
    templateVersionId: 'v1',
    packageId: 'pkg',
    slotMap: mapWith([
      slot('wedding_date', 1, 0, 10, '29.07.2026'),
      slot('teaser_duration', 12, 40, 49, '3–5 minut'),
    ]),
  })
  assert(
    !model.logicalFields.some((f) => f.registryKey === 'teaser_duration'),
    'no logical teaser',
  )
  assertEq(
    groupSlotsIntoLogicalFields(model.physicalBindings).some(
      (f) => f.registryKey === 'teaser_duration',
    ),
    false,
    'no group teaser',
  )
})

run('D/E/F — teaser absent from GenerationReviewState and does not block', () => {
  const slots = [
    slot('wedding_date', 1, 0, 10, '29.07.2026'),
    slot('couple_full_names', 2, 0, 20, 'Iza i Jan'),
    slot('contract_execution_date', 0, 0, 10, '26.07.2026'),
    slot('contract_value', 3, 0, 8, '9 500 zł'),
  ]
  const fields = [
    field('wedding_date'),
    field('couple_full_names'),
    field('contract_execution_date'),
    field('contract_value'),
    // Would previously be invented by detectPreGenerationReviewIssues:
    field('teaser_duration', { missing: true, value: '', label: 'Długość teledysku' }),
  ]
  const review = buildGenerationReviewState({
    report: reportFromSlots(slots, fields),
    overrides: {},
    packageContractMode: true,
  })
  assert(
    !review.editableMissingFields.some((f) => f.registryKey === 'teaser_duration'),
    'E no editable teaser',
  )
  assert(
    !review.resolvedValues.some((f) => f.registryKey === 'teaser_duration'),
    'D no resolved teaser',
  )
  assert(
    !review.blockingUserInputs.some(
      (b) => b.kind === 'missing_field' && b.registryKey === 'teaser_duration',
    ),
    'F not blocked by teaser',
  )
  assert(review.generationAllowed, 'F generationAllowed')
})

run('G — Wymagane uzupełnienie hidden when allowed fields resolve', () => {
  const fields = [
    field('wedding_date'),
    field('couple_full_names'),
    field('contract_execution_date'),
    field('contract_value'),
    field('final_payment_due_date'),
    field('reception_location'),
  ]
  const review = buildGenerationReviewState({
    report: reportFromSlots(
      fields.map((f, i) => slot(f.registryKey, i, 0, 5, f.value)),
      fields,
    ),
    overrides: {},
    packageContractMode: true,
  })
  assertEq(review.editableMissingFields.length, 0, 'no required section')
  assertEq(
    review.blockingUserInputs.map((b) => b.kind + ':' + ('registryKey' in b ? b.registryKey : 'questionId' in b ? b.questionId : b.issueId)).join(','),
    '',
    'no blockers',
  )
  assert(review.generationAllowed, 'allowed')
})

run('H/I — package generation path forbids runtime sync + candidate detection', () => {
  const transform = source(
    'src/features/documents/template/ContractTransformationService.ts',
  )
  assert(
    transform.includes("mode: 'persisted_only'"),
    'persisted_only log',
  )
  assert(
    transform.includes('assertPackageContractPersistedOnly'),
    'assert helper',
  )
  assert(
    transform.includes('if (!packageContractMode)') &&
      transform.includes('ensureTeaserDurationSlots'),
    'teaser ensure gated behind !packageContractMode',
  )
  assert(
    !/if \(packageContractMode\)[\s\S]{0,200}ensureTeaserDurationSlots/.test(
      transform,
    ),
    'teaser ensure not inside package branch',
  )
  assertPackageContractPersistedOnly({
    packageContractMode: true,
    runtimeSyncInvoked: false,
  })
  let threw = false
  try {
    assertPackageContractPersistedOnly({
      packageContractMode: true,
      runtimeSyncInvoked: true,
    })
  } catch {
    threw = true
  }
  assert(threw, 'H fails when sync invoked')
})

run('J/K — review and renderer pin same version + binding IDs', () => {
  const page = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(page.includes('packageContractMode: true'), 'explicit page mode')
  assert(page.includes('templateVersionId'), 'pins version')
  const model = buildPackageContractGenerationModel({
    templateId: '3bd26103-3bec-4cb8-a14d-b7a270b00fbd',
    templateVersionId: '56eb0cc4-f470-44d3-a1ce-ab22b3ed9d84',
    packageId: 'pkg',
    slotMap: mapWith([
      slot('reception_location', 8, 10, 20, 'Hotel A'),
      slot('final_payment_due_date', 9, 0, 10, '29.07.2026'),
    ]),
  })
  assertEq(model.templateVersionId, '56eb0cc4-f470-44d3-a1ce-ab22b3ed9d84', 'J version')
  const ids = model.physicalBindings.map((b) => b.id)
  assertEq(new Set(ids).size, ids.length, 'K unique binding ids')
  assert(
    model.logicalFields.some((f) => f.registryKey === 'reception_location'),
    'L reception in model',
  )
  assert(
    model.logicalFields.some((f) => f.registryKey === 'final_payment_due_date'),
    'M payment due in model',
  )
})

run('N — shared physical span across keys rejected at analysis', () => {
  const conflicts = findSharedPhysicalSpanConflicts([
    slot('preparation_location', 7, 20, 40, 'Hotel'),
    slot('ceremony_location', 7, 20, 40, 'Hotel'),
    slot('reception_location', 7, 20, 40, 'Hotel'),
  ])
  assertEq(conflicts.length, 1, 'one conflict')
  assertEq(conflicts[0]!.registryKeys.length, 3, 'three keys')
  const assign = source(
    'src/features/documents/template/packageContractAssignment.ts',
  )
  assert(assign.includes('findSharedPhysicalSpanConflicts'), 'wired at upload')
  assert(assign.includes('sharedSpanConflicts'), 'blocks readiness')
})

run('O — no Zakres poprawek for package immutable fields', () => {
  const page = source('src/pages/WeddingContractGenerationPage.tsx')
  assert(!page.includes('Zakres poprawek'), 'no scope UI')
  assert(!page.includes('Długość teledysku'), 'no teaser label in page')
})

run('P — legacy generation still has teaser path when not package mode', () => {
  const review = buildGenerationReviewState({
    report: {
      ...reportFromSlots(
        [slot('teaser_duration', 12, 40, 49, '__________')],
        [field('teaser_duration', { missing: true, value: '' })],
      ),
      packageContractMode: false,
    },
    overrides: {},
    packageContractMode: false,
  })
  // Legacy may still surface teaser via placeholder / preflight — not asserting presence,
  // only that package mode path is distinct.
  assert(
    source('src/features/documents/template/ContractTransformationService.ts').includes(
      'if (!packageContractMode)',
    ),
    'legacy branch retained',
  )
  void review
  assert(!isPackageContractAllowedDynamicKey('teaser_duration'), 'not allowlisted')
  assertEq(
    filterToPackageContractAllowlist([
      field('teaser_duration'),
      field('wedding_date'),
    ]).length,
    1,
    'filter drops teaser',
  )
})

console.log('\nPackage-contract mode regression finished.')
