/**
 * Unified questionnaire editor + mapping visibility + custom answer lifecycle.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  blocksToEditorSections,
  editorSectionsToBlocks,
  createEditorQuestion,
  createEditorSection,
  applyQuestionEdits,
} from '@/features/questionnaires/shared-editor/contractBlocksAdapter'
import { buildDefaultQuestionnaireBlocks } from '@/lib/forms/questionnaireBlocks'
import {
  buildAnswerList,
  buildAnswerSections,
  formatAnswerValueForDisplay,
} from '@/features/prewedding/answerSummary'
import type { PreWeddingTemplateSchema } from '@/types/preweddingQuestionnaire'

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
      `  FAIL  ${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    )
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

run('shared editor: Contract page uses section editor, not canvas', () => {
  const page = readFileSync(
    resolve(process.cwd(), 'src/pages/ContractQuestionnaireEditorPage.tsx'),
    'utf8',
  )
  const editor = readFileSync(
    resolve(
      process.cwd(),
      'src/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor.tsx',
    ),
    'utf8',
  )
  assert(page.includes('ContractQuestionnaireSectionEditor'), 'wired')
  assert(!page.includes('ContractQuestionnaireBuilder'), 'old builder gone from page')
  assert(editor.includes('contract-section-editor'), 'testid')
  assert(!editor.includes('builder-element-panel'), 'no left panel')
  assert(!editor.includes('builder-inspector'), 'no right inspector')
  assert(editor.includes('Sekcje i pytania'), 'sections UI')
  assert(editor.includes('Dodaj pytanie'), 'add question')
  assert(editor.includes('Dodaj sekcję'), 'add section')
})

run('mapping UI: completely removed from Pre-Wedding editor', () => {
  const pre = readFileSync(
    resolve(process.cwd(), 'src/pages/PreWeddingTemplatesPage.tsx'),
    'utf8',
  )
  const contract = readFileSync(
    resolve(
      process.cwd(),
      'src/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor.tsx',
    ),
    'utf8',
  )
  assert(!pre.includes('Mapowanie do Dnia ślubu'), 'no mapping label')
  assert(!pre.includes('weddingDayMapping'), 'no mapping binding in UI')
  assert(!pre.includes('bridePreparationLocation'), 'no raw location key')
  assert(!contract.includes('Mapowanie'), 'no mapping in contract editor')
  assert(!contract.includes('bridePreparationLocation'), 'no raw key in contract')
})

run('adapter: default blocks round-trip preserves system keys', () => {
  const blocks = buildDefaultQuestionnaireBlocks()
  const sections = blocksToEditorSections(blocks)
  assert(sections.length > 0, 'has sections')
  assert(
    sections.some((s) => s.questions.some((q) => q.systemBadge)),
    'has system questions',
  )
  const packages = sections
    .flatMap((s) => s.questions)
    .find((q) => q.editorType === 'packages')
  assert(Boolean(packages), 'packages preserved')

  const rebuilt = editorSectionsToBlocks(sections, blocks, {
    greeting: 'Cześć',
    footer: 'Stopka',
  })
  const sys = rebuilt.find(
    (b) => b.type === 'system_field' && b.systemKey === 'weddingDate',
  )
  assert(Boolean(sys), 'weddingDate system field survives')
  const pkg = rebuilt.find((b) => b.type === 'packages')
  assert(Boolean(pkg), 'packages block survives')
  const loc = rebuilt.find((b) => b.type === 'location')
  assert(Boolean(loc), 'location block survives')
})

run('adapter: custom question has no arbitrary mapping / system key', () => {
  const q = createEditorQuestion('short_text')
  assert(!q.protected, 'custom not protected')
  assertEqual(q.editorType, 'short_text', 'type')
  const block = applyQuestionEdits({
    ...q,
    label: 'Osoba kontaktowa w dniu ślubu',
  })
  assert(block.type === 'short_text', 'custom short_text')
  if (block.type === 'short_text') {
    assert(Boolean(block.fieldKey), 'has fieldKey')
    assert(!('systemKey' in block && (block as { systemKey?: string }).systemKey), 'no systemKey')
  }
})

run('adapter: add custom section + questions', () => {
  const blocks = buildDefaultQuestionnaireBlocks()
  const sections = blocksToEditorSections(blocks)
  const custom = createEditorSection('Dodatkowe ustalenia')
  custom.questions.push(
    (() => {
      const q = createEditorQuestion('short_text')
      return { ...q, label: 'Osoba kontaktowa w dniu ślubu' }
    })(),
    (() => {
      const q = createEditorQuestion('multiple_choice')
      return {
        ...q,
        label: 'Najważniejsze momenty',
        optionLabels: [
          'Przygotowania',
          'Ceremonia',
          'Życzenia',
          'Pierwszy taniec',
          'Impreza',
        ],
      }
    })(),
  )
  const next = [...sections, custom]
  const rebuilt = editorSectionsToBlocks(next, blocks, { greeting: 'Hi' })
  const heading = rebuilt.find(
    (b) => b.type === 'heading' && b.text === 'Dodatkowe ustalenia',
  )
  assert(Boolean(heading), 'custom section heading')
  const multi = rebuilt.find(
    (b) =>
      b.type === 'multiple_choice' &&
      'label' in b &&
      b.label === 'Najważniejsze momenty',
  )
  assert(Boolean(multi), 'custom multi choice')
  if (multi && multi.type === 'multiple_choice') {
    assertEqual(multi.options?.length ?? 0, 5, 'five options')
  }
})

run('answers: custom section answers render from snapshot', () => {
  const schema: PreWeddingTemplateSchema = {
    sections: [
      {
        id: 's_custom',
        title: 'Dodatkowe ustalenia',
        questions: [
          {
            id: 'q_contact',
            label: 'Osoba kontaktowa w dniu ślubu',
            type: 'short_text',
            required: false,
          },
          {
            id: 'q_moments',
            label: 'Najważniejsze momenty',
            type: 'multiple_choice',
            required: false,
            options: [
              'Przygotowania',
              'Ceremonia',
              'Życzenia',
              'Pierwszy taniec',
              'Impreza',
            ],
          },
          {
            id: 'q_show',
            label: 'Czy planowany jest pokaz?',
            type: 'yes_no',
            required: false,
          },
          {
            id: 'q_empty',
            label: 'Puste',
            type: 'short_text',
            required: false,
          },
        ],
      },
    ],
  }
  const answers = {
    q_contact: 'Wujek Jan',
    q_moments: ['Przygotowania', 'Ceremonia', 'Pierwszy taniec'],
    q_show: true,
  }
  const list = buildAnswerList(schema, answers)
  assertEqual(list.length, 3, 'empty omitted')
  assert(
    list.some((i) => i.label === 'Osoba kontaktowa w dniu ślubu' && i.value === 'Wujek Jan'),
    'custom short text',
  )
  const moments = list.find((i) => i.questionId === 'q_moments')
  assertEqual(
    moments?.value,
    'Przygotowania, Ceremonia, Pierwszy taniec',
    'choice labels not ids',
  )
  assertEqual(
    formatAnswerValueForDisplay(schema.sections[0]!.questions[2]!, true),
    'Tak',
    'yes_no Tak',
  )

  const groups = buildAnswerSections(schema, answers)
  assertEqual(groups.length, 1, 'one section group')
  assertEqual(groups[0]!.sectionTitle, 'Dodatkowe ustalenia', 'section title')
})

run('answers: template edit does not affect snapshot labels', () => {
  const snapshot: PreWeddingTemplateSchema = {
    sections: [
      {
        id: 's1',
        title: 'Stara sekcja',
        questions: [
          {
            id: 'q1',
            label: 'Stara etykieta',
            type: 'short_text',
            required: false,
            weddingDayMapping: 'bridePreparationLocation',
          },
        ],
      },
    ],
  }
  const list = buildAnswerList(snapshot, { q1: 'Adres X' })
  assertEqual(list[0]!.label, 'Stara etykieta', 'uses snapshot label')
  assert(!list[0]!.value.includes('bridePreparationLocation'), 'no mapping key shown')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
