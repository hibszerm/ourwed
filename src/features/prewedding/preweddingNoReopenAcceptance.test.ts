/**
 * Pre-wedding: no manual reopen — same link stays valid until rotated.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  WEDDING_QUESTIONNAIRE_STATUS_LABELS,
  isPreWeddingSubmittedStatus,
} from '@/types/preweddingQuestionnaire'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
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

const workspace = readFileSync(
  resolve(
    process.cwd(),
    'src/features/weddings/detail/v2/WeddingPreWeddingQuestionnaireWorkspace.tsx',
  ),
  'utf8',
)
const service = readFileSync(
  resolve(process.cwd(), 'src/lib/api/preweddingQuestionnaireService.ts'),
  'utf8',
)
const publicForm = readFileSync(
  resolve(process.cwd(), 'src/features/prewedding/PreWeddingPublicFormPage.tsx'),
  'utf8',
)
const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260730140000_prewedding_allow_resubmit.sql',
  ),
  'utf8',
)

run('reopen UI strings and button removed', () => {
  assert(!workspace.includes('Otwórz ponownie'), 'no Otwórz ponownie')
  assert(!workspace.includes('reopen-btn'), 'no reopen-btn')
  assert(!workspace.includes('handleReopen'), 'no handleReopen')
  assert(!workspace.includes('Ponownie otwarta'), 'no Ponownie otwarta')
})

run('reopen API removed from service', () => {
  assert(!service.includes('async reopen('), 'no reopen method')
  assert(!service.includes("status: 'reopened'"), 'no reopen write')
  assert(!service.includes('Ponownie otwarto ankietę'), 'no reopen timeline')
})

run('submitted status label is Wypełniona; legacy reopened maps the same', () => {
  assert(WEDDING_QUESTIONNAIRE_STATUS_LABELS.submitted === 'Wypełniona', 'submitted')
  assert(WEDDING_QUESTIONNAIRE_STATUS_LABELS.reopened === 'Wypełniona', 'legacy reopened')
  assert(isPreWeddingSubmittedStatus('submitted'), 'submitted helper')
  assert(isPreWeddingSubmittedStatus('reopened'), 'reopened helper')
  assert(!isPreWeddingSubmittedStatus('in_progress'), 'in_progress not submitted')
})

run('share panel remains the entry point for submitted questionnaires', () => {
  assert(workspace.includes('Link gotowy do udostępnienia'), 'share title')
  assert(workspace.includes('copy-link-btn'), 'copy link')
  assert(workspace.includes('copy-message-btn'), 'copy message')
  assert(workspace.includes('preview-btn'), 'open as client')
  assert(workspace.includes('rotate-link-btn') || workspace.includes('generate-link-btn'), 'new link')
  assert(workspace.includes('isSubmitted'), 'submitted share visibility')
})

run('public form: submitted link stays editable until thank-you after submit', () => {
  assert(!publicForm.includes("if (result.status === 'submitted') setSubmitted(true)"), 'no lock on load')
  assert(publicForm.includes('if (submitted)'), 'thank-you after session submit')
  assert(!publicForm.includes("form.status === 'submitted'"), 'status alone does not lock')
})

run('RPC allows autosave + resubmit while status is submitted', () => {
  assert(migration.includes("status not in ('draft', 'archived')"), 'autosave allows submitted')
  assert(!migration.includes("already_submitted', true"), 'no silent already_submitted skip')
  assert(migration.includes("status = 'submitted'"), 'resubmit stays submitted')
  assert(migration.includes("where status = 'reopened'"), 'legacy normalize')
})

run('wedding card / answers view uses submitted helper (not reopen branch)', () => {
  assert(workspace.includes('isPreWeddingSubmittedStatus'), 'uses helper')
  assert(workspace.includes('AnswersView'), 'answers remain')
  assert(workspace.includes('buildWeddingDaySyncCandidates'), 'review after submit')
})

run('generate new link does not reset submitted status (source)', () => {
  assert(service.includes('leavingDraft'), 'token rotate preserves status')
  assert(
    service.includes('Token rotation only') ||
      service.includes('keep submitted'),
    'commented preserve',
  )
})

console.log('\nPre-wedding no-reopen acceptance finished.')
