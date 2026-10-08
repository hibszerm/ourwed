/**
 * Current contract product-path and shared template-upload verification.
 * Run: npm run test:sparse-wedding-contracts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectPaymentSchedule } from './payment-schedule/detectPaymentSchedule'
import { evaluatePaymentSchedulePolicy } from './payment-schedule/paymentSchedulePolicy'

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message)
}

function source(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8')
}

const page = source('src/pages/WeddingContractGenerationPage.tsx')
const upload = source(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
const packageUi = source('src/features/studio/PackageContractSection.tsx')
const preview = source(
  'src/features/documents/contract-experience/ContractDocxPreview.tsx',
)

// Current generation stays on the authenticated Option B boundary.
assert(page.includes('startContractGeneration'), 'generation starts through Option B')
assert(page.includes('continueContractGeneration'), 'MissingInput uses Option B continuation')
assert(page.includes('finalizeContractGeneration'), 'transaction cleanup uses Option B finalization')
assert(page.includes('downloadAcceptedContractCandidate'), 'preview uses the accepted candidate')
assert(page.includes('saveGeneratedContract'), 'saving remains explicit')
assert(!page.includes('isSparseWeddingContractGenerationEnabled'), 'production route is not gated by the retired sparse flag')
assert(!page.includes('WeddingSparseContractGenerationService'), 'production page does not reference the retired bridge')
assert(!page.includes('WeddingContractGenerationService'), 'production page does not call the retired generator')
assert(!page.includes('runSparseProductTransform'), 'production page does not call the historical transform runner')
assert(!page.includes('SemanticContractGenerationService'), 'production page does not call historical semantic generation')

// Package template management remains a lightweight DOCX upload flow.
assert(upload.includes('extractDocxDocumentModel'), 'upload validates DOCX structure')
assert(upload.includes('linkContractTemplate'), 'upload links the template to its package')
assert(!upload.includes('activeAiDocumentAnalyzer'), 'upload does not run AI analysis')
assert(!upload.includes('buildSlotsFromAnalysis'), 'upload does not build generated slot bindings')
assert(packageUi.includes('uploadPackageContractTemplate'), 'package UI uses the upload flow')
assert(!packageUi.includes('assignPackageContractFromDocx'), 'package UI does not invoke retired AI assignment')
assert(!packageUi.includes('PackageHealthSummary'), 'package UI retains the current template-only surface')

// Preserve the shared payment-schedule detector's offline behavior.
const paragraphs = [
  { index: 0, text: 'Zadatek: 1000 zł' },
  { index: 1, text: 'II rata: 2000 zł' },
  { index: 2, text: 'III rata: 2000 zł' },
]
const detected = detectPaymentSchedule({
  slots: [],
  paragraphs,
  finances: {
    totalContractAmount: 5000,
    depositAmount: 1000,
    remainingAmount: 4000,
  },
})
const policy = evaluatePaymentSchedulePolicy(detected, {
  totalContractAmount: 5000,
  depositAmount: 1000,
  remainingAmount: 4000,
})
assert(
  policy.requiresManualCompletion || detected.entries.length >= 2,
  'multi-installment schedules remain detectable without slots',
)
assert(!page.includes('PaymentScheduleCompletionForm'), 'browser does not reconstruct payment schedules')

// Existing preview and production PDF boundaries remain intact.
assert(page.includes('ContractReadyPreview'), 'accepted preview remains present')
assert(preview.includes('docx-preview') || preview.includes('renderAsync'), 'DOCX preview renderer remains available')
assert(
  source('src/features/documents/contract-experience/ContractReadyPreview.tsx').includes(
    'ContractPdfActions',
  ),
  'production PDF actions remain available',
)
assert(
  source('src/features/documents/pdf/contractPdfAdapter.ts').includes('contract-docx-to-pdf'),
  'PDF export still uses its production Edge function',
)
assert(
  !existsSync(resolve(process.cwd(), 'src/features/documents/template/gotenbergPdfAdapter.ts')),
  'experimental Gotenberg client adapter remains absent',
)

console.log('ok — authenticated Option B route and shared template/PDF boundaries')
