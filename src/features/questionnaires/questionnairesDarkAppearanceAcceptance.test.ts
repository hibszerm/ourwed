/**
 * Phase 2F — Questionnaires ecosystem Dark compatibility.
 * Run: npm run test:questionnaires-dark
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveThemeCssVariables } from '@/features/theme/themeRegistry'
import { THEME_IDS } from '@/features/theme/types'
import lightBaseline from '@/features/appearance/lightThemeTokenBaseline.json'

function read(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
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

const PRIVATE_CHROME_CSS = [
  'src/features/questionnaires/Questionnaires.module.css',
  'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.module.css',
  'src/features/questionnaires/pending/modern/ModernPendingWorkspace.module.css',
  'src/features/prewedding/modern/ModernQuestionnaireLibrary.module.css',
  'src/pages/PreWeddingTemplatesPage.module.css',
  'src/features/prewedding/PreWeddingTemplateSelectDialog.module.css',
  'src/features/prewedding/QuestionnaireLocationField.module.css',
]

const LIGHT_ONLY = [
  '#ecfdf3',
  '#fef3c7',
  '#fee2e2',
  '#fef2f2',
  '#b42318',
  '#3b82f6',
  'rgba(17, 17, 17',
  'rgb(0 0 0 /',
]

function scanPrivateChromeCss() {
  const hits: string[] = []
  for (const file of PRIVATE_CHROME_CSS) {
    const css = read(file)
    for (const token of LIGHT_ONLY) {
      if (css.includes(token)) hits.push(`${file}: ${token}`)
    }
    if (/\bbackground:\s*#fff\b/.test(css)) hits.push(`${file}: raw #fff background`)
    if (css.includes('filter: invert')) hits.push(`${file}: filter invert`)
  }
  return hits
}

run('A. private questionnaire UI avoids Light-only hardcodes', () => {
  const hits = scanPrivateChromeCss()
  assert(hits.length === 0, hits.join('\n'))
})

run('B. public questionnaire UI remains forced Light', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  const publicForm = read('src/pages/PublicFormTokenPage.tsx')
  const publicPre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light force')
  assert(publicForm.includes('usePublicThemeIsolation'), 'contract public form')
  assert(publicPre.includes('usePublicThemeIsolation'), 'pre-wedding public form')
})

run('C. usePublicThemeIsolation remains intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(!pub.includes('prefers-color-scheme'), 'no system appearance')
  assert(pub.includes('DEFAULT_THEME_ID'), 'classic default theme on public')
  assert(pub.includes("dataset.themeSurface = 'public'"), 'public surface marker')
})

run('D. private detail does not import public-form CSS', () => {
  const workspace = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.tsx',
  )
  assert(!workspace.includes('FormPublicPage'), 'no public form CSS import')
  assert(!workspace.includes('QuestionField'), 'no public field replay')
})

run('E. private detail remains fact-list architecture', () => {
  const workspace = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.tsx',
  )
  const sections = read(
    'src/features/questionnaires/detail/modern/ModernQuestionnaireResponseSections.tsx',
  )
  assert(workspace.includes('<h1'), 'in-page H1')
  assert(sections.includes('buildContractAnswerSections'), 'snapshot sections')
  assert(sections.includes('optionsSnapshot'), 'options snapshot')
})

run('F. pending queue remains Modern architecture', () => {
  const row = read('src/features/questionnaires/pending/modern/ModernPendingRow.tsx')
  const copy = read('src/features/questionnaires/pending/modern/pendingCopy.ts')
  const css = read('src/features/questionnaires/pending/modern/ModernPendingWorkspace.module.css')
  assert(copy.includes('Akceptuj'), 'accept action copy')
  assert(copy.includes('Odrzuć'), 'reject action copy')
  assert(copy.includes('Otwórz ankietę'), 'open action copy')
  assert(row.includes('PENDING_ACCEPT'), 'accept wired')
  assert(!css.includes("[data-appearance='dark']"), 'no local dark selectors')
})

run('G. all five Dark theme token sets complete', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(Boolean(dark['--surface-primary']), `${id} surface`)
    assert(Boolean(dark['--status-success-soft']), `${id} status`)
  }
})

run('H. Light token baseline exact', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key}`)
    }
  }
})

run('I. snapshot/historical presentation architecture unchanged', () => {
  const summary = read('src/features/questionnaires/contractAnswerSummary.ts')
  assert(summary.includes('labelSnapshot'), 'label snapshots')
  assert(summary.includes('packageSnapshots'), 'package snapshots')
  assert(summary.includes('additionalServiceSnapshots'), 'extras snapshots')
})

run('J. no per-theme component Dark matrix', () => {
  const css =
    read('src/features/questionnaires/detail/modern/ModernQuestionnaireDetailWorkspace.module.css') +
    read('src/features/prewedding/modern/ModernQuestionnaireLibrary.module.css')
  assert(!css.includes("[data-theme='"), 'no theme selectors')
  assert(!css.includes("[data-appearance='dark']"), 'no local dark selectors')
})

run('K. mobile navigation V1.8.1 frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('L. questionnaire surfaces inherit root appearance', () => {
  const detail = read('src/pages/QuestionnaireDetailPage.tsx')
  const pending = read('src/pages/PendingWeddingsPage.tsx')
  assert(!detail.includes('data-appearance='), 'detail page')
  assert(!pending.includes('data-appearance='), 'pending page')
})

run('M. approve/reject semantics preserved', () => {
  const pending = read('src/features/questionnaires/pending/modern/ModernPendingWorkspace.tsx')
  assert(pending.includes('questionnaireService.approve'), 'approve service')
  assert(pending.includes('questionnaireService.reject'), 'reject service')
  assert(!pending.includes('confirm('), 'no confirmation modal')
})

run('N. questionnaire public routes unchanged', () => {
  const router = read('src/routes/router.tsx')
  assert(router.includes("path: '/form/:token'"), 'public contract form')
  assert(router.includes("path: '/ankieta/:token'"), 'public pre-wedding form')
})

console.log('\nQuestionnaires Dark Phase 2F acceptance done.')
