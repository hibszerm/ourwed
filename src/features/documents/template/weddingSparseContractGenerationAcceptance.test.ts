/**
 * Sparse wedding contract product-path acceptance.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/weddingSparseContractGenerationAcceptance.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const sparseService = source(
  'src/features/documents/template/WeddingSparseContractGenerationService.ts',
)
const upload = source(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
const page = source('src/pages/WeddingContractGenerationPage.tsx')
const packageUi = source('src/features/studio/PackageContractSection.tsx')
const transformService = source(
  'src/features/ai-contract-transform/transformService.ts',
)
const sidebar = source('src/layouts/Sidebar.tsx')
const flags = source(
  'src/features/documents/template/sparseWeddingContractFlags.ts',
)

assert(
  transformService.includes('export async function runSparseProductTransform'),
  'product Mode A sparse runner exported',
)
assert(
  sparseService.includes('runSparseProductTransform'),
  'sparse service uses product runner',
)
assert(
  sparseService.includes('indexDocxForTransform'),
  'indexes DOCX for transform',
)
assert(
  sparseService.includes('buildContractTransformationDataset'),
  'builds transform dataset',
)
assert(
  sparseService.includes('slots: []'),
  'payment detection ignores legacy slots',
)
assert(
  !sparseService.includes('transformContract('),
  'sparse path must not call slot transformContract',
)
assert(
  !sparseService.includes('runGuardedProductTransform'),
  'must not use Mode B guarded product runner',
)
assert(
  transformService.includes("mode: 'full_ai'"),
  'product gate uses full_ai / Mode A policy',
)
assert(
  upload.includes('uploadPackageContractTemplate'),
  'lightweight upload exists',
)
assert(
  !upload.includes('activeAiDocumentAnalyzer'),
  'upload must not run AI analyzer',
)
assert(
  !upload.includes('buildSlotsFromAnalysis'),
  'upload must not build slots',
)
assert(
  packageUi.includes('uploadPackageContractTemplate'),
  'package UI uses lightweight upload',
)
assert(
  !packageUi.includes('assignPackageContractFromDocx'),
  'package UI retired AI assign',
)
assert(
  !packageUi.includes('PackageHealthSummary'),
  'package UI hides readiness summary',
)
assert(
  page.includes('WeddingSparseContractGenerationService'),
  'generation page wires sparse service',
)
assert(
  page.includes('isSparseWeddingContractGenerationEnabled'),
  'generation page respects flag',
)
assert(sidebar.includes('Eksperymentalne'), 'lab links under experimental group')
assert(
  sidebar.includes('Laboratorium porównania umów'),
  'comparison lab renamed',
)
assert(flags.includes("raw === 'false'"), 'flag can disable sparse path')

console.log('ok — weddingSparseContractGenerationAcceptance')
