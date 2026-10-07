/**
 * Shared pre-generation document analysis helpers used by the retained
 * ContractTransformationService compatibility path.
 */

import {
  detectPreGenerationReviewIssues,
  ensureTeaserDurationSlots,
  expandCoverageOverrides,
  isValidCoverageDuration,
  isValidCoverageEndTime,
  repairDurationEndTimeCollisions,
  UMOWA_GP_ALEKSANDRA_B_FIXTURE,
} from './preGenerationReviewIssues'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function equal(actual: unknown, expected: unknown, message: string) {
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

run('duration and end-time values remain distinct', () => {
  assert(isValidCoverageDuration('12 godzin'), 'duration ok')
  assert(isValidCoverageEndTime('00:30'), 'end ok')
  assert(!isValidCoverageDuration('00:30'), 'clock not duration')
  assert(!isValidCoverageEndTime('12 godzin'), 'duration not clock')
  const expanded = expandCoverageOverrides({
    coverage_duration: '12 godzin',
    coverage_end_time: '00:30',
  })
  equal(expanded.coverage_hours, '12', 'hours numeric')
  equal(expanded.coverage_end_time, '00:30', 'end stays separate')
})

run('mixed duration and clock values are rejected as a duration', () => {
  assert(!isValidCoverageDuration('12 godziny 00:30'), 'reject collision')
  assert(!isValidCoverageDuration('00:30'), 'reject clock')
})

run('ambiguous duration and end-time text is diagnosed separately', () => {
  const issues = detectPreGenerationReviewIssues({
    slots: [],
    resolved: {},
    overrides: {},
    paragraphs: [
      { index: 0, text: 'obejmuje czas maksymalnie 12 godziny 00:30.' },
    ],
  })
  const keys = issues.editableFields.map((field) => field.registryKey)
  assert(keys.includes('coverage_duration'), 'duration issue')
  assert(keys.includes('coverage_end_time'), 'end-time issue')
})

run('teaser placeholder is located without changing its source text', () => {
  const text = 'teledysku ślubnego o długości ok. __________;'
  const start = text.indexOf('__________')
  const slots = ensureTeaserDurationSlots({
    slots: [],
    paragraphs: [{ index: 0, text }],
  })
  equal(slots.length, 1, 'one slot')
  equal(slots[0]!.registryKey, 'teaser_duration', 'semantic key')
  equal(slots[0]!.startOffset, start, 'source offset')
  equal(slots[0]!.originalText, '__________', 'source placeholder')
})

run('known package coverage is not requested again for the source teaser', () => {
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
    issues.editableFields.some((field) => field.registryKey === 'teaser_duration'),
    'only the unresolved teaser is surfaced',
  )
  assert(
    !issues.editableFields.some((field) => field.registryKey === 'coverage_duration'),
    'known coverage duration is not surfaced',
  )
  assert(
    !issues.editableFields.some((field) => field.registryKey === 'coverage_end_time'),
    'known end time is not surfaced',
  )
})

run('duration and clock collisions can be mechanically separated', () => {
  const repaired = repairDurationEndTimeCollisions({
    paragraphs: [
      {
        index: 0,
        text: 'obejmuje czas maksymalnie 12 godziny 00:30. Reszta OK.',
      },
    ],
    durationPhrase: '12 godzin',
  })
  assert(repaired.repaired, 'repair applied')
  assert(
    !/\d+\s+godzin(?:a|y)?\s+\d{1,2}[.:]\d{2}/i.test(repaired.paragraphs[0]!.text),
    'collision removed',
  )
  assert(repaired.paragraphs[0]!.text.includes('12 godzin'), 'duration retained')
})

console.log('\nShared pre-generation analysis checks finished.')
