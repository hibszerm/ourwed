/**
 * Generated contract preview — edit CTA hidden (product decision).
 * Browser variable editor may return later; infrastructure stays in services.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/generatedContractEditAcceptance.test.ts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

const preview = source('src/pages/WeddingContractPreviewPage.tsx')
const css = source('src/pages/WeddingContractPreviewPage.module.css')
const ready = source(
  'src/features/documents/contract-experience/ContractReadyPreview.tsx',
)

assert(!preview.includes('Edytuj dane umowy'), 'no edit-contract-data CTA')
assert(!preview.includes('startEditing'), 'no startEditing entry point')
assert(!preview.includes('stickyActions'), 'no sticky edit CTA markup')
assert(!css.includes('stickyActions'), 'no sticky edit CTA CSS')
assert(!css.includes('padding-bottom: 7rem'), 'no CTA-reserved desktop padding')
assert(
  !css.includes('5.75rem + var(--safe-bottom)'),
  'no CTA-reserved mobile bottom spacing',
)

assert(preview.includes('ContractReadyPreview'), 'preview remains')
assert(
  preview.includes("download('docx')") || preview.includes('onDownloadDocx'),
  'DOCX download wired',
)
assert(preview.includes("navigate(`/sluby/${wedding.id}/umowy/nowa`)"), 'regenerate returns to the production generation route')
assert(preview.includes('chrome="document"'), 'document chrome — shell owns actions')
assert(ready.includes('Pobierz DOCX'), 'DOCX label')
assert(
  ready.includes('ContractPdfActions') || ready.includes('Pobierz PDF'),
  'PDF actions available',
)
assert(ready.includes('Wygeneruj ponownie'), 'regenerate label')

assert(
  !existsSync(
    resolve(
      process.cwd(),
      'src/features/documents/template/WeddingContractGenerationService.ts',
    ),
  ),
  'retired legacy generator service stays absent',
)

console.log('ok — generated contract edit CTA hidden')
