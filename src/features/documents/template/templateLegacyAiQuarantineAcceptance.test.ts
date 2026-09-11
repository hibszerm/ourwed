/**
 * Template Legacy AI Quarantine V1 — product UI must not expose old analysis.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/templateLegacyAiQuarantineAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

let failed = 0

function run(name: string, fn: () => void) {
  try {
    fn()
    console.log(`PASS  ${name}`)
  } catch (err) {
    failed += 1
    console.error(`FAIL  ${name}`)
    console.error(err instanceof Error ? err.message : err)
  }
}

const detail = source('src/pages/DocumentTemplateDetailPage.tsx')
const list = source('src/pages/DocumentTemplatesPage.tsx')
const mapping = source('src/pages/DocumentTemplateMappingPage.tsx')
const packageSection = source(
  'src/features/studio/PackageContractSection.tsx',
)
const contractUi = source('src/features/documents/contractUi.ts')
const deleteModal = source(
  'src/features/documents/components/DeleteContractModal.tsx',
)
const sparseGen = source(
  'src/features/documents/template/WeddingSparseContractGenerationService.ts',
)
const router = source('src/routes/router.tsx')

run('1. slim detail has no legacy AI CTA or readiness narrative', () => {
  assert(detail.includes('template-detail-v1'), 'v1 surface marker')
  assert(!detail.includes('Uruchom analizę'), 'no Uruchom analizę')
  assert(!detail.includes('Analizowanie'), 'no Analizowanie copy')
  assert(!detail.includes('ContractStatusBadge'), 'no analysis status badge')
  assert(
    !detail.includes('ensureAutomaticTemplateConfiguration'),
    'no heal query',
  )
  assert(!detail.includes('Gotowość'), 'no readiness section')
  assert(
    !detail.includes("'/analiza'") &&
      !detail.includes('"/analiza"') &&
      !detail.includes('`/analiza') &&
      !detail.includes('/analiza`'),
    'no analiza navigation',
  )
  assert(
    detail.includes('Umowy utworzone na podstawie tego szablonu.') ||
      detail.includes('template-generated-history'),
    'history kept',
  )
  assert(detail.includes('Wygenerowane umowy'), 'history title')
  assert(!detail.includes('artefakt'), 'no technical artefacts copy')
  assert(!detail.includes('>Typ<'), 'no Typ metadata')
  assert(detail.includes('Zamień źródłowy DOCX'), 'replace kept')
  assert(detail.includes('DeleteContractModal'), 'typed delete kept')
  assert(detail.includes('template-detail-delete-trigger'), 'delete entry')
})

run('2. replace DOCX stays on detail — no /analiza redirect', () => {
  assert(
    detail.includes('Źródłowy dokument został zamieniony.'),
    'replace success toast without analysis',
  )
  assert(
    !detail.includes('Uruchamiamy analizę'),
    'no analysis toast on replace',
  )
  assert(
    !detail.includes('navigate(`/ustawienia/dokumenty/szablony/${doc.id}/analiza`)'),
    'detail replace does not navigate to analiza',
  )
  assert(
    !list.includes('/analiza'),
    'list page does not navigate to analiza',
  )
  assert(
    list.includes('Źródłowy dokument został zamieniony.'),
    'list replace toast without analysis',
  )
  assert(!list.includes('onReanalyze'), 'list does not wire reanalyze')
  assert(!list.includes('reanalyzeTemplate'), 'list does not import reanalyze')
})

run('3. sparse templates not shown as Analizowanie', () => {
  assert(
    contractUi.includes('sparseTemplateOnly'),
    'status respects sparse flag',
  )
  assert(
    contractUi.includes("return 'ready'"),
    'sparse maps to ready',
  )
})

run('4. /analiza route quarantined — redirect to detail', () => {
  assert(
    router.includes("path: '/ustawienia/dokumenty/szablony/:id/analiza'"),
    'route path still registered',
  )
  assert(
    mapping.includes('Navigate'),
    'mapping page redirects',
  )
  assert(
    mapping.includes('`/ustawienia/dokumenty/szablony/${id}`'),
    'redirects to detail',
  )
  assert(
    !mapping.includes("from '@/features/documents/import/SimpleContractImportFlow'"),
    'wizard not mounted on route',
  )
  assert(
    !packageSection.includes('/analiza'),
    'packages UI does not link analiza',
  )
})

run('5. delete + detach safety frozen', () => {
  assert(
    deleteModal.includes("TEMPLATE_DELETE_PHRASE = 'USUŃ'"),
    'typed USUŃ',
  )
  assert(packageSection.includes('Odepnij szablon'), 'detach label')
  assert(
    packageSection.includes('package-template-detach-confirm'),
    'detach confirm',
  )
})

run('6. sparse generation wiring untouched', () => {
  assert(
    sparseGen.includes('runSparseProductTransform') ||
      sparseGen.includes('generate'),
    'sparse service present',
  )
  assert(
    source('src/features/documents/template/packageContractTemplateUpload.ts').includes(
      'sparseTemplateOnly: true',
    ),
    'package upload still sparse-only',
  )
})

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nOK template legacy AI quarantine V1')
