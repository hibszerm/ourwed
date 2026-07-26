/**
 * GenerationReviewState routing — teaser duration + coverage/end-time
 * must become editable review fields before transformContract.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { CompletenessField } from './buildContractCompleteness'
import type { ContractCompletenessReport } from './buildContractCompleteness'
import {
  buildGenerationReviewState,
  enforceConfigurationOnCompleteness,
  type ConfiguredContractCompletenessReport,
} from './WeddingContractGenerationService'
import {
  detectPreGenerationReviewIssues,
  expandCoverageOverrides,
  isValidCoverageDuration,
  isValidCoverageEndTime,
  ensureTeaserDurationSlots,
  UMOWA_GP_ALEKSANDRA_B_FIXTURE,
  repairDurationEndTimeCollisions,
} from './preGenerationReviewIssues'
import { actionablePayloadToReviewPatch } from './generationAttemptResult'
import { isPlaceholderOnlyValue } from './placeholderValue'
import type { TemplateSlot, TemplateSlotMap } from './types'
import type {
  ContractTemplateConfiguration,
  TemplateFieldConfiguration,
} from '@/features/ai-contract-lab/templateFieldConfiguration'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function assertEq<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`)
  }
}

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`  ✓ ${name}`)
  } catch (err) {
    console.error(`  ✗ ${name}`)
    throw err
  }
}

function configuredField(
  partial: Partial<TemplateFieldConfiguration> & {
    id: string
    semanticRole: string
    mode: TemplateFieldConfiguration['mode']
  },
): TemplateFieldConfiguration {
  return {
    templateId: 'template',
    displayName: partial.displayName ?? partial.semanticRole,
    category: 'other',
    requiredWhenVariable: partial.requiredWhenVariable ?? true,
    detectedAnchorIds: partial.detectedAnchorIds ?? [partial.id],
    sourceExamples: [],
    configuredBy: 'user',
    canonicalFieldKey: partial.canonicalFieldKey ?? partial.semanticRole,
    variableSource: partial.variableSource ?? 'wedding',
    ...partial,
  }
}

function configure(
  report: ContractCompletenessReport,
  fields: TemplateFieldConfiguration[],
): ConfiguredContractCompletenessReport {
  const configuration: ContractTemplateConfiguration = {
    templateId: 'template',
    configurationVersion: 1,
    status: 'configured',
    fields,
    sharedLocationPolicy: {
      mode: 'ask_each_time',
      preferredLocationRole: 'ceremony',
      combinedFormat: 'list',
    },
    paymentMode: 'fixed',
    deliveryTermMode: 'fixed',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  }
  return enforceConfigurationOnCompleteness(report, configuration)
}

function slot(
  id: string,
  registryKey: string,
  extra: Partial<TemplateSlot> = {},
): TemplateSlot {
  return {
    id,
    label: registryKey,
    registryKey,
    enabled: true,
    physicallyBound: true,
    physicalSpanSafety: 'safe',
    operation: 'replace',
    requirement: 'optional',
    sourceHint: 'package',
    occurrences: 1,
    paragraphIndex: 0,
    startOffset: 0,
    endOffset: 10,
    originalText: 'wartość',
    ...extra,
  } as TemplateSlot
}

function field(
  slotId: string,
  registryKey: string,
  missing: boolean,
): CompletenessField {
  return {
    slotId,
    registryKey,
    label: registryKey,
    group: 'package',
    value: missing ? '' : 'wartość',
    missing,
    source: missing ? 'missing' : 'package',
    sourceLabel: missing ? 'Brak' : 'Pakiet',
  }
}

function baseReport(
  slots: TemplateSlot[],
  fields: CompletenessField[],
  paragraphs: Array<{ index: number; text: string }> = [],
): ContractCompletenessReport {
  const slotMap: TemplateSlotMap = { version: 1, slots, unmappedDynamics: [] }
  return {
    templateId: 'template',
    templateName: 'Umowa GP',
    slotMap,
    resolved: Object.fromEntries(fields.map((f) => [f.registryKey, f.value])),
    packageSnapshot: {
      packageId: null,
      name: 'Video Mini',
      currency: 'PLN',
      items: [],
    },
    questionnaireAnswers: {},
    sourceParagraphs: paragraphs,
    groups: [
      {
        id: 'package',
        label: 'Pakiet',
        complete: fields.every((f) => !f.missing),
        fields,
      },
    ],
    fields,
    missing: fields.filter((f) => f.missing),
    allComplete: fields.every((f) => !f.missing),
  }
}

console.log('\nGenerationReviewState routing')

run('A — missing teaser duration → editableMissingField teaser_duration', () => {
  const paragraphs = [
    {
      index: 0,
      text: 'teledysku ślubnego o długości ok. __________;',
    },
  ]
  const report = configure(baseReport([], [], paragraphs), [])
  const review = buildGenerationReviewState({ report, overrides: {} })
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'teaser_duration'),
    'teaser_duration field',
  )
  assertEq(
    review.editableMissingFields.find((f) => f.registryKey === 'teaser_duration')
      ?.label,
    'Długość teledysku',
    'label',
  )
})

run('B — placeholder underscores are not a resolved teaser duration', () => {
  assert(isPlaceholderOnlyValue('__________'), 'underscores placeholder')
  const issues = detectPreGenerationReviewIssues({
    slots: [],
    resolved: { film_duration: '__________' },
    overrides: {},
    paragraphs: [
      { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
    ],
  })
  assert(
    issues.editableFields.some((f) => f.registryKey === 'teaser_duration'),
    'still requires teaser',
  )
})

run('C — generationAllowed false while teaser_duration empty', () => {
  const paragraphs = [
    { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
  ]
  const report = configure(baseReport([], [], paragraphs), [])
  const review = buildGenerationReviewState({ report, overrides: {} })
  assert(!review.generationAllowed, 'blocked')
  assert(
    review.blockingUserInputs.some(
      (b) => b.kind === 'missing_field' && b.registryKey === 'teaser_duration',
    ),
    'blocking teaser',
  )
})

run('D — entered teaser duration used on retry (expand + allow)', () => {
  const paragraphs = [
    { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
  ]
  const report = configure(baseReport([], [], paragraphs), [])
  const review = buildGenerationReviewState({
    report,
    overrides: { teaser_duration: '3–5 minut' },
  })
  assert(review.generationAllowed, 'allowed after fill')
  assertEq(
    review.effectiveOverrides.teaser_duration,
    '3–5 minut',
    'override kept',
  )
  assertEq(
    review.effectiveOverrides.film_duration,
    '3–5 minut',
    'aliased to film_duration',
  )
  assert(
    !review.omittedKeys.includes('film_duration'),
    'film_duration not omitted when teaser filled',
  )
  const expanded = expandCoverageOverrides({ teaser_duration: '3–5 minut' })
  assertEq(expanded.film_duration, '3–5 minut', 'expand alias')
})

run('teaser_duration typing lifecycle — field stays mounted while typing', () => {
  const paragraphs = [
    { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
  ]
  const report = configure(baseReport([], [], paragraphs), [])
  const runtimeReviewIssues = [
    {
      slotId: 'actionable-teaser_duration',
      registryKey: 'teaser_duration',
      label: 'Długość teledysku',
      group: 'package' as const,
      value: '',
      missing: true,
      source: 'manual' as const,
      sourceLabel: 'Tylko w tej umowie',
      placeholder: 'np. 3–5 minut',
    },
  ]

  const snap = (overrides: Record<string, string>) => {
    const review = buildGenerationReviewState({
      report,
      overrides,
      runtimeReviewIssues,
    })
    return {
      editableMissingFields: review.editableMissingFields.map((f) => f.registryKey),
      runtimeKeys: runtimeReviewIssues.map((f) => f.registryKey),
      manualOverrides: { ...overrides },
      generationAllowed: review.generationAllowed,
      film_duration: review.effectiveOverrides.film_duration ?? '',
      omittedFilm: review.omittedKeys.includes('film_duration'),
    }
  }

  // 1–2. Initial review — teaser visible
  let state = snap({})
  assert(state.editableMissingFields.includes('teaser_duration'), 'visible initially')
  assert(!state.generationAllowed, 'blocked initially')

  // 3. fireEvent.change(..., "3") — field must stay
  state = snap({ teaser_duration: '3' })
  assert(
    state.editableMissingFields.includes('teaser_duration'),
    'still visible after "3"',
  )
  assert(!state.generationAllowed, 'still blocked after partial "3"')
  assertEq(state.manualOverrides.teaser_duration, '3', 'override kept at "3"')

  // 4–5. Complete value — field stays mounted; Generate becomes enabled
  state = snap({ teaser_duration: '3-5 minu' })
  assert(
    state.editableMissingFields.includes('teaser_duration'),
    'still visible while finishing the unit',
  )
  assert(state.generationAllowed, 'Generate enabled once letters+digits present')

  state = snap({ teaser_duration: '3-5 minut' })
  assert(
    state.editableMissingFields.includes('teaser_duration'),
    'still visible after valid value',
  )
  assertEq(state.manualOverrides.teaser_duration, '3-5 minut', 'override full')
  assertEq(state.film_duration, '3-5 minut', 'aliased for generation')
  assert(!state.omittedFilm, 'not omitted')
  assert(state.generationAllowed, 'Generate enabled after valid teaser')

  // Mid-typing sequence must never clear the override bag or unmount
  const mid = ['3', '3-', '3-5', '3-5 ', '3-5 m', '3-5 mi', '3-5 min', '3-5 minut']
  let overrides: Record<string, string> = {}
  for (const value of mid) {
    overrides = { teaser_duration: value }
    state = snap(overrides)
    assertEq(
      state.manualOverrides.teaser_duration,
      value,
      `override survives rebuild at "${value}"`,
    )
    assert(
      state.editableMissingFields.includes('teaser_duration'),
      `field mounted while typing "${value}"`,
    )
  }
})

run('E — coverage duration and end time are separate semantic values', () => {
  assert(isValidCoverageDuration('12 godzin'), 'duration ok')
  assert(isValidCoverageEndTime('00:30'), 'end ok')
  assert(!isValidCoverageDuration('00:30'), 'clock not duration')
  assert(!isValidCoverageEndTime('12 godzin'), 'duration not clock')
})

run('F — “12 godzin” is not merged with “00:30”', () => {
  const expanded = expandCoverageOverrides({
    coverage_duration: '12 godzin',
    coverage_end_time: '00:30',
  })
  assertEq(expanded.coverage_hours, '12', 'hours numeric')
  assertEq(expanded.coverage_end_time, '00:30', 'end separate')
  assert(
    !/godzin.*00:30|00:30.*godzin/.test(
      `${expanded.coverage_hours} ${expanded.coverage_end_time}`,
    ),
    'not merged in bag',
  )
})

run('G — clock time is not accepted as duration', () => {
  assert(!isValidCoverageDuration('00:30'), 'reject clock')
  assert(!isValidCoverageDuration('12 godziny 00:30'), 'reject collision')
})

run('H — duration is not accepted as clock time', () => {
  assert(!isValidCoverageEndTime('12 godzin'), 'reject duration')
  assert(!isValidCoverageEndTime('12'), 'reject bare hours')
})

run('I — only teaser missing → only teaser field', () => {
  const paragraphs = [
    { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
    {
      index: 1,
      text: 'reportaż do godziny 00.30. Czas pracy maksymalnie 12 godzin.',
    },
  ]
  const slots = [
    slot('end', 'coverage_end_time', {
      originalText: '00.30',
      startOffset: 20,
      endOffset: 25,
      paragraphIndex: 1,
    }),
    slot('hours', 'coverage_hours', {
      originalText: '12',
      startOffset: 60,
      endOffset: 62,
      paragraphIndex: 1,
    }),
  ]
  const fields = [
    field('end', 'coverage_end_time', false),
    field('hours', 'coverage_hours', false),
  ]
  fields[0]!.value = '00:30'
  fields[1]!.value = '12'
  const report = configure(
    {
      ...baseReport(slots, fields, paragraphs),
      resolved: {
        coverage_end_time: '00:30',
        coverage_hours: '12',
      },
    },
    [
      configuredField({
        id: 'end',
        semanticRole: 'coverage_end_time',
        mode: 'variable',
      }),
      configuredField({
        id: 'hours',
        semanticRole: 'coverage_hours',
        mode: 'variable',
      }),
    ],
  )
  const review = buildGenerationReviewState({
    report,
    overrides: {},
  })
  const keys = review.editableMissingFields.map((f) => f.registryKey)
  assert(keys.includes('teaser_duration'), 'teaser shown')
  assert(!keys.includes('coverage_duration'), 'no coverage duration')
  assert(!keys.includes('coverage_end_time'), 'no end time field')
})

run('J — only end time missing → only end time field', () => {
  const slots = [
    slot('end', 'coverage_end_time', {
      originalText: '00.30',
      startOffset: 10,
      endOffset: 15,
    }),
    slot('hours', 'coverage_hours', {
      originalText: '12',
      startOffset: 40,
      endOffset: 42,
    }),
  ]
  const report = configure(
    {
      ...baseReport(slots, [], [
        {
          index: 0,
          text: 'do godziny 00.30. maksymalnie 12 godzin.',
        },
      ]),
      resolved: { coverage_hours: '12' },
    },
    [
      configuredField({
        id: 'end',
        semanticRole: 'coverage_end_time',
        mode: 'variable',
      }),
      configuredField({
        id: 'hours',
        semanticRole: 'coverage_hours',
        mode: 'variable',
      }),
    ],
  )
  const review = buildGenerationReviewState({ report, overrides: {} })
  const keys = review.editableMissingFields.map((f) => f.registryKey)
  assert(keys.includes('coverage_end_time'), 'end shown')
  assert(!keys.includes('coverage_duration'), 'duration known')
  assert(!keys.includes('teaser_duration'), 'no teaser')
})

run('K — both ambiguous → both fields', () => {
  const issues = detectPreGenerationReviewIssues({
    slots: [],
    resolved: {},
    overrides: {},
    paragraphs: [
      { index: 0, text: 'obejmuje czas maksymalnie 12 godziny 00:30.' },
    ],
  })
  const keys = issues.editableFields.map((f) => f.registryKey)
  assert(keys.includes('coverage_duration'), 'duration')
  assert(keys.includes('coverage_end_time'), 'end')
})

run('L — page does not call transform while review has blockers', () => {
  const page = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(page.includes('if (!reviewState.generationAllowed)'), 'gates generate')
  assert(page.includes('generatePending'), 'pending guard')
  assert(
    !page.includes('WeddingContractGenerationService.generate') ||
      page.indexOf('if (!reviewState.generationAllowed)') <
        page.indexOf('WeddingContractGenerationService.generate'),
    'check before generate call',
  )
})

run('M/N — duplicate click protection present', () => {
  const page = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(
    page.includes('generatePending || generateInFlightRef.current') ||
      page.includes('if (generatePending) return'),
    'pending short-circuit',
  )
  assert(page.includes('disabled={generatePending}'), 'button disabled while pending')
  assert(
    page.includes('createGenerationCorrelationId()'),
    'correlation only on attempt path',
  )
  const corrIdx = page.indexOf('createGenerationCorrelationId()')
  const gateIdx = page.indexOf('if (!reviewState.generationAllowed)')
  assert(gateIdx >= 0 && corrIdx > gateIdx, 'correlation after gate')
})

run('O — user-entered values survive failed retry via overrides state', () => {
  const paragraphs = [
    { index: 0, text: 'teledysku ślubnego o długości ok. __________;' },
  ]
  const report = configure(baseReport([], [], paragraphs), [])
  const review = buildGenerationReviewState({
    report,
    overrides: {
      teaser_duration: '3–5 minut',
      coverage_duration: '12 godzin',
    },
    forcedEditableFields: [
      {
        slotId: 'forced-end',
        registryKey: 'coverage_end_time',
        label: 'Godzina zakończenia',
        group: 'package',
        value: '',
        missing: true,
        source: 'manual',
        sourceLabel: 'Tylko w tej umowie',
        placeholder: 'np. 00:30',
      },
    ],
  })
  assertEq(
    review.effectiveOverrides.teaser_duration,
    '3–5 minut',
    'teaser preserved',
  )
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'coverage_end_time'),
    'unresolved forced field remains',
  )
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'teaser_duration'),
    'teaser field stays mounted after valid fill',
  )
  assert(
    !review.blockingUserInputs.some(
      (b) => b.kind === 'missing_field' && b.registryKey === 'teaser_duration',
    ),
    'teaser no longer blocking',
  )
  assert(!review.generationAllowed, 'still blocked by end time')
})

run('P — internal failures still use correlation diagnostics path', () => {
  const page = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(page.includes('needs_review'), 'handles needs_review result')
  assert(page.includes('runtimeReviewIssues'), 'persists runtime review issues')
  assert(page.includes('generateInFlightRef'), 'in-flight guard')
  const err = readFileSync(
    resolve('src/features/documents/template/generationPipelineError.ts'),
    'utf8',
  )
  assert(err.includes("'needs_review'"), 'stage status includes needs_review')
  const transform = readFileSync(
    resolve('src/features/documents/template/ContractTransformationService.ts'),
    'utf8',
  )
  assert(
    transform.includes("logGenerationStage(trace, 'semantic_values_resolution', 'needs_review'"),
    'actionable not logged as failed',
  )
  assert(
    !transform.includes(
      "logGenerationStage(trace, 'semantic_values_resolution', 'failed'",
    ),
    'no failed log for actionable audit',
  )
})

run('ensureTeaserDurationSlots binds underscore near teledysk', () => {
  const text = 'teledysku ślubnego o długości ok. __________;'
  const start = text.indexOf('__________')
  const slots = ensureTeaserDurationSlots({
    slots: [],
    paragraphs: [{ index: 0, text }],
  })
  assert(slots.length === 1, 'one slot')
  assertEq(slots[0]!.registryKey, 'teaser_duration', 'key')
  assertEq(slots[0]!.startOffset, start, 'start')
  assertEq(slots[0]!.originalText, '__________', 'original')
})

run('O/05E32CA1 — real Umowa GP teaser paragraph detected before transform', () => {
  const issues = detectPreGenerationReviewIssues({
    slots: [],
    resolved: {},
    overrides: {},
    paragraphs: [
      { index: 12, text: UMOWA_GP_ALEKSANDRA_B_FIXTURE.teaserParagraph },
      { index: 10, text: UMOWA_GP_ALEKSANDRA_B_FIXTURE.coverageParagraph },
    ],
    coverageHours: 12,
    coverageEndTime: '00:30',
  })
  assert(
    issues.editableFields.some((f) => f.registryKey === 'teaser_duration'),
    'teaser required when package has no value',
  )
  assert(
    !issues.editableFields.some((f) => f.registryKey === 'coverage_duration'),
    'coverage duration known — not shown',
  )
  assert(
    !issues.editableFields.some((f) => f.registryKey === 'coverage_end_time'),
    'end time known — not shown',
  )
})

run('O/05E32CA1 — placeholder teaser + known coverage → generationAllowed false', () => {
  const report = configure(
    baseReport(
      [],
      [],
      [
        {
          index: 12,
          text: UMOWA_GP_ALEKSANDRA_B_FIXTURE.teaserPlaceholderParagraph,
        },
        { index: 10, text: UMOWA_GP_ALEKSANDRA_B_FIXTURE.coverageParagraph },
      ],
    ),
    [],
  )
  report.resolved = {
    coverage_hours: '12',
    coverage_end_time: '00:30',
  }
  const review = buildGenerationReviewState({ report, overrides: {} })
  assert(!review.generationAllowed, 'blocked before transform')
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'teaser_duration'),
    'teaser field visible',
  )
})

run('O/05E32CA1 — actionable payload merges without wiping overrides', () => {
  const patch = actionablePayloadToReviewPatch(
    {
      editableFields: [
        {
          id: 'teaser_duration',
          registryKey: 'teaser_duration',
          label: 'Długość teledysku',
          placeholder: 'np. 3–5 minut',
          group: 'package',
          sourceLabel: 'Tylko w tej umowie',
        },
        {
          id: 'coverage_duration',
          registryKey: 'coverage_duration',
          label: 'Czas pracy podczas reportażu',
          placeholder: 'np. 12 godzin',
          group: 'package',
          sourceLabel: 'Tylko w tej umowie',
        },
      ],
      contextualMessages: [
        'Czas trwania reportażu i godzina zakończenia zostały błędnie połączone.',
      ],
    },
    [
      'Uzupełnij długość teledysku przed generowaniem.',
      'Czas trwania reportażu i godzina zakończenia zostały błędnie połączone.',
    ],
  )
  const report = configure(
    baseReport(
      [],
      [],
      [
        {
          index: 12,
          text: UMOWA_GP_ALEKSANDRA_B_FIXTURE.teaserPlaceholderParagraph,
        },
      ],
    ),
    [],
  )
  const review = buildGenerationReviewState({
    report,
    overrides: { teaser_duration: '3–5 minut' },
    runtimeReviewIssues: patch.editableFields,
  })
  assertEq(
    review.effectiveOverrides.teaser_duration,
    '3–5 minut',
    'override survives recompute',
  )
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'teaser_duration'),
    'teaser input stays mounted',
  )
  assert(
    !review.blockingUserInputs.some(
      (b) => b.kind === 'missing_field' && b.registryKey === 'teaser_duration',
    ),
    'filled teaser not blocking',
  )
  assert(
    review.editableMissingFields.some((f) => f.registryKey === 'coverage_duration'),
    'unresolved actionable field remains',
  )
  assert(!review.generationAllowed, 'still blocked')
})

run('O/05E32CA1 — collision repair when both values known', () => {
  const repaired = repairDurationEndTimeCollisions({
    paragraphs: [
      {
        index: 0,
        text: 'obejmuje czas maksymalnie 12 godziny 00:30. Reszta OK.',
      },
    ],
    durationPhrase: '12 godzin',
  })
  assert(repaired.repaired, 'repaired')
  assert(
    !/\d+\s+godzin(?:a|y)?\s+\d{1,2}[.:]\d{2}/i.test(repaired.paragraphs[0]!.text),
    'collision gone',
  )
  assert(repaired.paragraphs[0]!.text.includes('12 godzin'), 'duration kept')
})

run('O/05E32CA1 — page never treats needs_review as console failure path', () => {
  const page = readFileSync(
    resolve('src/pages/WeddingContractGenerationPage.tsx'),
    'utf8',
  )
  assert(
    page.includes("outcome.kind === 'needs_review'") ||
      page.includes("attempt.status === 'needs_review'"),
    'normal branch',
  )
  const needsIdx = Math.max(
    page.indexOf("outcome.kind === 'needs_review'"),
    page.indexOf("attempt.status === 'needs_review'"),
  )
  const failIdx = page.indexOf(
    "console.error('[contract-generation] generate failed'",
  )
  assert(needsIdx >= 0 && failIdx > needsIdx, 'failure log only in else/catch')
  // Blocked review returns before correlation id
  const gateIdx = page.indexOf('if (!reviewState.generationAllowed)')
  const corrIdx = page.indexOf('createGenerationCorrelationId()')
  assert(gateIdx >= 0 && corrIdx > gateIdx, 'no correlation for blocked review')
})

console.log('\nGenerationReviewState routing done.')
