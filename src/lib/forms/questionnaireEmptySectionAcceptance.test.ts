/**
 * Regression: empty "Dane do umowy" field card must not render.
 */

import {
  buildDefaultQuestionnaireBlocks,
  ensureQuestionnaireBlocks,
} from '@/lib/forms/questionnaireBlocks'
import { buildContractQuestionnaireTemplate } from '@/lib/forms/contractQuestionnaireTemplate'
import { questionsFromBlocks } from '@/lib/forms/questionsFromBlocks'
import { groupQuestionsIntoSections } from '@/features/forms/formSections'
import { defaultContractQuestionnaireConfig } from '@/types/contractQuestionnaire'
import type { ContractQuestionnaireBlock } from '@/types/questionnaireBlocks'

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

const pkgs = [{ id: 'p1', name: 'Pakiet A', price: 1, currency: 'PLN' }]
const extras = [{ id: 'e1', name: 'Drone', price: 1, currency: 'PLN' }]

run('1. public template has no empty Dane do umowy section card', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: pkgs,
    additionalServices: extras,
    config: ensureQuestionnaireBlocks(defaultContractQuestionnaireConfig()),
  })
  const sections = groupQuestionsIntoSections(tpl.questions)
  assert(
    !sections.some(
      (s) =>
        s.title === 'Dane do umowy' && s.questions.length === 0,
    ),
    'no empty Dane do umowy card',
  )
  assert(
    !sections.some((s) => s.title === 'Dane do umowy'),
    'Dane do umowy is not a field section',
  )
})

run('2. main page title / greeting remain available', () => {
  const tpl = buildContractQuestionnaireTemplate({
    packages: pkgs,
    additionalServices: extras,
    config: ensureQuestionnaireBlocks({
      ...defaultContractQuestionnaireConfig(),
      greeting: 'Cześć!',
      questionnaireTitle: 'Dane do umowy',
    }),
  })
  assertEq(tpl.title, 'Dane do umowy', 'page title')
  assert(tpl.description.includes('Cześć!') || tpl.description.length > 0, 'greeting')
})

run('3. structural section_title with no children filtered', () => {
  const sections = groupQuestionsIntoSections([
    { id: 'orphan', type: 'section_title', label: 'Dane do umowy' },
    { id: 'next', type: 'section_title', label: 'Data ślubu' },
    { id: 'date', type: 'date', label: 'Data ślubu', fieldKey: 'weddingDate' },
  ])
  assertEq(sections.length, 1, 'orphan dropped')
  assertEq(sections[0]?.title, 'Data ślubu', 'kept content section')
  assertEq(sections[0]?.questions.length, 1, 'has field')
})

run('4. default config contains no orphan L1 title block', () => {
  const blocks = buildDefaultQuestionnaireBlocks(null)
  assert(
    !blocks.some(
      (b) =>
        b.type === 'heading' &&
        (b.level === 1 || b.id === 'sys_heading_title'),
    ),
    'no L1 title in defaults',
  )
})

run('5. legacy config normalizes obsolete L1 title away', () => {
  const legacyBlocks: ContractQuestionnaireBlock[] = [
    {
      id: 'sys_heading_title',
      type: 'heading',
      order: 0,
      enabled: true,
      text: 'Dane do umowy',
      level: 1,
    },
    {
      id: 'sys_heading_wedding_date',
      type: 'heading',
      order: 1,
      enabled: true,
      text: 'Data ślubu',
      level: 2,
    },
    {
      id: 'sys_field_wedding_date',
      type: 'system_field',
      order: 2,
      enabled: true,
      systemKey: 'weddingDate',
      label: 'Data ślubu',
      required: true,
      inputType: 'date',
    },
  ]
  const normalized = ensureQuestionnaireBlocks({
    ...defaultContractQuestionnaireConfig(),
    version: 5,
    blocks: legacyBlocks,
  })
  assert(
    !(normalized.blocks ?? []).some(
      (b) =>
        b.type === 'heading' &&
        (b.level === 1 || b.id === 'sys_heading_title'),
    ),
    'L1 stripped',
  )
})

run('6. builder canvas defaults omit empty Dane do umowy block', () => {
  const blocks = buildDefaultQuestionnaireBlocks({
    questionnaireTitle: 'Dane do umowy',
  })
  const qs = questionsFromBlocks(blocks, pkgs, extras)
  assert(
    !qs.some((q) => q.type === 'section_title' && q.label === 'Dane do umowy'),
    'not in questions',
  )
})
