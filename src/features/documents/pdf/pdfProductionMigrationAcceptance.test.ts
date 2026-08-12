/**
 * Production PDF migration acceptance — no live PDFShift.
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  mapPdfRenderErrorForUser,
  PDF_RENDER_LIMIT_REACHED_MESSAGE,
  PDF_RENDER_PRO_REQUIRED_MESSAGE,
} from '@/features/documents/pdf/pdfRenderErrors'
import { resolvePdfRendererProvider } from '@/features/documents/pdf/pdfRenderer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL pdf-production — ${msg}`)
}

// Provider default is pdfShift; local only when explicit
assert(resolvePdfRendererProvider(undefined) === 'pdfShift', 'default pdfshift')
assert(resolvePdfRendererProvider('pdfshift') === 'pdfShift', 'pdfshift')
assert(resolvePdfRendererProvider('local') === 'localDocker', 'explicit local')

// Brief production path → pdf-render, not html-to-pdf / localhost
const briefConvert = read('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts')
assert(briefConvert.includes('renderProductionHtmlToPdf'), 'brief uses production renderer')
assert(briefConvert.includes("documentType: 'brief'"), 'brief documentType')
assert(!briefConvert.includes('html-to-pdf'), 'brief no html-to-pdf')
assert(!briefConvert.includes('127.0.0.1'), 'brief no localhost')
assert(!briefConvert.includes('getLocalPdfFunctionUrl'), 'brief no local url')
assert(!briefConvert.includes('resolvePdfExportTransport'), 'brief no gotenberg transport')

const prod = read('src/features/documents/pdf/renderProductionPdf.ts')
assert(prod.includes('createPdfShiftEdgeRenderer'), 'prod uses edge renderer')
assert(prod.includes('sandbox: false'), 'prod sandbox false')
assert(prod.includes('PDF_RENDER_LIMIT_REACHED'), 'quota mapping')

const edgeClient = read('src/features/documents/pdf/pdfShiftEdgeRenderer.ts')
assert(edgeClient.includes("functions.invoke('pdf-render'"), 'invokes pdf-render')
assert(edgeClient.includes('sandbox: input.sandbox === true'), 'sandbox opt-in only')
assert(!edgeClient.includes('PDFSHIFT_API_KEY'), 'no key in client')
assert(!edgeClient.includes('VITE_PDFSHIFT'), 'no vite key')

const edgeFn = read('supabase/functions/pdf-render/index.ts')
assert(edgeFn.includes('account_has_pro_access'), 'PRO gate')
assert(edgeFn.includes('PDF_RENDER_ALLOW_SANDBOX'), 'sandbox allowlist')
assert(edgeFn.includes('allowSandbox && body.sandbox === true'), 'sandbox forced off by default')
assert(edgeFn.includes('PDFSHIFT_API_KEY'), 'server key')

// Error UX
assert(
  mapPdfRenderErrorForUser('PDF_RENDER_LIMIT_REACHED: x') ===
    PDF_RENDER_LIMIT_REACHED_MESSAGE,
  'quota UX',
)
assert(
  mapPdfRenderErrorForUser('PDF_RENDER_PRO_REQUIRED: x') ===
    PDF_RENDER_PRO_REQUIRED_MESSAGE,
  'pro UX',
)
assert(
  !mapPdfRenderErrorForUser('PDF_RENDER_FAILED via PDFShift').toLowerCase().includes(
    'pdfshift',
  ),
  'no provider brand leak',
)

// Double-click / busy guards
const briefBtn = read('src/features/wedding-brief/WeddingBriefDownloadButton.tsx')
assert(briefBtn.includes('if (busy) return'), 'brief busy guard')
assert(briefBtn.includes('disabled={busy}'), 'brief disabled while busy')
assert(briefBtn.includes('mapPdfRenderErrorForUser'), 'brief maps errors')

const header = read('src/features/weddings/detail/v2/WeddingHeaderActions.tsx')
assert(header.includes('if (busy) return'), 'header brief busy guard')

// Contract HTML completeness STOP
const docs = read('docs/pdf-rendering.md')
assert(docs.includes('STOPPED'), 'docs stop contract html')
assert(docs.includes('paragraphsToPrintHtml'), 'docs names incomplete renderer')
assert(docs.includes('pdf-render'), 'docs production edge')
assert(docs.includes('sandbox=false') || docs.includes('sandbox: false') || docs.includes('sandbox=false'), 'docs sandbox')

const experimental = read(
  'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
)
assert(experimental.includes('if (busy || !props.docxBytes)'), 'experimental busy guard')
assert(experimental.includes('createGotenbergPdfAdapter'), 'lab still DOCX→Gotenberg')
assert(
  experimental.includes('Lab-only') || experimental.includes('experimental'),
  'lab labeled non-production',
)

const contractReady = read(
  'src/features/documents/contract-experience/ContractReadyPreview.tsx',
)
assert(contractReady.includes('ContractPdfActions'), 'production PDF on ready')
assert(!contractReady.includes('ExperimentalPdfActions'), 'no lab PDF on ready')
assert(
  read('src/features/documents/pdf/contractPdfAdapter.ts').includes(
    'contract-docx-to-pdf',
  ),
  'production uses Cloudmersive Edge',
)

// DOCX generation path still present
assert(
  existsSync(join(ROOT, 'src/features/documents/template/WeddingSparseContractGenerationService.ts')),
  'DOCX generation kept',
)
assert(
  read('src/features/documents/template/ContractExportService.ts').includes('generateDocx'),
  'generateDocx kept',
)

// Production brief must not reference localhost URLs
assert(!/\b127\.0\.0\.1:54322\b/.test(briefConvert), 'no 54322 in brief')
assert(!/\blocalhost:3000\b/.test(briefConvert), 'no :3000 in brief')
assert(!/\blocalhost:54322\b/.test(briefConvert), 'no localhost:54322 in brief')

// Env example
const env = read('.env.example')
assert(env.includes('PDFSHIFT_API_KEY'), 'env pdfshift')
assert(!env.includes('VITE_PDFSHIFT_API_KEY'), 'never vite pdfshift')
assert(env.includes('development') || env.includes('DEV') || env.includes('poc') || env.includes('POC') || env.includes('local'), 'local noted as non-prod')

// paragraphsToPrintHtml must not be the production contract PDF path
assert(
  !briefConvert.includes('paragraphsToPrintHtml'),
  'brief unrelated',
)
const genModal = read('src/features/weddings/actions/GenerateContractModal.tsx')
assert(
  genModal.includes('paragraphsToPrintHtml'),
  'legacy print still exists',
)
assert(
  genModal.includes('Drukuj') || genModal.includes('printHtmlAsPdf') || genModal.includes('print'),
  'legacy is print not pdfshift',
)

console.log('OK pdf-production migration acceptance')
console.log(
  'NOTE: Contract HTML→PDFShift STOPPED — paragraphsToPrintHtml incomplete vs DOCX',
)
