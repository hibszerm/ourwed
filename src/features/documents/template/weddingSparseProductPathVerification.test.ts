/**
 * Architectural + path verification for sparse wedding product generation.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/weddingSparseProductPathVerification.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { detectPaymentSchedule } from './payment-schedule/detectPaymentSchedule'
import { evaluatePaymentSchedulePolicy } from './payment-schedule/paymentSchedulePolicy'
import { isSparseWeddingContractGenerationEnabled } from './sparseWeddingContractFlags'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

const sparseService = source(
  'src/features/documents/template/WeddingSparseContractGenerationService.ts',
)
const page = source('src/pages/WeddingContractGenerationPage.tsx')
const upload = source(
  'src/features/documents/template/packageContractTemplateUpload.ts',
)
const transformService = source(
  'src/features/ai-contract-transform/transformService.ts',
)
const preview = source(
  'src/features/documents/contract-experience/ContractDocxPreview.tsx',
)
const pdfActions = source(
  'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
)
const flags = source(
  'src/features/documents/template/sparseWeddingContractFlags.ts',
)

// --- Engine identity after Mode B review fix ---
assert(
  transformService.includes('export async function runSparseProductTransform'),
  'product runner is runSparseProductTransform',
)
assert(
  transformService.includes("mode: 'full_ai'"),
  'product quality gate uses Mode A / full_ai policy',
)
assert(
  transformService.includes('runFullAiRewrite'),
  'product invokes ai-contract-full-rewrite sparse Edge',
)
assert(
  !sparseService.includes('runGuardedProductTransform'),
  'wedding service must not call Mode B product runner',
)
assert(
  sparseService.includes('runSparseProductTransform'),
  'wedding service uses sparse product runner',
)
assert(
  !sparseService.includes('verifyGuardedTransformation'),
  'wedding path must not inherit Mode B verifier',
)
assert(
  sparseService.includes("engine: 'sparse_full_ai'"),
  'provenance engine sparse_full_ai',
)

// 1. New package template — no AI on upload
assert(!upload.includes('activeAiDocumentAnalyzer'), '1: no AI upload')
assert(upload.includes('extractDocxDocumentModel'), '1: DOCX validate')
assert(upload.includes('linkContractTemplate'), '1: link package')

// 2. Legacy package with slots — ignored
assert(sparseService.includes('slots: []'), '2: payment/slots ignored')
assert(
  !sparseService.includes('parseSlotMap'),
  '2: no slot_map read for generate',
)
assert(
  sparseService.includes('sourceDocxPath'),
  '2: generates from DOCX bytes',
)

// 3. Missing DOCX bytes — hard block
assert(
  sparseService.includes("code: 'source_docx_not_found'"),
  '3: missing DOCX code',
)
assert(
  sparseService.includes('Brak oryginalnego pliku DOCX'),
  '3: missing DOCX message',
)

// 4. Multi-installment — payment dialog path
assert(
  sparseService.includes('detectPaymentSchedule'),
  '4: detects payment schedule',
)
assert(
  sparseService.includes("status: 'manual_input_required'"),
  '4: can require manual payment',
)
assert(page.includes('PaymentScheduleCompletionForm'), '4: payment UI')
assert(page.includes('manual_payment'), '4: manual_payment step')

const multiPara = [
  { index: 0, text: 'Zadatek: 1000 zł' },
  { index: 1, text: 'II rata: 2000 zł' },
  { index: 2, text: 'III rata: 2000 zł' },
]
const detected = detectPaymentSchedule({
  slots: [],
  paragraphs: multiPara,
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
  '4: multi-installment detectable from paragraphs without slots',
)

// Mode A vs Mode B download policy (prove we do not inherit Mode B completeness block)
// Mode A vs Mode B download policy difference is encoded in buildQualityReport
const qualitySrc = source(
  'src/features/ai-contract-transform/quality/buildQualityReport.ts',
)
assert(
  qualitySrc.includes("if (input.mode === 'guarded')"),
  '4b: guarded blocks all blockingIssues',
)
assert(
  qualitySrc.includes('MODE_A_FINANCIAL_BLOCK_CODES'),
  '4b: Mode A only hard-financial blocks',
)
assert(
  transformService.includes("mode: 'full_ai'"),
  '4b: product uses Mode A download policy',
)
assert(
  !sparseService.includes("mode: 'guarded'"),
  '4b: wedding service must not set guarded gate',
)
assert(
  !sparseService.includes('verifyGuardedTransformation'),
  '4b: no Mode B change-classifier verifier on product path',
)

// 5. DOCX preview + download wiring
assert(page.includes('ContractDocxPreview') || page.includes('ContractReadyPreview'), '5: preview')
assert(page.includes('saveGeneratedContract'), '5: persist/download path')
assert(preview.includes('docx-preview') || preview.includes('renderAsync'), '5: docx-preview')

// 6. PDF
assert(
  page.includes('ContractReadyPreview'),
  '6: ready preview surface',
)
assert(
  source('src/features/documents/contract-experience/ContractReadyPreview.tsx').includes(
    'ContractPdfActions',
  ),
  '6: production Cloudmersive PDF actions',
)
assert(
  source('src/features/documents/pdf/contractPdfAdapter.ts').includes('contract-docx-to-pdf'),
  '6: Edge contract-docx-to-pdf',
)
assert(pdfActions.includes('createGotenbergPdfAdapter'), '6: lab Gotenberg adapter kept')

// 7. Rollback flag false → legacy slot path
assert(flags.includes("raw === 'false'"), '7: flag can disable sparse')
assert(page.includes('isSparseWeddingContractGenerationEnabled'), '7: page gated')
assert(
  page.includes('WeddingContractGenerationService.generate'),
  '7: legacy generate still present for rollback',
)
assert(
  page.includes('!useSparseGeneration'),
  '7: verify UI branches on flag',
)

// Default flag behavior (env absent → sparse on)
assert(
  isSparseWeddingContractGenerationEnabled() === true,
  '7b: default sparse enabled unless explicitly false',
)

console.log('ok — weddingSparseProductPathVerification')
console.log(
  'Wedding Generate path: WeddingContractGenerationPage → WeddingSparseContractGenerationService.generate → runSparseProductTransform → runFullAiRewrite (ai-contract-full-rewrite) → sparse changedBlocks → Mode A quality gate → writeTransformedDocx',
)
