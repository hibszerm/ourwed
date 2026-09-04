/**
 * Phase 2E — Documents/Templates + Contract Experience Dark compatibility.
 * Run: npm run test:documents-dark
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

const LIGHT_ONLY = [
  '#ecfdf3',
  '#fef3c7',
  '#fee2e2',
  'rgba(17, 17, 17',
  'rgb(0 0 0 /',
]

const CHROME_CSS_FILES = [
  'src/features/documents/DocumentsTemplates.module.css',
  'src/features/documents/contract-experience/ContractExperience.module.css',
  'src/features/documents/contract-experience/ContractPdfActions.module.css',
  'src/features/documents/contract-experience/PaymentScheduleCompletionForm.module.css',
  'src/features/documents/import/SimpleContractImport.module.css',
  'src/features/documents/import/ImportWizardStepper.module.css',
  'src/features/documents/import/ContractReview.module.css',
  'src/pages/DocumentTemplateNewPage.module.css',
]

function scanChromeCss() {
  const hits: string[] = []

  for (const file of CHROME_CSS_FILES) {
    const css = read(file)
    for (const token of LIGHT_ONLY) {
      if (css.includes(token)) hits.push(`${file}: ${token}`)
    }
    if (css.includes('filter: invert')) hits.push(`${file}: filter invert`)
    if (/\bbackground:\s*#fff\b/.test(css)) hits.push(`${file}: raw #fff background`)
  }
  return hits
}

run('A. documents chrome avoids light-only modal/upload hardcodes', () => {
  const hits = scanChromeCss()
  assert(hits.length === 0, hits.join('\n'))
})

run('B. paper/document artifact classes documented', () => {
  const docx = read('src/features/documents/contract-experience/ContractDocxPreview.module.css')
  assert(docx.includes('Document artifact'), 'docx comment')
  assert(docx.includes('section.docx'), 'docx section')
  assert(docx.includes('background: #fff'), 'docx paper white')
  const wedding = read('src/features/weddings/actions/ContractDocumentPreview.module.css')
  assert(wedding.includes('.page {'), 'wedding paper')
  assert(wedding.includes('background: #fff'), 'wedding paper white')
})

run('C. ContractExperience uses semantic chrome tokens', () => {
  const css = read('src/features/documents/contract-experience/ContractExperience.module.css')
  assert(css.includes('--cx-shadow: var(--shadow-md)'), 'shadow token')
  assert(css.includes('var(--color-overlay)'), 'overlay')
  assert(css.includes('var(--surface-primary)'), 'modal surface')
  assert(!css.includes('rgba(255, 255, 255'), 'no white inset')
})

run('D. Light baseline unchanged', () => {
  const baselineRecord = lightBaseline as Record<string, Record<string, string>>
  for (const id of THEME_IDS) {
    const current = resolveThemeCssVariables(id, 'light')
    const baseline = baselineRecord[id]
    for (const key of Object.keys(baseline)) {
      assert(current[key] === baseline[key], `${id} ${key}`)
    }
  }
})

run('E. all five Dark themes resolve complete token sets', () => {
  for (const id of THEME_IDS) {
    const dark = resolveThemeCssVariables(id, 'dark')
    assert(Boolean(dark['--surface-primary']), `${id} surface`)
    assert(Boolean(dark['--color-overlay']), `${id} overlay`)
  }
})

run('F. document preview paper remains white', () => {
  const files = [
    'src/features/documents/contract-experience/ContractDocxPreview.module.css',
    'src/features/documents/contract-experience/ContractReadyPreview.module.css',
    'src/features/documents/contract-experience/ExperimentalPdfActions.module.css',
    'src/features/weddings/actions/ContractDocumentPreview.module.css',
  ]
  for (const f of files) {
    const css = read(f)
    assert(css.includes('#fff') || css.includes('white'), `${f} paper`)
    assert(!css.includes('filter: invert'), `${f} no invert`)
  }
})

run('G. public Light isolation intact', () => {
  const pub = read('src/features/theme/usePublicThemeIsolation.ts')
  assert(pub.includes("applyAppearanceToDocument('light')"), 'public light')
})

run('H. package template binding untouched', () => {
  const binding = read('src/features/documents/template/packageContractAssignment.ts')
  assert(binding.includes('packageContractMode'), 'binding mode')
})

run('I. wedding contract preview chrome semantic', () => {
  const css = read('src/features/weddings/actions/ContractDocumentPreview.module.css')
  assert(css.includes('var(--color-surface)'), 'toolbar surface')
  assert(css.includes('var(--app-background-subtle)'), 'workspace')
})

run('J. no per-theme dark selector matrix in documents CSS', () => {
  const css =
    read('src/features/documents/DocumentsTemplates.module.css') +
    read('src/features/documents/contract-experience/ContractExperience.module.css')
  assert(!css.includes("[data-theme='"), 'no theme selectors')
  assert(!css.includes("[data-appearance='dark']"), 'no local dark selectors')
})

run('K. mobile navigation V1.8.1 frozen', () => {
  const sidebar = read('src/layouts/Sidebar.module.css')
  assert(sidebar.includes('width: min(74vw, 292px)'), 'drawer width')
  assert(sidebar.includes('280ms cubic-bezier(0.22, 1, 0.36, 1)'), 'motion')
})

run('L. documents surfaces inherit root appearance', () => {
  const detail = read('src/pages/DocumentTemplateDetailPage.tsx')
  const mapping = read('src/pages/DocumentTemplateMappingPage.tsx')
  assert(!detail.includes('data-appearance='), 'detail page')
  assert(!mapping.includes('data-appearance='), 'mapping page')
})

console.log('\nDocuments Dark Phase 2E acceptance done.')
