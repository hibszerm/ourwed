/**
 * Phase 2A — Wedding ecosystem Dark compatibility.
 * Run: npm run test:wedding-dark
 */

import { readFileSync, readdirSync } from 'node:fs'
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

run('A. wedding routes do not force Light appearance', () => {
  const router = read('src/routes/router.tsx')
  assert(router.includes('WeddingsRoutePage'), 'weddings list route')
  assert(router.includes('WeddingDetailRoutePage'), 'wedding detail route')
  assert(router.includes('NewWeddingPage'), 'create wedding route')
  assert(router.includes('WeddingImportPage'), 'import route')
  assert(!router.includes("data-appearance='light'"), 'no forced light on routes')
})

run('B. public pre-wedding isolation still forces Light', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light appearance')
  const pre = read('src/pages/PublicPreWeddingQuestionnairePage.tsx')
  assert(pre.includes('usePublicThemeIsolation'), 'public pre-wedding isolated')
})

run('C. document paper surfaces remain appearance-independent', () => {
  const preview = read('src/features/weddings/actions/ContractDocumentPreview.module.css')
  assert(preview.includes('.page {'), 'paper class exists')
  assert(preview.includes('background: #fff'), 'paper stays white')
  assert(preview.includes('background: var(--app-background-subtle)'), 'chrome uses tokens')
  const docxPreview = read(
    'src/features/documents/contract-experience/ContractDocxPreview.module.css',
  )
  assert(docxPreview.includes('.paperHost'), 'docx paper host')
  assert(
    docxPreview.includes('background: #fff'),
    'saved contract docx paper stays white',
  )
})

run('D. wedding portals inherit root appearance (no local override)', () => {
  const modals = read('src/features/weddings/detail/WeddingDetailHostModals.tsx')
  assert(!modals.includes('data-appearance='), 'host modals do not override appearance')
  const travel = read('src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx')
  assert(!travel.includes('data-appearance='), 'travel modal inherits root')
})

run('E. no prefers-color-scheme mode selection in wedding feature', () => {
  const files = [
    'src/features/weddings/modern-detail/ModernWeddingDetailWorkspace.tsx',
    'src/features/weddings/detail/v2/WeddingDetailV2.tsx',
    'src/pages/NewWeddingPage.tsx',
    'src/pages/WeddingImportPage.tsx',
  ]
  for (const f of files) {
    const src = read(f)
    assert(!src.includes('prefers-color-scheme'), `${f} no OS scheme`)
  }
})

run('F. no System appearance option in wedding UI', () => {
  const pages = read('src/pages/WeddingsRoutePage.tsx') + read('src/pages/WeddingDetailRoutePage.tsx')
  for (const forbidden of ['Systemowy', 'Automatyczny', "'system'", '"system"']) {
    assert(!pages.includes(forbidden), `wedding pages exclude ${forbidden}`)
  }
})

run('G. Light semantic outputs remain frozen', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    assert(Boolean(baseline), `${id} baseline`)
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key} light frozen`)
    }
  }
})

run('H. all five themes resolve complete Dark token sets', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(dark['--app-background'] !== resolveThemeCssVariables(id, 'light')['--app-background'], `${id} dark env`)
    assert(Boolean(dark['--surface-primary']), `${id} dark surface`)
    assert(Boolean(dark['--text-primary']), `${id} dark text`)
  }
})

run('I. modern wedding detail CSS has no light-only #fff fallbacks', () => {
  const dirs = ['src/features/weddings/modern-detail', 'src/features/weddings/modern']
  for (const dir of dirs) {
    const abs = resolve(process.cwd(), dir)
    for (const entry of readdirSync(abs)) {
      if (!entry.endsWith('.module.css')) continue
      const css = read(`${dir}/${entry}`)
      assert(!css.includes('#fff'), `${entry} no #fff`)
      assert(!css.includes('#9a6700'), `${entry} no light warning hex`)
      assert(!css.includes('rgba(0, 0, 0'), `${entry} no rgba black fallbacks`)
    }
  }
})

run('J. classic WeddingDetailV2 removed light hardcodes in chrome', () => {
  const css = read('src/features/weddings/detail/v2/WeddingDetailV2.module.css')
  assert(!css.includes('color: #fff'), 'no #fff text in v2 chrome')
  assert(!css.includes('#9a6700'), 'no light warning hex')
  assert(css.includes('var(--shadow-md)'), 'semantic shadow')
})

run('K. mobile navigation V1.8.1 geometry unchanged', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width frozen')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'drawer motion frozen')
  assert(sidebar.includes('blur(12px)'), 'drawer blur frozen')
  const layout = read('src/layouts/AppLayout.module.css')
  assert(!layout.includes('left: min(74vw'), 'no clipped backdrop')
  assert(layout.includes('blur(3px)'), 'backdrop blur frozen')
})

run('L. commercial/travel modules untouched in wedding actions', () => {
  const travelModal = read('src/features/weddings/detail/travel-fee/TravelFeeResolveModal.tsx')
  assert(!travelModal.includes('effectiveTravel'), 'no commercial calc in modal file')
  assert(travelModal.includes('TravelFeeResolveModal'), 'travel modal exists')
})

console.log('\nWedding Dark Phase 2A acceptance done.')
