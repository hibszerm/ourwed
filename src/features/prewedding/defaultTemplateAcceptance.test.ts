// =============================================================================
// Default Template Acceptance Tests — pre_wedding_gentlemen_v2
// =============================================================================

import {
  DEFAULT_TEMPLATE_INTRODUCTION,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_QUESTION_IDS,
  DEFAULT_TEMPLATE_SCHEMA,
  DEFAULT_TEMPLATE_SCHEMA_V1,
  DEFAULT_TEMPLATE_SOURCE_KEY,
  DEFAULT_TEMPLATE_SOURCE_KEY_V1,
  DEFAULT_TEMPLATE_TITLE,
} from './defaultTemplate'
import type { PreWeddingQuestion } from '@/types/preweddingQuestionnaire'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`  FAIL  ${message}`)
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}\n    expected: ${JSON.stringify(expected)}\n    actual:   ${JSON.stringify(actual)}`,
    )
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

function assertDeepEqual<T>(actual: T, expected: T, message: string) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a !== e) {
    console.error(`  FAIL  ${message}\n    expected: ${e}\n    actual:   ${a}`)
    failed++
  } else {
    console.log(`  PASS  ${message}`)
  }
}

function allQuestions(schema = DEFAULT_TEMPLATE_SCHEMA): PreWeddingQuestion[] {
  return schema.sections.flatMap((s) => s.questions)
}

function byId(id: string): PreWeddingQuestion {
  const q = allQuestions().find((x) => x.id === id)
  if (!q) throw new Error(`missing ${id}`)
  return q
}

console.log('\nDefault pre-wedding questionnaire template v2\n')

assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY, 'pre_wedding_gentlemen_v2', 'version key v2')
assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY_V1, 'pre_wedding_gentlemen_v1', 'v1 key preserved')
assertEqual(DEFAULT_TEMPLATE_NAME, 'Ankieta przedślubna', 'template name')
assertEqual(DEFAULT_TEMPLATE_TITLE, 'Krótka ankieta od Gentlemen Productions :)', 'template title')
assert(DEFAULT_TEMPLATE_INTRODUCTION.includes('Gentlemen Productions'), 'intro brand')

assertEqual(DEFAULT_TEMPLATE_SCHEMA.sections.length, 11, '11 sections')
assertEqual(DEFAULT_TEMPLATE_SCHEMA_V1.sections.length, 7, 'v1 still 7 sections')

assertDeepEqual(
  DEFAULT_TEMPLATE_SCHEMA.sections.map((s) => s.title),
  [
    'O Was i Wasz ślub',
    'Przygotowania Panny Młodej',
    'Przygotowania Pana Młodego',
    'Błogosławieństwo i wyjazd',
    'Ceremonia',
    'Po ceremonii',
    'Przyjęcie weselne',
    'Zdjęcia i film',
    'Usługodawcy',
    'Ważne informacje',
    'Wskazówki od nas',
  ],
  'section titles chronological',
)

// Every legacy question id preserved
const ids = allQuestions().map((q) => q.id)
for (const id of DEFAULT_TEMPLATE_QUESTION_IDS) {
  assert(ids.includes(id), `preserves ${id}`)
}
assertEqual(ids.length, DEFAULT_TEMPLATE_QUESTION_IDS.length, 'no extra questions')

// Address fields
assertEqual(byId('q4').type, 'address', 'bride prep address')
assertEqual(byId('q7').type, 'address', 'groom prep address')
assertEqual(byId('q11').type, 'address', 'ceremony address')
assertEqual(byId('q16').type, 'address', 'reception address')

// Sensitive private section
assertEqual(byId('q24').required, false, 'sensitive optional')
assertEqual(
  DEFAULT_TEMPLATE_SCHEMA.sections[9]!.title,
  'Ważne informacje',
  'sensitive in own section',
)
assert(
  DEFAULT_TEMPLATE_SCHEMA.sections[9]!.questions.some((q) => q.id === 'q24'),
  'q24 in Ważne informacje',
)
assert(!DEFAULT_TEMPLATE_SCHEMA.sections[7]!.questions.some((q) => q.id === 'q24'), 'q24 not in Zdjęcia')

// Choice option order preserved vs v1
assertDeepEqual(byId('q9').options, [
  'Tak, jedno wspólne u Pana Młodego',
  'Tak, jedno wspólne u Panny Młodej',
  'Tak, osobne błogosławieństwa',
  'Nie będzie błogosławieństwa / Prosimy nie uwieczniać',
], 'q9 options')
assertDeepEqual(byId('q14').options, ['Chcemy pod kościołem', 'Chcemy pod salą', 'Nie chcemy'], 'q14 options')
assertDeepEqual(byId('q22').options, [
  'Zdajemy się na Ciebie!',
  'Za chwilę podeślemy coś naszego!',
  'Nie mamy filmu',
], 'q22 options')

// Tips acknowledgement
assertEqual(byId('q27_info').type, 'information', 'tips info')
assertEqual(byId('q28').type, 'acknowledgement', 'ack')
assert(byId('q28').required, 'ack required')

// Section descriptions present for key sections
assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[0]!.description), 's1 description')
assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[4]!.description), 'ceremony description')
assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[9]!.description), 'private description')

// Required count still 26
const required = allQuestions().filter((q) => q.required && q.type !== 'information')
assertEqual(required.length, 26, '26 required')

console.log(`\ndefault-template: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
