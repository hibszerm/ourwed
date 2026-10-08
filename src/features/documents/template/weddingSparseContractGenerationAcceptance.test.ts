/**
 * Current contract product-path acceptance.
 * Keeps the authenticated Option B route and package-template upload boundary explicit.
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const page = source('src/pages/WeddingContractGenerationPage.tsx')
const boundaryClient = source(
  'src/features/contract-generation-spike/contractGenerationBoundaryClient.ts',
)
const upload = source(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
const packageUi = source('src/features/studio/PackageContractSection.tsx')
const sidebar = source('src/layouts/Sidebar.tsx')
const router = source('src/routes/router.tsx')

assert(page.includes('startContractGeneration'), 'generation page starts through Option B')
assert(page.includes('continueContractGeneration'), 'MissingInput continues through Option B')
assert(page.includes('finalizeContractGeneration'), 'Option B transaction finalizes through its boundary')
assert(page.includes('downloadAcceptedContractCandidate'), 'accepted candidate feeds preview')
assert(page.includes('saveGeneratedContract'), 'document persistence remains explicit')
assert(boundaryClient.includes("'contract-generation-boundary'"), 'client targets the authenticated Edge boundary')
assert(!page.includes('WeddingSparseContractGenerationService'), 'page has no sparse application bridge')
assert(!page.includes('WeddingContractGenerationService'), 'page has no retired generator')
assert(!page.includes('runSparseProductTransform'), 'page does not invoke historical transform runner')
assert(!page.includes('SemanticContractGenerationService'), 'page does not invoke historical semantic generation')

assert(upload.includes('uploadPackageContractTemplate'), 'package template upload remains available')
assert(upload.includes('extractDocxDocumentModel'), 'upload validates DOCX structure')
assert(upload.includes('linkContractTemplate'), 'upload links the template to its package')
assert(!upload.includes('activeAiDocumentAnalyzer'), 'upload does not start AI analysis')
assert(!upload.includes('buildSlotsFromAnalysis'), 'upload does not build generated slot bindings')
assert(packageUi.includes('uploadPackageContractTemplate'), 'package UI uses the lightweight upload')
assert(!packageUi.includes('assignPackageContractFromDocx'), 'package UI does not invoke retired AI assignment')
assert(!packageUi.includes('PackageHealthSummary'), 'package UI keeps its current template-only surface')

assert(!sidebar.includes('Eksperymentalne'), 'experimental navigation stays hidden from customers')
assert(!sidebar.includes('Laboratorium porównania umów'), 'comparison lab stays out of the customer sidebar')
assert(!router.includes('/eksperymenty/umowy-ai-transform'), 'comparison lab SPA route stays absent')
assert(!router.includes('/laboratorium-umow-ai'), 'legacy lab SPA routes stay absent')

console.log('ok — current contract product path uses authenticated Option B')
