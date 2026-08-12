/**
 * Production contract PDF (Cloudmersive) — offline acceptance (no live provider).
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  CLOUDMERSIVE_DOCX_TO_PDF_URL,
  CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
  assertWithinCloudmersiveFreeTierSize,
  buildCloudmersiveAuthHeaders,
  convertDocxViaCloudmersive,
  mapCloudmersiveHttpError,
  ContractPdfError,
  contractPdfErrorUserMessage,
  mapContractPdfErrorForUser,
} from '@/features/documents/pdf/docxToPdf'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL contract-pdf-production — ${msg}`)
}

// --- Edge Function exists and uses Cloudmersive + PRO ---
const edge = read('supabase/functions/contract-docx-to-pdf/index.ts')
assert(edge.includes('CLOUDMERSIVE_API_KEY'), 'edge secret')
assert(edge.includes('account_has_pro_access'), 'PRO gate')
assert(edge.includes('convertDocxViaCloudmersive'), 'uses cloudmersive convert')
assert(edge.includes('CONTRACT_PDF_FILE_TOO_LARGE'), 'size error')
assert(edge.includes('CONTRACT_PDF_LIMIT_REACHED') || edge.includes('fail('), 'error model')
assert(!edge.includes('GOTENBERG'), 'edge no gotenberg')
assert(!/\b127\.0\.0\.1\b/.test(edge), 'edge no 127.0.0.1')
assert(!/GOTENBERG_URL|VITE_LOCAL_PDF/.test(edge), 'edge no local pdf env')
assert(
  edge.includes('Does NOT use Gotenberg') || edge.includes('no automatic retry'),
  'documents no gotenberg / no retry',
)

// --- Client adapter: production path ---
const adapter = read('src/features/documents/pdf/contractPdfAdapter.ts')
assert(adapter.includes("functions.invoke('contract-docx-to-pdf'"), 'invokes contract-docx-to-pdf')
assert(!adapter.includes('VITE_CLOUDMERSIVE'), 'no vite key')
assert(!adapter.includes('import.meta.env'), 'no vite env access')
assert(!/Deno\.env|process\.env\.CLOUDMERSIVE/.test(adapter), 'no server key access')
assert(!/\b127\.0\.0\.1\b/.test(adapter), 'no 127.0.0.1')
assert(!/getLocalPdfFunctionUrl|resolvePdfExportTransport/.test(adapter), 'no local transport helpers')
assert(!/createGotenbergPdfAdapter|gotenbergPdfAdapter/.test(adapter), 'no gotenberg adapter')
assert(adapter.includes('CLOUDMERSIVE_FREE_TIER_MAX_BYTES'), 'client size guard')
assert(adapter.includes('Never calls Cloudmersive from the browser'), 'documents browser boundary')

// --- Customer UI ---
const ready = read('src/features/documents/contract-experience/ContractReadyPreview.tsx')
assert(ready.includes('ContractPdfActions'), 'ready uses production PDF actions')
assert(!ready.includes('ExperimentalPdfActions'), 'ready no experimental PDF')
assert(ready.includes('Pobierz DOCX'), 'DOCX download unchanged')

const pdfUi = read('src/features/documents/contract-experience/ContractPdfActions.tsx')
assert(pdfUi.includes('Pobierz PDF'), 'PDF button label')
assert(pdfUi.includes('convertContractDocxToPdf'), 'uses production convert')
assert(pdfUi.includes('inFlightRef'), 'double-request guard')
assert(pdfUi.includes('if (inFlightRef.current || busy) return'), 'busy guard')
assert(pdfUi.includes('requirePro'), 'client PRO gate')
assert(pdfUi.includes('generate_contract_pdf'), 'pro action key')
assert(pdfUi.includes('disabled={busy || !props.docxBytes}'), 'disabled while busy')
assert(!pdfUi.includes('createGotenbergPdfAdapter'), 'no gotenberg adapter')

// --- DOCX generation unchanged ---
assert(
  existsSync(join(ROOT, 'src/features/documents/template/WeddingSparseContractGenerationService.ts')),
  'sparse DOCX generation kept',
)
assert(
  read('src/features/documents/template/ContractExportService.ts').includes('generateDocx'),
  'generateDocx kept',
)

// --- Auth header / endpoint / bytes / size / errors / no retry (canonical convert) ---
const headers = buildCloudmersiveAuthHeaders('unit-test-key')
assert(headers.Apikey === 'unit-test-key', 'Apikey')

const fakeDocx = new TextEncoder().encode('PK-fake-final-docx')
let fetchCalls = 0
let seenBytes: Uint8Array | null = null
const fakePdf = new TextEncoder().encode('%PDF-1.4 production-mock')
await convertDocxViaCloudmersive({
  docxBytes: fakeDocx,
  filename: 'umowa.docx',
  config: { apiKey: 'k', maxInputBytes: 1_000_000 },
  fetchImpl: async (url, init) => {
    fetchCalls += 1
    assert(String(url) === CLOUDMERSIVE_DOCX_TO_PDF_URL, 'endpoint')
    const file = (init?.body as FormData).get('inputFile') as File
    seenBytes = new Uint8Array(await file.arrayBuffer())
    return new Response(fakePdf, { status: 200, headers: { 'Content-Type': 'application/pdf' } })
  },
})
assert(fetchCalls === 1, 'one provider call')
{
  const uploaded = seenBytes as Uint8Array | null
  assert(uploaded != null, 'bytes captured')
  assert(
    uploaded!.byteLength === fakeDocx.byteLength &&
      uploaded!.every((b: number, i: number) => b === fakeDocx[i]),
    'final DOCX bytes unchanged',
  )
}

let sizeFetch = 0
try {
  assertWithinCloudmersiveFreeTierSize(CLOUDMERSIVE_FREE_TIER_MAX_BYTES + 1)
  assert(false, 'size guard')
} catch (e) {
  assert(e instanceof ContractPdfError && e.code === 'CONTRACT_PDF_FILE_TOO_LARGE', 'size code')
}
try {
  await convertDocxViaCloudmersive({
    docxBytes: new Uint8Array(CLOUDMERSIVE_FREE_TIER_MAX_BYTES + 5),
    filename: 'big.docx',
    config: { apiKey: 'k' },
    fetchImpl: async () => {
      sizeFetch += 1
      return new Response('%PDF-', { status: 200 })
    },
  })
  assert(false, 'oversized must not call')
} catch (e) {
  assert(e instanceof ContractPdfError && e.code === 'CONTRACT_PDF_FILE_TOO_LARGE', 'oversized')
  assert(sizeFetch === 0, 'no provider call when too large')
}

assert(mapCloudmersiveHttpError({ status: 429 }).code === 'CONTRACT_PDF_LIMIT_REACHED', '429')
assert(mapCloudmersiveHttpError({ status: 503 }).code === 'CONTRACT_PDF_PROVIDER_UNAVAILABLE', '503')
assert(mapCloudmersiveHttpError({ status: 504 }).code === 'CONTRACT_PDF_TIMEOUT', '504')
assert(
  contractPdfErrorUserMessage('CONTRACT_PDF_FILE_TOO_LARGE').includes('zbyt duży'),
  'file too large UX',
)
assert(
  mapContractPdfErrorForUser('CONTRACT_PDF_PRO_REQUIRED').includes('PRO'),
  'pro UX',
)
assert(
  !mapContractPdfErrorForUser('Cloudmersive HTTP 500').toLowerCase().includes('cloudmersive'),
  'no brand leak',
)

// --- Env / docs ---
const env = read('.env.example')
assert(env.includes('CLOUDMERSIVE_API_KEY'), 'env cloudmersive')
assert(!/^VITE_CLOUDMERSIVE_API_KEY=/m.test(env), 'no vite assignment')
assert(env.includes('contract-docx-to-pdf') || env.includes('PRODUCTION'), 'production noted')

const docs = read('docs/pdf-rendering.md')
assert(docs.includes('contract-docx-to-pdf'), 'docs edge name')
assert(docs.includes('Cloudmersive'), 'docs provider')
assert(docs.includes('account_has_pro_access') || docs.includes('PRO'), 'docs PRO')

// --- Brief PDFShift unchanged ---
const brief = read('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts')
assert(brief.includes('renderProductionHtmlToPdf'), 'brief still production')
assert(brief.includes("documentType: 'brief'"), 'brief type')
assert(!brief.includes('contract-docx-to-pdf'), 'brief not contract path')
assert(!brief.includes('CLOUDMERSIVE'), 'brief no cloudmersive')

const pdfRender = read('supabase/functions/pdf-render/index.ts')
assert(pdfRender.includes('PDFSHIFT_API_KEY'), 'brief edge still pdfshift')

// --- Lab Gotenberg remains non-production ---
const experimental = read(
  'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
)
assert(experimental.includes('createGotenbergPdfAdapter'), 'lab still gotenberg')
assert(experimental.includes('Lab-only') || experimental.includes('experimental'), 'lab labeled')

const gotenbergEdge = read('supabase/functions/docx-to-pdf/index.ts')
assert(gotenbergEdge.includes('convertDocxViaGotenberg'), 'lab edge kept')

console.log('OK contract-pdf-production acceptance')
