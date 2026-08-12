/**
 * PDFShift provider POC — offline acceptance (no live PDFShift / Gotenberg).
 */
import { readFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  adaptFooterHeaderHtmlForPdfShift,
  buildPdfShiftAuthHeaders,
  buildPdfShiftRequestBody,
  convertHtmlViaPdfShift,
  GOTENBERG_HTML_DEFAULTS,
  inchesToMm,
  mapPdfShiftHttpError,
  PdfRenderError,
} from '../../../../supabase/functions/pdf-render/pdfShiftConvert.ts'
import { resolvePdfRendererProvider } from '@/features/documents/pdf/pdfRenderer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function read(rel: string) {
  return readFileSync(join(ROOT, rel), 'utf8')
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(`FAIL pdfshift-poc — ${msg}`)
}

// Provider selection — production default is pdfShift; local is explicit opt-in
assert(resolvePdfRendererProvider('pdfshift') === 'pdfShift', 'select pdfshift')
assert(resolvePdfRendererProvider('local') === 'localDocker', 'explicit local')
assert(resolvePdfRendererProvider(undefined) === 'pdfShift', 'default pdfshift')

// Option mapping matches Gotenberg Chromium defaults
const body = buildPdfShiftRequestBody({
  html: '<html><body>Hi</body></html>',
  options: { footerHtml: '<div>f</div>', sandbox: true },
})
assert(body.format === 'A4', 'A4')
assert(body.landscape === false, 'portrait')
assert(body.disable_backgrounds === false, 'print backgrounds on')
assert(body.sandbox === true, 'sandbox default path')
const margin = body.margin as { top: string; bottom: string; left: string; right: string }
assert(margin.left === `${inchesToMm(GOTENBERG_HTML_DEFAULTS.marginLeftIn)}mm`, 'left margin')
assert(
  margin.bottom === `${inchesToMm(GOTENBERG_HTML_DEFAULTS.marginBottomWithFooterIn)}mm`,
  'footer bottom margin',
)

// Footer placeholder adaptation
const adapted = adaptFooterHeaderHtmlForPdfShift(
  'Strona <span class="pageNumber"></span> z <span class="totalPages"></span>',
)
assert(adapted.includes('{{page}}'), 'page placeholder')
assert(adapted.includes('{{total}}'), 'total placeholder')
assert(!adapted.includes('pageNumber'), 'no gotenberg class left')

// Auth header exists; key never embedded in request body
const headers = buildPdfShiftAuthHeaders('sk_test_secret_key')
assert(headers['X-API-Key'] === 'sk_test_secret_key', 'X-API-Key header')
assert(!('Authorization' in headers), 'no basic auth')
const serializedBody = JSON.stringify(body)
assert(!serializedBody.includes('sk_'), 'key not in body')
assert(!serializedBody.includes('API-Key'), 'key name not in body')

// Error mapping
assert(
  mapPdfShiftHttpError({ status: 429 }).code === 'PDF_RENDER_LIMIT_REACHED',
  '429 → limit',
)
assert(
  mapPdfShiftHttpError({ status: 403, bodyText: 'no credits remaining' }).code ===
    'PDF_RENDER_LIMIT_REACHED',
  '403 credits → limit',
)
assert(
  mapPdfShiftHttpError({ status: 503 }).code === 'PDF_RENDER_PROVIDER_UNAVAILABLE',
  '503 unavailable',
)
assert(
  mapPdfShiftHttpError({ status: 504 }).code === 'PDF_RENDER_TIMEOUT',
  '504 timeout',
)

// Mocked convert — verifies Idempotency-free request + auth header, no live call
let seenKey: string | undefined
let seenBody: string | undefined
const fakePdf = new TextEncoder().encode('%PDF-1.4 mock')
const result = await convertHtmlViaPdfShift({
  html: '<p>x</p>',
  apiKey: 'sk_unit_test_only',
  options: { sandbox: true, timeoutMs: 5000 },
  fetchImpl: async (_url, init) => {
    const h = init?.headers as Record<string, string>
    seenKey = h['X-API-Key']
    seenBody = typeof init?.body === 'string' ? init.body : undefined
    return new Response(fakePdf, {
      status: 200,
      headers: { 'Content-Type': 'application/pdf' },
    })
  },
})
assert(result.provider === 'pdfshift', 'provider id')
assert(seenKey === 'sk_unit_test_only', 'auth sent')
assert(seenBody && !seenBody.includes('sk_unit'), 'secret not in JSON body')
assert(result.pdfBytes[0] === 0x25, 'PDF bytes')

// Quota path via mock
try {
  await convertHtmlViaPdfShift({
    html: '<p>x</p>',
    apiKey: 'sk_unit',
    fetchImpl: async () =>
      new Response(JSON.stringify({ error: 'No credits left' }), {
        status: 403,
      }),
  })
  assert(false, 'should throw')
} catch (e) {
  assert(e instanceof PdfRenderError, 'PdfRenderError')
  assert(e.code === 'PDF_RENDER_LIMIT_REACHED', 'quota code')
}

// Edge Function wiring
assert(existsSync(join(ROOT, 'supabase/functions/pdf-render/index.ts')), 'edge fn')
assert(existsSync(join(ROOT, 'supabase/functions/pdf-render/pdfShiftConvert.ts')), 'convert')
const edge = read('supabase/functions/pdf-render/index.ts')
assert(edge.includes('PDFSHIFT_API_KEY'), 'secret name')
assert(edge.includes('account_has_pro_access'), 'PRO gate')
assert(edge.includes('X-API-Key') || edge.includes('convertHtmlViaPdfShift'), 'uses convert')
assert(!edge.includes('VITE_PDFSHIFT'), 'no vite key')
assert(edge.includes('PDF_RENDER_PRO_REQUIRED') || edge.includes('PRO_REQUIRED'), 'pro error')

// Client must not embed PDFSHIFT key
const clientRenderer = read('src/features/documents/pdf/pdfShiftEdgeRenderer.ts')
assert(clientRenderer.includes("functions.invoke('pdf-render'"), 'edge invoke')
assert(!clientRenderer.includes('PDFSHIFT_API_KEY'), 'no key in client')

const envExample = read('.env.example')
assert(envExample.includes('PDFSHIFT_API_KEY'), 'env documents key')
assert(!envExample.includes('VITE_PDFSHIFT_API_KEY'), 'never vite pdfshift')

const docs = read('docs/pdf-rendering.md')
assert(docs.includes('PDFShift'), 'docs exist')
assert(docs.includes('Gotenberg'), 'docs gotenberg')
assert(docs.includes('privacy') || docs.includes('Privacy') || docs.includes('prywat'), 'privacy')

// Existing local path retained as DEV tooling
assert(existsSync(join(ROOT, 'scripts/dev-pdf-server.ts')), 'dev pdf server kept')
assert(existsSync(join(ROOT, 'supabase/functions/html-to-pdf/index.ts')), 'html-to-pdf kept for legacy/dev')
assert(
  read('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts').includes(
    'renderProductionHtmlToPdf',
  ),
  'brief production uses PDFShift edge path',
)
assert(
  !/\bhtml-to-pdf\b/.test(
    read('src/features/wedding-brief/convertWeddingBriefHtmlToPdf.ts'),
  ),
  'brief no longer calls html-to-pdf',
)

console.log('OK pdfshift-poc acceptance')
