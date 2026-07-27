/**
 * Production DOCX preview acceptance (docx-preview, no Graph, no React paragraphs).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/contract-experience/contractDocxPreviewAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

const preview = source(
  'src/features/documents/contract-experience/ContractDocxPreview.tsx',
)
const ready = source(
  'src/features/documents/contract-experience/ContractReadyPreview.tsx',
)
const gen = source('src/pages/WeddingContractGenerationPage.tsx')
const saved = source('src/pages/WeddingContractPreviewPage.tsx')
const flags = source(
  'src/features/documents/template/experimentalPdfFlags.ts',
)
const env = source('.env.example')

assert(preview.includes("from 'docx-preview'"), 'uses docx-preview')
assert(preview.includes('renderAsync'), 'calls renderAsync')
assert(preview.includes('host.replaceChildren()'), 'clears DOM before rerender')
assert(
  source(
    'src/features/documents/contract-experience/docxPreviewOptions.ts',
  ).includes('DOCX_PREVIEW_OPTIONS'),
  'shared options',
)
assert(
  source(
    'src/features/documents/contract-experience/docxPreviewOptions.ts',
  ).includes('ignoreLastRenderedPageBreak: false'),
  'page-break option set',
)

assert(ready.includes('Umowa jest gotowa'), 'ready heading')
assert(ready.includes('Podgląd dokumentu'), 'preview label')
assert(ready.includes('Pobierz DOCX'), 'docx download')
assert(
  ready.includes('nieznacznie różnić się od wyglądu dokumentu'),
  'subtle note',
)
assert(!ready.includes('identyczny jak Word'), 'no identical-to-word claim')
assert(!ready.includes('100%'), 'no 100% claim')

assert(gen.includes('ContractDocxPreview'), 'generation uses docx preview')
assert(gen.includes('ContractReadyPreview'), 'saved uses ready preview')
assert(
  !gen.includes('ContractDocumentPreview'),
  'react paragraph preview not in production generation',
)
assert(!gen.includes('ContractPdfPreview'), 'old pdf preview removed')
assert(!saved.includes('Uproszczony podgląd DOCX'), 'no paragraph paper preview')
assert(saved.includes('ContractReadyPreview'), 'preview page ready component')

assert(flags.includes('VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT'), 'pdf flag')
const pdfActions = source(
  'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
)
assert(
  pdfActions.includes('isExperimentalPdfExportEnabled'),
  'pdf UI gated by flag',
)
assert(pdfActions.includes('Utwórz testowy PDF'), 'explicit pdf action')
assert(pdfActions.includes('Testowy PDF') || ready.includes('ExperimentalPdfActions'), 'experimental label')
assert(ready.includes('ExperimentalPdfActions'), 'ready uses shared pdf actions')
assert(
  source(
    'src/features/ai-contract-transform/TransformComparisonPage.tsx',
  ).includes('ExperimentalPdfActions'),
  'transform lab wires experimental pdf',
)
assert(
  source(
    'src/features/ai-contract-transform/TransformComparisonPage.tsx',
  ).includes('modeDocxBytes'),
  'lab uses stored final docx bytes',
)
assert(
  !env.includes('MICROSOFT_GRAPH_'),
  'microsoft graph env gone',
)
assert(env.includes('GOTENBERG_URL'), 'gotenberg documented')
assert(env.includes('VITE_ENABLE_EXPERIMENTAL_PDF_EXPORT'), 'flag documented')

// PDF must not rerun AI
assert(pdfActions.includes('createGotenbergPdfAdapter'), 'shared adapter')
assert(!ready.includes('WeddingContractGenerationService'), 'no AI on pdf')
assert(!pdfActions.includes('runFullAiRewrite'), 'no AI rewrite in pdf')

console.log('ok — contract DOCX preview acceptance')
