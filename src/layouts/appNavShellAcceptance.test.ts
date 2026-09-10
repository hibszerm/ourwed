/**
 * App shell nav cleanup: experimental hidden; Ankiety under AppLayout.
 */
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL app-nav-shell — ${msg}`)
}

const sidebar = read('src/layouts/Sidebar.tsx')
assert(!sidebar.includes('Eksperymentalne'), 'no experimental sidebar section')
assert(!sidebar.includes('nav-ai-contract-lab'), 'no lab nav link')
assert(!sidebar.includes('nav-ai-contract-transform'), 'no transform nav link')
assert(!sidebar.includes('Dashboard V2'), 'no dashboard v2 nav')
assert(sidebar.includes("label: 'Pulpit'"), 'dashboard nav is Pulpit')
assert(!sidebar.includes("label: 'Dashboard'"), 'no English Dashboard nav label')
assert(!sidebar.includes('isAiContractLabEnabled'), 'lab flag unused in sidebar')
assert(sidebar.includes("to: '/ankiety'"), 'ankiety nav present')
assert(sidebar.includes('end: false'), 'ankiety active on subroutes')
assert(sidebar.includes("to: '/zadania'"), 'zadania nav present')
assert(sidebar.includes('IconTasks'), 'zadania icon')
assert(sidebar.includes("to: '/przewodnik'"), 'przewodnik nav present')
assert(sidebar.includes("label: 'Przewodnik'"), 'przewodnik label')
assert(sidebar.includes('IconCompass'), 'przewodnik compass icon')
assert(sidebar.includes('showGuideNav'), 'guide visibility preference gate')
assert(sidebar.includes('isGuidePreparationComplete'), 'compass prep readiness')
assert(sidebar.includes('studioPackagesSetupSignalsQueryKey'), 'shared setup signals')
assert(sidebar.includes('guideAttention'), 'guide ambient attention class')
assert(!sidebar.includes('guideCompassMark'), 'halo mark wrapper removed')
assert(!sidebar.includes('guideCompassAttention'), 'halo attention class removed')
{
  const firma = sidebar.indexOf("studioGroupLabel}>Firma")
  const przewodnik = sidebar.indexOf('to="/przewodnik"')
  const ustawienia = sidebar.indexOf('to="/ustawienia"')
  assert(
    firma >= 0 && przewodnik > firma && ustawienia > przewodnik,
    'nav order Firma → Przewodnik → Ustawienia',
  )
}
{
  const mobileStudio = sidebar.slice(
    sidebar.indexOf('const mobileStudioBaseItems'),
    sidebar.indexOf('interface SidebarProps'),
  )
  assert(mobileStudio.includes("to: '/przewodnik'"), 'mobile studio has Przewodnik')
  assert(
    mobileStudio.indexOf("to: '/studio/uslugi'") <
      mobileStudio.indexOf("to: '/przewodnik'"),
    'mobile Przewodnik after Firma items',
  )
}
{
  const sluby = sidebar.indexOf("to: '/sluby'")
  const sesje = sidebar.indexOf("to: '/sesje'")
  const kalendarz = sidebar.indexOf("to: '/kalendarz'")
  const zadania = sidebar.indexOf("to: '/zadania'")
  const oczekujace = sidebar.indexOf("to: '/oczekujace'")
  assert(
    sluby >= 0 &&
      sesje > sluby &&
      kalendarz > sesje &&
      zadania > kalendarz &&
      oczekujace > zadania,
    'nav order Śluby→Sesje→Kalendarz→Zadania→Oczekujące',
  )
}

const router = read('src/routes/router.tsx')
assert(router.includes("path: '/zadania'"), 'zadania route')
assert(router.includes('TasksPage'), 'TasksPage wired')
assert(router.includes("path: '/przewodnik'"), 'przewodnik route')
assert(router.includes('PrzewodnikPage'), 'PrzewodnikPage wired')
assert(router.includes('/laboratorium-umow-ai'), 'experimental routes retained')
assert(router.includes('intentionally hidden'), 'hidden comment on experimental routes')
assert(router.includes('/form/:token'), 'public form route')
assert(router.includes('/ankieta/:token'), 'public prewedding route')
assert(router.includes('PublicFormTokenPage'), 'public form component')
assert(router.includes('QuestionnaireLibraryPage'), 'library route')

const library = read('src/pages/QuestionnaireLibraryPage.tsx')
assert(library.includes('AppLayout'), 'library uses AppLayout')
assert(library.includes('PageContainer'), 'library uses PageContainer')
assert((library.match(/AppLayout/g) ?? []).length >= 2, 'single shell open+close')

const templates = read('src/pages/PreWeddingTemplatesPage.tsx')
assert(templates.includes('AppLayout'), 'template editor uses AppLayout')
assert(templates.includes('PageContainer'), 'template editor PageContainer')

const contract = read('src/pages/ContractQuestionnaireEditorPage.tsx')
assert(contract.includes('AppLayout'), 'contract editor AppLayout')

const detail = read('src/pages/QuestionnaireDetailPage.tsx')
assert(detail.includes('AppLayout'), 'detail AppLayout')

const pending = read('src/pages/PendingWeddingsPage.tsx')
assert(pending.includes('AppLayout'), 'pending AppLayout')

const publicForm = read('src/pages/PublicFormTokenPage.tsx')
assert(!publicForm.includes('AppLayout'), 'public form no AppLayout')

const publicPre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
assert(!publicPre.includes('AppLayout'), 'public prewedding no AppLayout')

const fieldConfig = read('src/pages/DocumentTemplateFieldConfigPage.tsx')
assert(!fieldConfig.includes("navigate('/laboratorium-umow-ai')"), 'no lab CTA in field config')

const docs = read('docs/experimental-tools.md')
assert(docs.includes('hidden from customer navigation'), 'experimental docs')
assert(docs.includes('/laboratorium-umow-ai'), 'docs list routes')

console.log('PASS  app-nav-shell acceptance')
