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
assert(!sidebar.includes('isAiContractLabEnabled'), 'lab flag unused in sidebar')
assert(sidebar.includes("to: '/ankiety'"), 'ankiety nav present')
assert(sidebar.includes('end: false'), 'ankiety active on subroutes')

const router = read('src/routes/router.tsx')
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
