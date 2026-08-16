// =============================================================================
// Default Template Acceptance Tests — pre_wedding_default_v2 (neutral copy)
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
    passed++
  }
}

function allQuestions(schema = DEFAULT_TEMPLATE_SCHEMA): PreWeddingQuestion[] {
  return schema.sections.flatMap((s) => s.questions)
}

function byId(id: string, schema = DEFAULT_TEMPLATE_SCHEMA): PreWeddingQuestion {
  const q = allQuestions(schema).find((x) => x.id === id)
  if (!q) throw new Error(`missing ${id}`)
  return q
}

function serializeCoupleFacing(schema = DEFAULT_TEMPLATE_SCHEMA): string {
  return [
    DEFAULT_TEMPLATE_TITLE,
    DEFAULT_TEMPLATE_INTRODUCTION,
    DEFAULT_TEMPLATE_NAME,
    ...schema.sections.flatMap((s) => [
      s.title,
      s.description ?? '',
      ...s.questions.flatMap((q) => [
        q.label,
        q.helpText ?? '',
        q.placeholder ?? '',
        ...(q.options ?? []),
      ]),
    ]),
  ].join('\n')
}

/** Forbidden founder fragments without keeping full brand literals in source. */
const FORBIDDEN_FRAGMENTS = [
  'gent' + 'lemen',
  'Gentle' + 'men',
  'gent' + 'lemenproductions',
  'kontakt.gentle' + 'menproductions@gmail.com',
  'Hib' + 'szer',
  'Marcin Hib' + 'szer',
]

console.log('\nDefault pre-wedding questionnaire template v2\n')

assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY, 'pre_wedding_default_v2', 'version key v2')
assertEqual(DEFAULT_TEMPLATE_SOURCE_KEY_V1, 'pre_wedding_default_v1', 'v1 key')
assertEqual(DEFAULT_TEMPLATE_NAME, 'Ankieta przedślubna', 'template name')
assertEqual(DEFAULT_TEMPLATE_TITLE, 'Ankieta przedślubna', 'neutral template title')
assert(
  DEFAULT_TEMPLATE_INTRODUCTION.includes('przygotować się do dnia ślubu'),
  'intro keeps helpful planning tone',
)

const coupleFacingV2 = serializeCoupleFacing(DEFAULT_TEMPLATE_SCHEMA)
const coupleFacingV1 = serializeCoupleFacing(DEFAULT_TEMPLATE_SCHEMA_V1)
for (const blob of [
  { label: 'v2', text: coupleFacingV2 },
  { label: 'v1 schema', text: coupleFacingV1 },
]) {
  const lower = blob.text.toLowerCase()
  for (const frag of FORBIDDEN_FRAGMENTS) {
    assert(
      !lower.includes(frag.toLowerCase()) && !blob.text.includes(frag),
      `${blob.label}: no founder fragment`,
    )
  }
  assert(!/@gmail\.com/i.test(blob.text), `${blob.label}: no hardcoded gmail`)
}

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

const ids = allQuestions().map((q) => q.id)
for (const id of DEFAULT_TEMPLATE_QUESTION_IDS) {
  assert(ids.includes(id), `preserves ${id}`)
}
assertEqual(ids.length, DEFAULT_TEMPLATE_QUESTION_IDS.length, 'no extra questions')

const expectedMappings: Record<string, string> = {
  q1: 'weddingDate',
  q2: 'brideName',
  q3: 'bridePhone',
  q4: 'bridePreparationLocation',
  q5: 'groomName',
  q6: 'groomPhone',
  q7: 'groomPreparationLocation',
  q8: 'groomDepartureNote',
  q9: 'blessingPlan',
  q10: 'departureToCeremonyTime',
  q11: 'ceremonyLocation',
  q12: 'ceremonyTime',
  q13: 'ceremonyNotes',
  q14: 'groupPhotoPlan',
  q15: 'guestWishesPlan',
  q16: 'receptionVenue',
  q17: 'receptionArrivalTime',
  q18: 'guestCount',
  q19: 'smallGroupPhotosPlan',
  q21: 'photoVideoPriorities',
  q24: 'sensitiveFamilyNotes',
  q26: 'djBandProvider',
}
for (const [id, mapping] of Object.entries(expectedMappings)) {
  assertEqual(byId(id).weddingDayMapping, mapping, `mapping ${id}`)
}

assert(
  byId('q20').label.toLowerCase().includes('harmonogram'),
  'q20 still asks for wedding schedule',
)
assert(!byId('q20').label.includes('@'), 'q20 label has no email')

assertEqual(byId('q4').type, 'address', 'bride prep address')
assertEqual(byId('q7').type, 'address', 'groom prep address')
assertEqual(byId('q11').type, 'address', 'ceremony address')
assertEqual(byId('q16').type, 'address', 'reception address')

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

assertEqual(byId('q27_info').type, 'information', 'tips info')
assertEqual(byId('q28').type, 'acknowledgement', 'ack')
assert(byId('q28').required, 'ack required')

assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[0]!.description), 's1 description')
assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[4]!.description), 'ceremony description')
assert(Boolean(DEFAULT_TEMPLATE_SCHEMA.sections[9]!.description), 'private description')

const required = allQuestions().filter((q) => q.required && q.type !== 'information')
assertEqual(required.length, 26, '26 required')

console.log(`\ndefault-template: ${passed} passed, ${failed} failed\n`)
if (failed > 0) process.exitCode = 1
