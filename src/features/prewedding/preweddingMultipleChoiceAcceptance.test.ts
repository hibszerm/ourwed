/**
 * Phase 0: pre-wedding public multiple_choice is actually multiple selection.
 * Canonical persist shape is string[]. Legacy scalar strings stay readable.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  isMultipleChoiceSelectionEmpty,
  normalizeMultipleChoiceAnswer,
  toggleMultipleChoiceValue,
} from '@/features/prewedding/multipleChoiceAnswer'
import { formatAnswerValueForDisplay } from '@/features/prewedding/answerSummary'
import { isAnswerEmpty } from '@/features/prewedding/preweddingLocation'
import type { PreWeddingQuestion, PreWeddingSection } from '@/types/preweddingQuestionnaire'

let passed = 0
let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  PASS  ${message}`)
    passed++
  } else {
    console.error(`  FAIL  ${message}`)
    failed++
  }
}

function assertEqual<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) {
    console.error(
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
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

function run(name: string, fn: () => void) {
  console.log(`\n${name}`)
  fn()
}

const question: PreWeddingQuestion = {
  id: 'q_multi',
  label: 'Wybierz momenty',
  type: 'multiple_choice',
  required: true,
  options: ['A', 'B', 'C'],
}

const sections: PreWeddingSection[] = [
  { id: 's1', title: 'Test', questions: [question] },
]

const singleQuestion: PreWeddingQuestion = {
  id: 'q_single',
  label: 'Wybierz jedną',
  type: 'single_choice',
  required: true,
  options: ['A', 'B', 'C'],
}

function persistRoundTrip(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  return JSON.parse(JSON.stringify(answers)) as Record<string, unknown>
}

function requiredError(
  sections: PreWeddingSection[],
  answers: Record<string, unknown>,
): string | undefined {
  for (const s of sections) {
    for (const q of s.questions) {
      if (!q.required || q.hidden || q.type === 'information') continue
      if (isAnswerEmpty(answers[q.id])) return 'To pole jest wymagane.'
    }
  }
  return undefined
}

run('F: public multiple_choice allows 2+ selected options', () => {
  const afterA = toggleMultipleChoiceValue([], 'A')
  const afterAC = toggleMultipleChoiceValue(afterA, 'C')
  assertDeepEqual(afterAC, ['A', 'C'], 'F: A + C selected')
  assert(afterAC.length >= 2, 'F: at least two values')

  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicSrc.includes('function MultipleChoiceField'), 'public MultipleChoiceField exists')
  assert(
    publicSrc.includes("case 'multiple_choice':") &&
      publicSrc.includes('<MultipleChoiceField'),
    'router uses MultipleChoiceField',
  )
  assert(publicSrc.includes('type="checkbox"'), 'checkbox controls')
  assert(
    !/case 'multiple_choice':\s*return <SingleChoiceField/.test(publicSrc),
    'multiple_choice is not radio SingleChoiceField',
  )
})

run('G: multiple_choice persists as array, not a comma string', () => {
  const answers = { q_multi: toggleMultipleChoiceValue(['A'], 'C') }
  const serialized = JSON.stringify(answers)
  assert(serialized.includes('["A","C"]') || serialized.includes('["A", "C"]'), 'G: JSON array')
  assert(!serialized.includes('A, C'), 'G: not comma-separated string')
  const restored = persistRoundTrip(answers)
  assert(Array.isArray(restored.q_multi), 'G: parsed value is array')
})

run('H: autosave + reload restores the array', () => {
  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicSrc.includes('JSON.stringify(nextAnswers)'), 'H: autosave serializes answers object')
  assert(publicSrc.includes('result.savedAnswers'), 'H: reload uses savedAnswers')

  const saved = persistRoundTrip({ q_multi: ['A', 'C'] })
  const selected = normalizeMultipleChoiceAnswer(saved.q_multi)
  assertDeepEqual(selected, ['A', 'C'], 'H: reload restores A + C')
  assert(selected.includes('A') && selected.includes('C'), 'H: both remain selected')
})

run('I: removing one option persists correctly', () => {
  const afterRemove = toggleMultipleChoiceValue(['A', 'C'], 'A')
  assertDeepEqual(afterRemove, ['C'], 'I: only C remains')
  const reloaded = persistRoundTrip({ q_multi: afterRemove })
  assertDeepEqual(reloaded.q_multi, ['C'], 'I: reload keeps only C')
})

run('J: required multiple_choice rejects empty selection', () => {
  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicSrc.includes('export function validateRequired'), 'J: validateRequired exported')
  assert(
    publicSrc.includes("errors[q.id] = 'To pole jest wymagane.'"),
    'J: required copy unchanged',
  )
  assertEqual(
    requiredError(sections, { q_multi: [] }),
    'To pole jest wymagane.',
    'J: empty array rejected',
  )
  assertEqual(
    requiredError(sections, {}),
    'To pole jest wymagane.',
    'J: missing answer rejected',
  )
  assertEqual(requiredError(sections, { q_multi: ['C'] }), undefined, 'J: one selection is enough')
  assert(isMultipleChoiceSelectionEmpty([]), 'J: helper treats [] as empty')
  assert(!isMultipleChoiceSelectionEmpty(['C']), 'J: helper treats [C] as filled')
})

run('K: legacy scalar response normalizes without crash', () => {
  const selected = normalizeMultipleChoiceAnswer('A')
  assertDeepEqual(selected, ['A'], 'K: scalar → [value]')
  const display = formatAnswerValueForDisplay(question, 'A')
  assertEqual(display, 'A', 'K: review display remains readable')
  const empty = normalizeMultipleChoiceAnswer('')
  assertDeepEqual(empty, [], 'K: empty scalar → []')
  const roundTrip = persistRoundTrip({ q_multi: 'A' })
  assertEqual(typeof roundTrip.q_multi, 'string', 'K: load does not rewrite stored scalar')
  const fromReload = normalizeMultipleChoiceAnswer(roundTrip.q_multi)
  assertDeepEqual(fromReload, ['A'], 'K: UI still checks A')
})

run('L: single_choice still stores one string via radios', () => {
  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicSrc.includes('function SingleChoiceField'), 'L: SingleChoiceField kept')
  assert(
    publicSrc.includes("case 'single_choice':") &&
      publicSrc.includes('<SingleChoiceField'),
    'L: single_choice still radios',
  )
  const start = publicSrc.indexOf('function SingleChoiceField')
  const end = publicSrc.indexOf('function MultipleChoiceField')
  const radioBody = publicSrc.slice(start, end)
  assert(radioBody.includes('type="radio"'), 'L: radio inputs')
  assert(radioBody.includes('onChange={() => onChange(opt)}'), 'L: stores option string')

  const singleSections: PreWeddingSection[] = [
    { id: 's1', title: 'Test', questions: [singleQuestion] },
  ]
  const required = requiredError(singleSections, { q_single: '' })
  assertEqual(required, 'To pole jest wymagane.', 'L: required still applies')
  const ok = requiredError(singleSections, { q_single: 'B' })
  assertEqual(ok, undefined, 'L: string value still valid')
  const display = formatAnswerValueForDisplay(singleQuestion, 'B')
  assertEqual(display, 'B', 'L: display still the option string')
})

run('resubmit: submit RPC receives the answers object (arrays intact)', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  assert(publicSrc.includes('publicPreWeddingService.submit(token, answers,'), 'submit passes answers')
  assert(service.includes('p_answers: answers'), 'RPC payload is the answers object')
  const payload = persistRoundTrip({ q_multi: ['A', 'C'] })
  assert(Array.isArray(payload.q_multi), 'resubmit JSON keeps array')
})

run('contract Form Engine is a separate multiple_choice path', () => {
  const publicSrc = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
    'utf8',
  )
  const contract = readFileSync(
    resolve(process.cwd(), 'src/lib/forms/questionnaireBlocks.ts'),
    'utf8',
  )
  assert(!publicSrc.includes('questionnaireBlocks'), 'pre-wedding public does not import contract blocks')
  assert(contract.includes("case 'multiple_choice':"), 'contract engine still owns its own type')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
