/**
 * Template Detail Modernization V1 — Packages continuity, no technical copy.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/templateDetailModernizationAcceptance.test.ts
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
const css = source('src/features/documents/DocumentsTemplates.module.css')
const quarantine = source(
  'src/features/documents/template/templateLegacyAiQuarantineAcceptance.test.ts',
)

run('no Typ metadata', () => {
  assert(!detail.includes('>Typ<'), 'no Typ label')
  assert(!detail.includes("factLabel}>Typ"), 'no Typ fact')
  assert(
    !detail.includes('templateServiceTypeLabel'),
    'type label helper unused on detail',
  )
})

run('no technical / AI copy', () => {
  assert(!detail.includes('artefakt'), 'no artefakty')
  assert(!detail.includes('instancj'), 'no instances')
  assert(!detail.includes('Uruchom analizę'), 'no AI CTA')
  assert(!detail.includes('Analizowanie'), 'no analyzing')
  assert(!detail.includes('/analiza'), 'no analiza route')
  assert(
    detail.includes('Umowy utworzone na podstawie tego szablonu.'),
    'product history support',
  )
  assert(
    detail.includes(
      'Nie wygenerowano jeszcze żadnej umowy z tego szablonu.',
    ),
    'product empty state',
  )
})

run('metadata + count', () => {
  assert(detail.includes('>Dodano<') || detail.includes('Dodano</'), 'Dodano')
  assert(detail.includes('Wygenerowano'), 'Wygenerowano label')
  assert(
    detail.includes('formatGeneratedContractsCount'),
    'pluralized count helper',
  )
  assert(detail.includes('1 umowę'), 'singular form')
  assert(detail.includes('umów'), 'plural form')
  assert(detail.includes('template-generated-count'), 'count testid')
  assert(detail.includes('zaktualizowano'), 'updated in header meta')
})

run('history + replace + delete preserved', () => {
  assert(detail.includes('template-generated-history'), 'history section')
  assert(detail.includes('Wygenerowane umowy'), 'history heading')
  assert(detail.includes('template-replace-docx'), 'replace action')
  assert(detail.includes('DeleteContractModal'), 'typed delete')
  assert(detail.includes('template-detail-delete-trigger'), 'delete trigger')
  assert(detail.includes('splitGeneratedTitle'), 'title hierarchy split')
})

run('Packages-adjacent presentation', () => {
  assert(css.includes('.templateDetailPage'), 'detail page scope')
  assert(css.includes('.historySection'), 'history section styles')
  assert(css.includes('.historyEmpty'), 'compact empty')
  assert(css.includes('repeat(3, minmax(0, 1fr))'), 'desktop 3-col')
  assert(quarantine.includes('template-detail-v1'), 'quarantine suite intact')
})

if (failed > 0) {
  console.error(`\n${failed} check(s) failed`)
  process.exit(1)
}

console.log('\nOK template detail modernization V1')
