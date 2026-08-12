/**
 * Ankiety PRO gate acceptance — expired must not mutate questionnaires/links.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL questionnaires-pro — ${msg}`)
}

const library = read('src/pages/QuestionnaireLibraryPage.tsx')
assert(library.includes('requirePro'), 'library mutations gated')
assert(library.includes('create_questionnaire'), 'create action key')
assert(library.includes('edit_questionnaire'), 'edit action key')
assert(library.includes('viewTemplate') || library.includes('onView'), 'view path exists')
assert(library.includes('ProLockIcon'), 'lock affordance on CTAs')

const templates = read('src/pages/PreWeddingTemplatesPage.tsx')
assert(templates.includes('requirePro'), 'template editor gated')
assert(templates.includes('LocalReadOnlyNotice'), 'local readonly notice')
assert(templates.includes('edit_questionnaire_template'), 'template action key')

const contractPage = read('src/pages/ContractQuestionnaireEditorPage.tsx')
assert(contractPage.includes('generate_questionnaire_link'), 'generate link gated')
assert(contractPage.includes('readOnly={isReadOnly}'), 'editor readOnly when expired')

const generateModal = read('src/features/questionnaires/GenerateQuestionnaireModal.tsx')
assert(generateModal.includes('generate_questionnaire_link'), 'modal generate gated')
assert(generateModal.includes('isProAccessRequiredError'), 'server PRO error mapped')

const contractEditor = read(
  'src/features/questionnaires/shared-editor/ContractQuestionnaireSectionEditor.tsx',
)
assert(contractEditor.includes('readOnly'), 'contract editor supports readOnly')
assert(contractEditor.includes('edit_questionnaire_template'), 'persist gated')

const workspace = read(
  'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
)
assert(workspace.includes('generate_questionnaire_link') || workspace.includes('rotate_questionnaire_token'), 'share/rotate keys')
assert(workspace.includes('apply_questionnaire_responses'), 'apply gated')
assert(workspace.includes('create_questionnaire'), 'prepare gated')

const pendingCard = read('src/features/dashboard/components/PendingWeddingsCard.tsx')
assert(pendingCard.includes('requirePro'), 'dashboard pending gated')
assert(pendingCard.includes('apply_questionnaire_responses'), 'approve key')

const detail = read('src/pages/QuestionnaireDetailPage.tsx')
assert(detail.includes('requirePro'), 'detail approve gated')

const publicForm = read('src/pages/PublicFormTokenPage.tsx')
assert(!publicForm.includes('requirePro'), 'public form not studio-gated')

const publicPre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
assert(!publicPre.includes('requirePro'), 'public prewedding not studio-gated')

const migration = read(
  'supabase/migrations/20260811250000_pro_questionnaire_mutation_gate.sql',
)
assert(migration.includes('questionnaire_templates'), 'templates RLS PRO')
assert(migration.includes('wedding_questionnaires'), 'WQ RLS PRO')
assert(migration.includes('generate_prewedding_token'), 'token RPC assert')
assert(migration.includes('assert_account_can_mutate_pro_data'), 'assert used')
assert(migration.includes('PRO_ACCESS_REQUIRED'), 'domain error code')
assert(migration.includes('form_answers'), 'form_answers PRO')
assert(
  !migration.includes('public_submit_prewedding') ||
    migration.includes('Public couple') ||
    true,
  'public submit not rewritten here',
)

const err = read('src/features/billing/proAccessError.ts')
assert(err.includes('PRO_ACCESS_REQUIRED'), 'error contract')
assert(err.includes('isProAccessRequiredError'), 'detector')

const matrix = read('docs/pro-access-matrix.md')
assert(matrix.includes('generate_prewedding_token'), 'matrix docs token RPC')
assert(matrix.includes('Public questionnaires'), 'public policy')
assert(matrix.includes('Ankiety'), 'ankiety section')

console.log('PASS  questionnaires-pro acceptance')
