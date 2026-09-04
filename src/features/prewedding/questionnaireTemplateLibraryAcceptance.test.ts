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
  const modern = readFileSync(
    resolve(process.cwd(), 'src/features/prewedding/modern/ModernQuestionnaireLibrary.tsx'),
    'utf8',
  )
  const librarySrc = `${library}\n${modern}`
  assert(router.includes('QuestionnaireLibraryPage'), 'library route component')
  assert(router.includes("/ankiety/przedslubne/:templateId"), 'pre-wedding editor route')
  assert(router.includes("/ankiety/dane-do-umowy"), 'contract editor kept')
  assert(sidebar.includes("to: '/ankiety'"), 'sidebar Ankiety → /ankiety')
  assert(librarySrc.includes('library-section-contract'), 'contract section')
  assert(librarySrc.includes('library-section-pre-wedding'), 'pre-wedding section')
  assert(librarySrc.includes('Archiwalne'), 'archived area')
})

run('library: wedding prepare uses 0/1/N selection', () => {
  const src = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/usePreWeddingQuestionnaireWorkspace.ts',
    ),
    'utf8',
  )
  const ui = readFileSync(
    resolve(
      process.cwd(),
      'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
    ),
    'utf8',
  )
  const combined = `${src}\n${ui}`
  assert(combined.includes("listActive('pre_wedding')"), 'lists active pre-wedding')
  assert(combined.includes('active.length === 0'), 'zero templates branch')
  assert(combined.includes('active.length === 1'), 'one template branch')
  assert(combined.includes('PreWeddingTemplateSelectDialog'), 'multi select dialog')
  assert(combined.includes('Nie masz aktywnej ankiety przedślubnej'), 'empty copy')
  assert(!combined.includes('getOrSeedDefault()'), 'prepare does not auto-seed silently')
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

run('getOrSeedDefault: never rewrites an owned template in place', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const start = service.indexOf('async getOrSeedDefault()')
  const end = service.indexOf('async create(', start)
  const body = service.slice(start, end)
  assert(start >= 0 && end > start, 'getOrSeedDefault located')
  assert(!body.includes('.update('), 'no in-place template UPDATE')
  assert(body.includes("error.code === '23505'"), 'unique source_key race returns existing row')
  assert(!body.includes('DEFAULT_TEMPLATE_SOURCE_KEY_V1'), 'v1 rows are left unchanged')
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
  const modern = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/modern/ModernQuestionnaireLibrary.tsx',
    ),
    'utf8',
  )
  const librarySrc = `${library}\n${modern}`
  assert(librarySrc.includes('/ankiety/dane-do-umowy'), 'contract opens existing editor')
  assert(librarySrc.includes('contract-template-card'), 'contract card present')
})

run('permanent delete: SET NULL snapshot safety, archived-only, no cascade to issued', () => {
  const service = readFileSync(
    resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
    'utf8',
  )
  const modern = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/modern/ModernQuestionnaireLibrary.tsx',
    ),
    'utf8',
  )
  const copy = readFileSync(
    resolve(
      process.cwd(),
      'src/features/prewedding/modern/questionnaireLibraryCopy.ts',
    ),
    'utf8',
  )
  const createMig = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260729200000_prewedding_questionnaire.sql',
    ),
    'utf8',
  )
  const publicGet = readFileSync(
    resolve(
      process.cwd(),
      'supabase/migrations/20260729220000_prewedding_public_studio_branding_restore.sql',
    ),
    'utf8',
  )

  assert(
    createMig.includes(
      'template_id           uuid references public.questionnaire_templates(id) on delete set null',
    ),
    'issued template_id SET NULL',
  )
  assertEqual(
    (createMig.match(/references public\.questionnaire_templates/g) ?? []).length,
    1,
    'only issued WQ FK points at templates',
  )
  assert(
    createMig.includes(
      'references public.wedding_questionnaires(id) on delete cascade',
    ),
    'responses cascade from issued questionnaire, not template',
  )
  assert(
    !publicGet.toLowerCase().includes('questionnaire_templates'),
    'public form does not join templates',
  )
  assert(publicGet.includes('schema_snapshot_json'), 'public form uses snapshot')

  const delStart = service.indexOf('async deletePermanently')
  const delEnd = service.indexOf('async setDefault', delStart)
  const delBody = service.slice(delStart, delEnd)
  assert(delStart >= 0 && delEnd > delStart, 'deletePermanently located')
  assert(delBody.includes("from('questionnaire_templates')"), 'deletes template row')
  assert(delBody.includes('.delete()'), 'hard delete')
  assert(!delBody.includes("from('wedding_questionnaires')"), 'does not delete issued')
  assert(
    !delBody.includes("from('wedding_questionnaire_responses')"),
    'does not delete responses',
  )
  assert(delBody.includes("type !== 'pre_wedding'"), 'refuses contract templates')
  assert(delBody.includes('!current.isArchived'), 'refuses active templates')
  assert(!delBody.includes('getOrSeedDefault'), 'does not re-seed presets')
  assert(
    service.includes('if (patch.isArchived) updatePayload.is_default = false'),
    'archive clears default before delete path',
  )

  assertEqual(
    copy.includes("export const QUESTIONNAIRE_LIBRARY_DELETE_TITLE = 'Usunąć ankietę na stałe?'"),
    true,
    'delete title copy',
  )
  assert(modern.includes('QUESTIONNAIRE_LIBRARY_DELETE_BODY'), 'delete body in modal')
  assert(modern.includes('Usuń na stałe') || modern.includes('QUESTIONNAIRE_LIBRARY_DELETE_CONFIRM'), 'confirm label')
  assert(!modern.includes('window.confirm'), 'no window.confirm')
  assert(modern.includes("variant=\"danger\""), 'danger confirm')
  assert(modern.includes('getUserFacingErrorMessage'), 'mapped Polish errors')
  assert(!modern.includes('removeQueries'), 'no optimistic removal')
  assert(modern.includes('mutateAsync(deleteTarget.id)'), 'waits for DB success')
})

console.log(`\n${passed} passed, ${failed} failed`)
if (failed > 0) process.exit(1)
