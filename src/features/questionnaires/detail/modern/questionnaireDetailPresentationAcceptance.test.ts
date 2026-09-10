/**
 * Questionnaire instance detail V1 — Modern response-record presentation.
 * Run: npm run test:questionnaire-detail-presentation
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DETAIL_BACK,
  DETAIL_BACK_LIBRARY_TO,
  DETAIL_BACK_PENDING,
  DETAIL_BACK_PENDING_TO,
  resolveQuestionnaireDetailBack,
} from './questionnaireDetailCopy'

function read(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertIncludes(src: string, needle: string, m: string) {
  assert(src.includes(needle), `${m}: missing ${JSON.stringify(needle)}`)
}

function assertNotIncludes(src: string, needle: string, m: string) {
  assert(!src.includes(needle), `${m}: must not include ${JSON.stringify(needle)}`)
}

{
  const page = read('src/pages/QuestionnaireDetailPage.tsx')
  const router = read('src/routes/router.tsx')
  assertIncludes(page, 'ModernQuestionnaireDetailWorkspace', 'page mounts modern workspace')
  assertIncludes(page, 'width="wide"', 'Modern wide shell')
  assertNotIncludes(page, 'title=', 'no AppLayout title H1')
  assertIncludes(page, '<AppLayout>', 'AppLayout without title prop')
  assertIncludes(router, "path: '/ankiety/instancje/:id'", 'legacy alias')
  assertIncludes(router, "path: '/ankiety/:id'", 'canonical detail route')
}

{
  const workspace = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.tsx',
  )
  const sections = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireResponseSections.tsx',
  )
  const row = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireResponseRow.tsx',
  )
  const copy = read(
    'src/features/questionnaires/detail/modern/questionnaireDetailCopy.ts',
  )
  const css = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.module.css',
  )
  const publicCss = read('src/features/forms/FormPublicPage.module.css')
  const publicPage = read('src/features/forms/ProductionContractFormPage.tsx')

  assertIncludes(workspace, '<h1', 'in-page H1')
  assertIncludes(workspace, 'questionnaireService.getById', 'reuses getById')
  assertIncludes(workspace, 'questionnaireService.getAnswers', 'reuses getAnswers')
  assertIncludes(workspace, "queryKey: ['questionnaires', userId, id]", 'query key frozen')
  assertIncludes(
    workspace,
    "queryKey: ['questionnaires', userId, id, 'answers']",
    'answers query key frozen',
  )
  assertIncludes(workspace, 'questionnaireService.approve', 'approve reused')
  assertIncludes(
    workspace,
    "actionKey: 'apply_questionnaire_responses'",
    'PRO gate preserved',
  )
  assertIncludes(
    workspace,
    'invalidateAfterQuestionnaireApproval',
    'shared approve invalidation incl. notifications',
  )
  assertNotIncludes(workspace, 'await Promise.all', 'does not await invalidation')
  assertNotIncludes(workspace, 'Odrzuć', 'no reject action')
  assertNotIncludes(workspace, 'questionnaireService.reject', 'does not call reject')
  assertNotIncludes(workspace, 'QuestionnaireAnswersReadOnly', 'no disabled form replay')
  assertNotIncludes(workspace, 'QuestionField', 'no public QuestionField')
  assertNotIncludes(workspace, 'FormPublicPage', 'no public form CSS')
  assertNotIncludes(workspace, 'Szczegóły ankiety', 'no classic subtitle')
  assertNotIncludes(workspace, 'Metadane', 'no metadata inspector')
  assertNotIncludes(workspace, 'instance.token', 'no raw token in primary UI')
  assertNotIncludes(workspace, '>{instance.weddingId}<', 'no raw wedding UUID identity')
  assert(
    !/<Link[^>]*>\s*<Button/.test(workspace),
    'no nested Link > Button',
  )
  assertIncludes(workspace, 'resolveQuestionnaireDetailBack', 'explicit back resolver')
  assertIncludes(workspace, 'location.state', 'uses route state not history.back')
  assertNotIncludes(workspace, 'navigate(-1)', 'no history-only back')
  assertNotIncludes(workspace, 'history.back', 'no history.back')
  assertIncludes(copy, "export const DETAIL_BACK = 'Lista'", 'library fallback copy')
  assertIncludes(copy, "export const DETAIL_BACK_PENDING = 'Oczekujące'", 'pending back copy')
  assertIncludes(copy, "from === DETAIL_BACK_PENDING_TO", 'pending from match')
  assertIncludes(
    workspace,
    "instance.status === 'submitted' && !instance.weddingId",
    'create wedding only unattached submitted',
  )
  assertIncludes(
    workspace,
    "instance.status === 'approved' && Boolean(instance.weddingId)",
    'open wedding only approved+attached',
  )
  assertIncludes(copy, 'Utwórz ślub', 'create copy')
  assertIncludes(copy, 'Otwórz ślub', 'open wedding copy')
  assertIncludes(copy, 'Nie znaleziono ankiety', 'not-found copy')
  assertIncludes(copy, 'Lista', 'back copy')
  assertIncludes(copy, 'Oczekujące', 'pending back copy')
  assertIncludes(copy, 'Wysłano', 'submitted label')
  assertIncludes(sections, 'buildContractAnswerSections', 'snapshot-safe sections')
  assertIncludes(sections, 'optionsSnapshot', 'uses instance snapshot')
  assertNotIncludes(sections, 'packageService', 'no live package catalog')
  assertNotIncludes(sections, 'extraServiceService', 'no live extras catalog')
  assertIncludes(row, 'item.label', 'answer labels')
  assertIncludes(css, 'max-width: 1120px', 'record 1120 left axis')
  assertIncludes(css, 'font-size: var(--text-sm)', 'section eyebrow uses text-sm')
  assertIncludes(css, 'letter-spacing: 0.04em', 'section eyebrow tracking preserved')
  assertIncludes(css, 'text-transform: uppercase', 'section eyebrow uppercase preserved')
  assertIncludes(css, 'color: var(--color-text-secondary)', 'section eyebrow secondary contrast')
  assertNotIncludes(css, 'margin-inline: auto', 'record not centered island')
  assertNotIncludes(css, 'min-height: 100dvh', 'no public-form viewport height')
  assertIncludes(css, 'min-height: var(--touch-target)', '44px targets')
  assertIncludes(css, 'overflow-wrap: anywhere', 'long text wrap')
  assertIncludes(css, 'outline: 2px solid var(--color-accent)', 'focus-visible')
  assertIncludes(workspace, 'questionnaire-detail-loading', 'loading skeleton')
  assertNotIncludes(workspace, 'Ładowanie ankiety', 'no loading copy')

  assertIncludes(publicPage, 'FormPublicPage.module.css', 'public form still owns its CSS')
  assertIncludes(publicCss, '--content-max-form', 'public form width token untouched')
}

{
  const dead = read('src/features/questionnaires/QuestionnaireAnswersReadOnly.tsx')
  assertIncludes(dead, 'FormPublicPage.module.css', 'legacy replay retained unused by Modern')
  const workspace = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.tsx',
  )
  assertNotIncludes(workspace, 'QuestionnaireAnswersReadOnly', 'workspace ignores legacy replay')
  console.log('PASS  questionnaire detail modern presentation')
}

{
  const summary = read('src/features/questionnaires/contractAnswerSummary.ts')
  assertIncludes(summary, 'labelSnapshot', 'custom label snapshots')
  assertIncludes(summary, 'packageSnapshots', 'package snapshots')
  assertIncludes(summary, 'additionalServiceSnapshots', 'extras snapshots')
  const sections = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireResponseSections.tsx',
  )
  assertIncludes(sections, 'buildContractAnswerSections', 'reuses snapshot formatter')
  console.log('PASS  historical snapshot interpretation reused')
}

{
  const pending = resolveQuestionnaireDetailBack('/oczekujace')
  assert(pending.to === DETAIL_BACK_PENDING_TO, 'pending back goes to /oczekujace')
  assert(pending.label === DETAIL_BACK_PENDING, 'pending back label')
  const library = resolveQuestionnaireDetailBack(undefined)
  assert(library.to === DETAIL_BACK_LIBRARY_TO, 'fallback back goes to /ankiety')
  assert(library.label === DETAIL_BACK, 'fallback back label Lista')
  assert(
    resolveQuestionnaireDetailBack('/ankiety').to === DETAIL_BACK_LIBRARY_TO,
    'unknown from falls back to library',
  )
  const forms = read('src/lib/api/forms.ts')
  assertIncludes(
    forms,
    'link: `/ankiety/${instanceId}`',
    'unattached notification destination unchanged',
  )
  assertNotIncludes(forms, 'from=oczekujace', 'notification URL has no from query')
  console.log('PASS  back-navigation IA + notification URL freeze')
}

console.log('\nAll questionnaire detail V1 presentation acceptance checks passed.')
