/**
 * Questionnaire Template Library acceptance tests.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  countAnswerableQuestions,
  regenerateSchemaIds,
} from '@/features/prewedding/templateSchemaUtils'
import { validateQuestionnaireTemplate } from '@/features/prewedding/validateQuestionnaireTemplate'
import { DEFAULT_TEMPLATE_SCHEMA } from '@/features/prewedding/defaultTemplate'

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

run('library: routes and nav point to Ankiety hub', () => {
  const router = readFileSync(resolve(process.cwd(), 'src/routes/router.tsx'), 'utf8')
  const sidebar = readFileSync(resolve(process.cwd(), 'src/layouts/Sidebar.tsx'), 'utf8')
  const library = readFileSync(
    resolve(process.cwd(), 'src/pages/QuestionnaireLibraryPage.tsx'),
    'utf8',
  )
  assert(router.includes('QuestionnaireLibraryPage'), 'library route component')
  assert(router.includes("/ankiety/przedslubne/:templateId"), 'pre-wedding editor route')
  assert(router.includes("/ankiety/dane-do-umowy"), 'contract editor kept')
  assert(sidebar.includes("to: '/ankiety'"), 'sidebar Ankiety → /ankiety')
  assert(library.includes('library-section-contract'), 'contract section')
  assert(library.includes('library-section-pre-wedding'), 'pre-wedding section')
  assert(library.includes('Zarchiwizowane'), 'archived area')
})

run('library: wedding prepare uses 0/1/N selection', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  assert(src.includes("listActive('pre_wedding')"), 'lists active pre-wedding')
  assert(src.includes('active.length === 0'), 'zero templates branch')
  assert(src.includes('active.length === 1'), 'one template branch')
  assert(src.includes('PreWeddingTemplateSelectDialog'), 'multi select dialog')
  assert(src.includes('Nie masz aktywnej ankiety przedślubnej'), 'empty copy')
  assert(!src.includes('getOrSeedDefault()'), 'prepare does not auto-seed silently')
})

run('selection dialog: radio cards + default + no archived contract mix', () => {
  const dialog = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/PreWeddingTemplateSelectDialog.tsx'),
    'utf8',
  )
  assert(dialog.includes('role="radiogroup"'), 'radiogroup')
  assert(dialog.includes('Domyślna'), 'default badge')
  assert(dialog.includes('Zarządzaj ankietami'), 'manage link')
  assert(dialog.includes('Użyj wybranej'), 'confirm')
})

run('validation: rejects empty name/title and choice without options', () => {
  const bad = validateQuestionnaireTemplate({
    name: '',
    title: '',
    schema: {
      sections: [
        {
          id: 's1',
          title: '',
          questions: [
            {
              id: 'q1',
              label: 'Kolor?',
              type: 'single_choice',
              required: true,
              options: ['Tylko jedna'],
            },
          ],
        },
      ],
    },
  })
  assert(bad.some((e) => e.includes('wewnętrzną')), 'name error')
  assert(bad.some((e) => e.includes('tytuł')), 'title error')
  assert(bad.some((e) => e.includes('opcji')), 'options error')

  const good = validateQuestionnaireTemplate({
    name: 'Film',
    title: 'Ankieta filmowa',
    schema: DEFAULT_TEMPLATE_SCHEMA,
  })
  assertEqual(good.length, 0, 'default schema validates')
})

run('duplicate: regenerateSchemaIds creates new question ids', () => {
  const original = DEFAULT_TEMPLATE_SCHEMA
  const firstId = original.sections[0]?.questions[0]?.id
  assert(Boolean(firstId), 'has question id')
  const copy = regenerateSchemaIds(original)
  const copyId = copy.sections[0]?.questions[0]?.id
  assert(Boolean(copyId), 'copy has id')
  assert(copyId !== firstId, 'ids differ')
  assertEqual(
    countAnswerableQuestions(copy),
    countAnswerableQuestions(original),
    'answerable count preserved',
  )
})

run('snapshot safety: prepare stores deep-copied schema_snapshot', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  assert(service.includes('schema_snapshot_json: schemaSnapshot'), 'uses snapshot var')
  assert(service.includes('JSON.parse'), 'deep copy')
  assert(service.includes("template.type !== 'pre_wedding'"), 'type guard')
  assert(service.includes('template.isArchived'), 'archive guard')
  assert(service.includes('template.ownerId !== userId'), 'ownership guard')
  assert(service.includes('eq(\'type\', type)'), 'default clear scoped by type')
})

run('migration: type column + default-per-type unique index', () => {
  const mig = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260729230000_questionnaire_template_library_types.sql',
    ),
    'utf8',
  )
  assert(mig.includes("check (type in ('contract', 'pre_wedding'))"), 'type check')
  assert(mig.includes('questionnaire_templates_default_per_owner_type'), 'default index')
  assert(mig.includes('questionnaire_templates_owner_source_key'), 'source_key unique')
})

run('deferred: contract multi-template selection kept on existing editor', () => {
  const library = readFileSync(
    resolve(process.cwd(), 'src/pages/QuestionnaireLibraryPage.tsx'),
    'utf8',
  )
  assert(library.includes('/ankiety/dane-do-umowy'), 'contract opens existing editor')
  assert(library.includes('contract-template-card'), 'contract card present')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
