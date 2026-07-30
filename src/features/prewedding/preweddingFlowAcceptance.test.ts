// =============================================================================
// Pre-Wedding Questionnaire Flow Acceptance Tests
// Uses tsx-compatible assertion pattern (no vitest import required)
// =============================================================================

import { DEFAULT_TEMPLATE_SCHEMA } from './defaultTemplate'
import type { PreWeddingAnswerValue, PreWeddingSection } from '@/types/preweddingQuestionnaire'

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
    console.error(`  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
    failed++
  } else {
    console.log(`  PASS  ${message}`)
    passed++
  }
}

// ---------------------------------------------------------------------------
// Logic helpers (mirrors public form logic)
// ---------------------------------------------------------------------------

function countRequired(sections: PreWeddingSection[]): number {
  let count = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (q.required && !q.hidden && q.type !== 'information') count++
    }
  }
  return count
}

function countAnsweredRequired(
  sections: PreWeddingSection[],
  answers: Record<string, PreWeddingAnswerValue>,
): number {
  let count = 0
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required || q.hidden || q.type === 'information') continue
      const v = answers[q.id]
      if (v === undefined || v === null || v === '' || v === false) continue
      if (Array.isArray(v) && v.length === 0) continue
      count++
    }
  }
  return count
}

function validateRequired(
  sections: PreWeddingSection[],
  answers: Record<string, PreWeddingAnswerValue>,
): Record<string, string> {
  const errors: Record<string, string> = {}
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required || q.hidden || q.type === 'information') continue
      const v = answers[q.id]
      const isEmpty =
        v === undefined || v === null || v === '' || v === false ||
        (Array.isArray(v) && v.length === 0)
      if (isEmpty) errors[q.id] = 'wymagane'
    }
  }
  return errors
}

// ---------------------------------------------------------------------------

console.log('\nPre-wedding questionnaire flow — pure logic\n')

const sections = DEFAULT_TEMPLATE_SCHEMA.sections
const totalRequired = countRequired(sections)

assertEqual(totalRequired, 26, 'total required: 26 (q1-q23 + q25-q26 + q28, q24 optional)')

assertEqual(countAnsweredRequired(sections, {}), 0, 'empty answers → 0 answered required')

assertEqual(Object.keys(validateRequired(sections, {})).length, 26, 'empty answers → 26 required errors')

// Optional answer does not increment count
assertEqual(countAnsweredRequired(sections, { q24: 'family note' }), 0, 'only optional answer → still 0')

// Required answer increments count
assertEqual(countAnsweredRequired(sections, { q1: '2026-08-15' }), 1, 'filling q1 → 1 answered')

// Boolean false does not count
assertEqual(countAnsweredRequired(sections, { q28: false }), 0, 'false acknowledgement → 0 answered')

// Boolean true counts
assertEqual(countAnsweredRequired(sections, { q28: true }), 1, 'true acknowledgement → 1 answered')
assert(!('q28' in validateRequired(sections, { q28: true })), 'q28=true removes its error')

// Single choice answered
const errAfterQ9 = validateRequired(sections, { q9: 'Nie będzie błogosławieństwa / Prosimy nie uwieczniać' })
assert(!('q9' in errAfterQ9), 'q9 single_choice answered → no error')

// All required filled → no errors
const allAnswers: Record<string, PreWeddingAnswerValue> = {}
for (const s of sections) {
  for (const q of s.questions) {
    if (q.type === 'information') continue
    if (q.type === 'acknowledgement') {
      allAnswers[q.id] = true
    } else if (q.type === 'single_choice' || q.type === 'yes_no') {
      allAnswers[q.id] = q.options?.[0] ?? 'Tak'
    } else {
      allAnswers[q.id] = 'filled'
    }
  }
}
assertEqual(Object.keys(validateRequired(sections, allAnswers)).length, 0, 'all required answered → no errors')
assertEqual(countAnsweredRequired(sections, allAnswers), 26, 'all answered → 26 answered required')

// Hidden question excluded
const sectionsWithHidden = sections.map((s) => ({
  ...s,
  questions: s.questions.map((q) => (q.id === 'q1' ? { ...q, hidden: true } : q)),
}))
assert(!('q1' in validateRequired(sectionsWithHidden, {})), 'hidden q1 → no required error')
assertEqual(countRequired(sectionsWithHidden), 25, 'hidden q1 → 25 required total')

// ---------------------------------------------------------------------------
console.log('\nPrefill logic\n')

const prefill: Record<string, string> = { weddingDate: '2026-08-15', brideName: 'Anna Kowalska' }
const q1 = DEFAULT_TEMPLATE_SCHEMA.sections[0]!.questions[0]! // date
const q1Prefill = q1.weddingDayMapping ? prefill[q1.weddingDayMapping] : undefined
assertEqual(q1Prefill, '2026-08-15', 'wedding date prefill → q1')

const q2 = DEFAULT_TEMPLATE_SCHEMA.sections[0]!.questions[1]! // brideName
const q2Prefill = q2.weddingDayMapping ? prefill[q2.weddingDayMapping] : undefined
assertEqual(q2Prefill, 'Anna Kowalska', 'bride name prefill → q2')

// ---------------------------------------------------------------------------
console.log('\nWedding Day mapping\n')

function findQ(id: string) {
  for (const s of DEFAULT_TEMPLATE_SCHEMA.sections) {
    const q = s.questions.find((x) => x.id === id)
    if (q) return q
  }
  throw new Error(`missing ${id}`)
}

assertEqual(findQ('q24').weddingDayMapping, 'sensitiveFamilyNotes', 'Q24 mapping: sensitiveFamilyNotes')
assertEqual(findQ('q11').weddingDayMapping, 'ceremonyLocation', 'Q11 mapping: ceremonyLocation')
assertEqual(findQ('q4').weddingDayMapping, 'bridePreparationLocation', 'Q4 mapping: bridePreparationLocation')
assertEqual(findQ('q7').weddingDayMapping, 'groomPreparationLocation', 'Q7 mapping: groomPreparationLocation')

// ---------------------------------------------------------------------------
console.log('\nTab integration\n')

import('@/features/weddings/detail/v2/weddingWorkspaceSelectors').then((mod) => {
  const tabIds = mod.WORKSPACE_TABS.map((t) => t.id)
  const contractIdx = tabIds.indexOf('contract_finance')
  const preWeddingIdx = tabIds.indexOf('pre_wedding_questionnaire')
  const activityIdx = tabIds.indexOf('activity')

  assert(preWeddingIdx > -1, 'tab: pre_wedding_questionnaire exists')
  assert(preWeddingIdx > contractIdx, 'tab: after contract_finance')
  assert(preWeddingIdx < activityIdx, 'tab: before activity')

  const tab = mod.WORKSPACE_TABS.find((t) => t.id === 'pre_wedding_questionnaire')
  assertEqual(tab?.label, 'Ankieta przedślubna', 'tab label: Ankieta przedślubna')

  assertEqual(mod.parseWorkspaceTab('pre_wedding_questionnaire'), 'pre_wedding_questionnaire', 'parseWorkspaceTab recognizes pre_wedding_questionnaire')

  console.log(`\nprewedding-flow: ${passed} passed, ${failed} failed\n`)
  if (failed > 0) process.exit(1)
})
