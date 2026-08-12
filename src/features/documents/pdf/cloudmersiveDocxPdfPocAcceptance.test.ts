/**
 * Cloudmersive DOCX→PDF POC — offline acceptance (no live Cloudmersive / Gotenberg).
 *
 * Run: npm run test:cloudmersive-docx-poc
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
  createCloudmersiveDocxToPdfProvider,
  createGotenbergDocxToPdfProvider,
  ContractPdfError,
  mapCloudmersiveHttpError,
  contractPdfErrorUserMessage,
} from './docxToPdf/index.ts'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL cloudmersive-docx-poc — ${msg}`)
}

// --- Auth header (official Apikey) ---
const headers = buildCloudmersiveAuthHeaders('test-secret-key-xyz')
assert(headers.Apikey === 'test-secret-key-xyz', 'Apikey header')
assert(!('Authorization' in headers), 'no Bearer auth for Cloudmersive')

// --- Secret never reaches browser / Vite ---
const envExample = read('.env.example')
assert(
  /never\s+VITE_CLOUDMERSIVE/i.test(envExample) || !/^VITE_CLOUDMERSIVE/m.test(envExample),
  'must warn against or omit VITE_CLOUDMERSIVE assignment',
)
assert(!/^VITE_CLOUDMERSIVE_API_KEY=/m.test(envExample), 'no VITE_CLOUDMERSIVE_API_KEY= assignment')
assert(
  envExample.includes('CLOUDMERSIVE_API_KEY'),
  'CLOUDMERSIVE_API_KEY documented server-side',
)
for (const rel of [
  'src/features/documents/template/gotenbergPdfAdapter.ts',
  'src/features/documents/template/ContractExportService.ts',
  'src/routes/router.tsx',
]) {
  if (!existsSync(join(ROOT, rel))) continue
  const src = read(rel)
  assert(!src.includes('CLOUDMERSIVE'), `${rel} must not reference Cloudmersive`)
  assert(!src.includes('VITE_CLOUDMERSIVE'), `${rel} no vite cloudmersive`)
}

// Provider modules must not use VITE_ for the key (canonical Edge implementation)
const convertSrc = read(
  'supabase/functions/contract-docx-to-pdf/cloudmersiveConvert.ts',
)
assert(convertSrc.includes('Apikey'), 'uses Apikey header')
assert(convertSrc.includes('/convert/docx/to/pdf'), 'docx/to/pdf endpoint')
assert(!convertSrc.includes('VITE_CLOUDMERSIVE'), 'no vite key')
assert(
  convertSrc.includes('No automatic retries') && !/\bretry\s*\(/.test(convertSrc),
  'documents no-retry; no retry() helper',
)
const reexport = read('src/features/documents/pdf/docxToPdf/cloudmersiveConvert.ts')
assert(
  reexport.includes('contract-docx-to-pdf/cloudmersiveConvert'),
  'src re-exports canonical Edge convert (single implementation)',
)

// --- Endpoint / request mapping + unchanged DOCX bytes ---
const fakeDocx = new TextEncoder().encode('PK-fake-docx-bytes-for-unit-test')
let seenUrl = ''
let seenApikey = ''
let seenFileBytes: ArrayBuffer | null = null
let seenFileName = ''
let fetchCalls = 0

const fakePdf = new TextEncoder().encode('%PDF-1.4 mock-cloudmersive')
const result = await convertDocxViaCloudmersive({
  docxBytes: fakeDocx,
  filename: 'umowa-final.docx',
  config: { apiKey: 'sk_unit_only', maxInputBytes: 1024 * 1024 },
  fetchImpl: async (url, init) => {
    fetchCalls += 1
    seenUrl = String(url)
    const h = init?.headers as Record<string, string>
    seenApikey = h.Apikey
    const body = init?.body as FormData
    const file = body.get('inputFile') as File
    seenFileName = file.name
    seenFileBytes = await file.arrayBuffer()
    return new Response(fakePdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  },
})

assert(seenUrl === CLOUDMERSIVE_DOCX_TO_PDF_URL, 'official endpoint')
assert(seenApikey === 'sk_unit_only', 'auth header passed')
assert(seenFileName === 'umowa-final.docx', 'filename preserved')
assert(seenFileBytes != null, 'file uploaded')
{
  const uploaded = new Uint8Array(seenFileBytes as ArrayBuffer)
  assert(
    uploaded.byteLength === fakeDocx.byteLength &&
      uploaded.every((b, i) => b === fakeDocx[i]),
    'DOCX bytes unchanged',
  )
}
assert(result.provider === 'cloudmersive', 'provider id')
assert(result.pdfBytes.byteLength === fakePdf.byteLength, 'pdf returned')
assert(fetchCalls === 1, 'exactly one fetch (no automatic retry)')

// Provider factory
const provider = createCloudmersiveDocxToPdfProvider({ apiKey: 'k' })
assert(provider.id === 'cloudmersive', 'factory id')

// --- File-size guard (no API call) ---
let sizeFetch = 0
try {
  assertWithinCloudmersiveFreeTierSize(CLOUDMERSIVE_FREE_TIER_MAX_BYTES + 1)
  assert(false, 'should throw FILE_TOO_LARGE')
} catch (e) {
  assert(e instanceof ContractPdfError && e.code === 'CONTRACT_PDF_FILE_TOO_LARGE', 'size guard code')
}

try {
  await convertDocxViaCloudmersive({
    docxBytes: new Uint8Array(CLOUDMERSIVE_FREE_TIER_MAX_BYTES + 10),
    filename: 'big.docx',
    config: { apiKey: 'k' },
    fetchImpl: async () => {
      sizeFetch += 1
      return new Response('%PDF-', { status: 200 })
    },
  })
  assert(false, 'oversized must fail before fetch')
} catch (e) {
  assert(e instanceof ContractPdfError && e.code === 'CONTRACT_PDF_FILE_TOO_LARGE', 'oversized mapped')
  assert(sizeFetch === 0, 'no API call when too large')
}

assert(CLOUDMERSIVE_FREE_TIER_MAX_BYTES === Math.floor(3.5 * 1024 * 1024), '3.5 MB free tier')

// --- Error mapping (customer-safe codes) ---
assert(mapCloudmersiveHttpError({ status: 429 }).code === 'CONTRACT_PDF_LIMIT_REACHED', '429')
assert(
  mapCloudmersiveHttpError({ status: 403, bodyText: 'no credits' }).code ===
    'CONTRACT_PDF_LIMIT_REACHED',
  '403 credits',
)
assert(mapCloudmersiveHttpError({ status: 503 }).code === 'CONTRACT_PDF_PROVIDER_UNAVAILABLE', '503')
assert(mapCloudmersiveHttpError({ status: 504 }).code === 'CONTRACT_PDF_TIMEOUT', '504')
assert(mapCloudmersiveHttpError({ status: 500 }).code === 'CONTRACT_PDF_CONVERSION_FAILED', '500')
assert(mapCloudmersiveHttpError({ status: 413 }).code === 'CONTRACT_PDF_FILE_TOO_LARGE', '413')

const ux = contractPdfErrorUserMessage('CONTRACT_PDF_CONVERSION_FAILED')
assert(!ux.toLowerCase().includes('cloudmersive'), 'UX hides provider brand')
assert(!ux.toLowerCase().includes('gotenberg'), 'UX hides gotenberg')

// Timeout via AbortError
try {
  await convertDocxViaCloudmersive({
    docxBytes: fakeDocx,
    filename: 'x.docx',
    config: { apiKey: 'k', timeoutMs: 5000, maxInputBytes: 1_000_000 },
    fetchImpl: async (_u, init) => {
      const err = new Error('aborted')
      err.name = 'AbortError'
      // respect abort if signaled
      if (init?.signal?.aborted) throw err
      throw err
    },
  })
  assert(false, 'timeout expected')
} catch (e) {
  assert(e instanceof ContractPdfError && e.code === 'CONTRACT_PDF_TIMEOUT', 'timeout mapped')
}

// --- Gotenberg path unchanged (baseline still LibreOffice convert) ---
const gotenbergSrc = read('supabase/functions/docx-to-pdf/gotenbergConvert.ts')
assert(gotenbergSrc.includes('/forms/libreoffice/convert'), 'Gotenberg LibreOffice path intact')
assert(gotenbergSrc.includes('convertDocxViaGotenberg'), 'convertDocxViaGotenberg intact')

const adapterSrc = read('src/features/documents/template/gotenbergPdfAdapter.ts')
assert(adapterSrc.includes('docx-to-pdf'), 'client still uses docx-to-pdf')
assert(!adapterSrc.includes('cloudmersive'), 'adapter not switched to Cloudmersive')

const gProvider = createGotenbergDocxToPdfProvider({
  config: {
    ok: true,
    url: 'http://gotenberg.test',
    apiKey: null,
    timeoutMs: 10_000,
  },
  fetchImpl: async (url, init) => {
    assert(String(url).includes('/forms/libreoffice/convert'), 'gotenberg libreoffice URL')
    const body = init?.body as FormData
    const file = body.get('files') as File
    assert(file != null, 'gotenberg files field')
    const buf = new Uint8Array(await file.arrayBuffer())
    assert(
      buf.byteLength === fakeDocx.byteLength && buf.every((b, i) => b === fakeDocx[i]),
      'gotenberg receives same DOCX bytes',
    )
    return new Response(fakePdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  },
})
assert(gProvider.id === 'gotenberg', 'gotenberg provider id')
const gResult = await gProvider.convertDocxToPdf({
  docxBytes: fakeDocx,
  filename: 'umowa-final.docx',
})
assert(gResult.provider === 'gotenberg', 'gotenberg result')

// POC script exists and requires live flag for API spend
const poc = read('scripts/cloudmersive-docx-pdf-poc.ts')
assert(poc.includes('CLOUDMERSIVE_POC_LIVE'), 'live gate')
assert(poc.includes('tmp/contract-pdf-poc'), 'artifact dir')
assert(poc.includes('contract-source.docx'), 'source artifact')
assert(poc.includes('comparison-report.json'), 'report artifact')
assert(poc.includes('CONTRACT_PDF_POC_DOCX'), 'real DOCX path env')
assert(!poc.includes('paragraphsToPrintHtml'), 'no incomplete HTML path')

// Docs privacy
const docs = read('docs/pdf-rendering.md')
assert(docs.toLowerCase().includes('cloudmersive'), 'docs mention Cloudmersive')
assert(docs.includes('CLOUDMERSIVE_API_KEY'), 'docs key name')
assert(
  docs.includes('names') || docs.includes('PII') || docs.includes('privacy'),
  'privacy implication documented',
)

console.log('OK cloudmersive-docx-poc acceptance')
