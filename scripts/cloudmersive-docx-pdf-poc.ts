/**
 * Cloudmersive vs Gotenberg DOCX→PDF POC (DEV only).
 *
 * Uses ONE real final generated contract DOCX (same bytes → both converters).
 * Does NOT switch production. Does NOT call Cloudmersive unless
 * CLOUDMERSIVE_POC_LIVE=1.
 *
 *   CONTRACT_PDF_POC_DOCX=/path/to/final-contract.docx \
 *   CLOUDMERSIVE_POC_LIVE=1 \
 *   npx tsx --tsconfig tsconfig.app.json --env-file=.env.local \
 *     scripts/cloudmersive-docx-pdf-poc.ts
 *
 * Credits: LIVE=1 → exactly one Cloudmersive convert call (no auto-retry).
 */

import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import JSZip from 'jszip'
import {
  CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
  ContractPdfError,
  createCloudmersiveDocxToPdfProvider,
  createGotenbergDocxToPdfProvider,
} from '../src/features/documents/pdf/docxToPdf/index.ts'
import {
  approxA4,
  extractPdfMetrics,
  semanticMarkerPresence,
} from '../src/features/documents/pdf/docxToPdf/pdfMetrics.ts'

const outDir = resolve('tmp/contract-pdf-poc')
mkdirSync(outDir, { recursive: true })

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

async function extractDocxPlainText(docxBytes: Uint8Array): Promise<string> {
  const zip = await JSZip.loadAsync(docxBytes)
  const parts: string[] = []
  for (const name of [
    'word/document.xml',
    'word/header1.xml',
    'word/header2.xml',
    'word/footer1.xml',
    'word/footer2.xml',
  ]) {
    const f = zip.file(name)
    if (!f) continue
    const xml = await f.async('string')
    const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(xml))) {
      const t = m[1]
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .trim()
      if (t) parts.push(t)
    }
  }
  return parts.join(' ')
}

function pickSemanticMarkers(docxText: string): string[] {
  const envMarkers = (process.env.CONTRACT_PDF_POC_MARKERS || '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
  if (envMarkers.length) return envMarkers

  // Heuristic: keep longer tokens that look like names/dates/amounts from DOCX.
  const candidates = docxText
    .split(/\s+/)
    .map((s) => s.replace(/[^\p{L}\p{N}.,%-]/gu, ''))
    .filter((s) => s.length >= 4)
  const uniq: string[] = []
  for (const c of candidates) {
    if (uniq.length >= 24) break
    if (!uniq.includes(c)) uniq.push(c)
  }
  return uniq
}

function tryPdftoppm(pdfPath: string, prefix: string): boolean {
  const check = spawnSync('pdftoppm', ['-v'], { encoding: 'utf8' })
  if (check.error) return false
  const result = spawnSync(
    'pdftoppm',
    ['-png', '-r', '120', pdfPath, resolve(outDir, prefix)],
    { encoding: 'utf8' },
  )
  return result.status === 0
}

const sourcePath = process.env.CONTRACT_PDF_POC_DOCX?.trim()
if (!sourcePath) {
  console.error(`
Missing CONTRACT_PDF_POC_DOCX.

Provide a path to a REAL final generated contract DOCX from the OurWed pipeline
(uploaded package DOCX → sparse transform → final artifact).

Example:
  CONTRACT_PDF_POC_DOCX=~/Downloads/umowa-final.docx \\
  CLOUDMERSIVE_POC_LIVE=1 \\
  npm run pdf:cloudmersive-docx-poc
`)
  process.exit(1)
}

const absSource = resolve(sourcePath)
if (!existsSync(absSource)) {
  console.error(`DOCX not found: ${absSource}`)
  process.exit(1)
}

const docxBytes = new Uint8Array(readFileSync(absSource))
const filename = basename(absSource).endsWith('.docx')
  ? basename(absSource)
  : 'contract-source.docx'
const docxSha = sha256(docxBytes)
const docxSize = docxBytes.byteLength
const withinFreeTier = docxSize <= CLOUDMERSIVE_FREE_TIER_MAX_BYTES

const sourceOut = resolve(outDir, 'contract-source.docx')
writeFileSync(sourceOut, docxBytes)

console.log('Source DOCX:', absSource)
console.log('Copied to:', sourceOut)
console.log('Size bytes:', docxSize)
console.log('SHA-256:', docxSha)
console.log(
  'Within Cloudmersive Free Tier 3.5 MB:',
  withinFreeTier,
  `(limit ${CLOUDMERSIVE_FREE_TIER_MAX_BYTES})`,
)

type ProviderRun = {
  ok: boolean
  provider: string
  pdfBytes?: number
  pdfSha?: string
  errorCode?: string
  errorMessage?: string
  metrics?: Awaited<ReturnType<typeof extractPdfMetrics>>
}

const report: Record<string, unknown> = {
  generatedAt: new Date().toISOString(),
  privacyNotice:
    'Cloudmersive receives the complete final contract DOCX. It may contain names, addresses, phone/email, wedding date, contract price, and legal wording. Do not send auth tokens, service keys, questionnaire public tokens, or unrelated wedding data.',
  productionUnchanged: true,
  source: {
    path: absSource,
    artifact: 'contract-source.docx',
    byteLength: docxSize,
    sha256: docxSha,
    withinCloudmersiveFreeTier: withinFreeTier,
    freeTierMaxBytes: CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
  },
  gotenberg: null as ProviderRun | null,
  cloudmersive: null as ProviderRun | null,
  comparison: null as Record<string, unknown> | null,
  cloudmersiveApiCalls: 0,
  recommendationCriteria: [
    'no missing content',
    'no missing pages',
    'no broken tables',
    'no missing header/footer',
    'no missing logo/images',
    'no clipped text',
    'no major font substitution',
    'no material pagination breakage',
    'legal/business content equivalent',
    'minor anti-aliasing/rendering differences OK',
  ],
}

// --- A: Gotenberg baseline (same DOCX bytes) ---
const gotenbergProvider = createGotenbergDocxToPdfProvider({
  env: { get: (k) => process.env[k] },
})
let gotenbergPdf: Uint8Array | null = null
try {
  const g = await gotenbergProvider.convertDocxToPdf({
    docxBytes,
    filename,
  })
  gotenbergPdf = g.pdfBytes
  const gPath = resolve(outDir, 'contract-gotenberg.pdf')
  writeFileSync(gPath, g.pdfBytes)
  const metrics = await extractPdfMetrics(g.pdfBytes).catch(() => null)
  report.gotenberg = {
    ok: true,
    provider: 'gotenberg',
    pdfBytes: g.pdfBytes.byteLength,
    pdfSha: sha256(g.pdfBytes),
    metrics: metrics ?? undefined,
  }
  tryPdftoppm(gPath, 'gotenberg-page')
  console.log('Gotenberg PDF:', gPath, 'bytes=', g.pdfBytes.byteLength)
} catch (e) {
  const code = e instanceof ContractPdfError ? e.code : 'CONTRACT_PDF_CONVERSION_FAILED'
  const message = e instanceof Error ? e.message : String(e)
  report.gotenberg = { ok: false, provider: 'gotenberg', errorCode: code, errorMessage: message }
  console.error('Gotenberg failed:', code, message)
  console.error(
    'Start baseline: docker compose --profile gotenberg up gotenberg && ENABLE_EXPERIMENTAL_PDF_EXPORT=true GOTENBERG_URL=http://localhost:3000',
  )
}

// --- B: Cloudmersive (opt-in LIVE only; one call max) ---
const live =
  process.env.CLOUDMERSIVE_POC_LIVE?.trim() === '1' ||
  process.env.CLOUDMERSIVE_POC_LIVE?.trim().toLowerCase() === 'true'
const apiKey = process.env.CLOUDMERSIVE_API_KEY?.trim() || ''

let cloudmersivePdf: Uint8Array | null = null

if (!live) {
  report.cloudmersive = {
    ok: false,
    provider: 'cloudmersive',
    errorCode: 'SKIPPED',
    errorMessage:
      'Set CLOUDMERSIVE_POC_LIVE=1 to spend one Cloudmersive conversion credit. Dry-run did not call the API.',
  }
  console.log('Cloudmersive skipped (set CLOUDMERSIVE_POC_LIVE=1 for one live call).')
} else if (!apiKey) {
  report.cloudmersive = {
    ok: false,
    provider: 'cloudmersive',
    errorCode: 'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
    errorMessage: 'CLOUDMERSIVE_API_KEY missing (server-side .env.local only; never VITE_)',
  }
  console.error('CLOUDMERSIVE_API_KEY missing')
} else if (!withinFreeTier) {
  report.cloudmersive = {
    ok: false,
    provider: 'cloudmersive',
    errorCode: 'CONTRACT_PDF_FILE_TOO_LARGE',
    errorMessage: `DOCX ${docxSize} bytes exceeds free-tier ${CLOUDMERSIVE_FREE_TIER_MAX_BYTES}; API not called`,
  }
  console.error('File too large for free tier — Cloudmersive API not called')
} else {
  const cm = createCloudmersiveDocxToPdfProvider({
    apiKey,
    timeoutMs: Number(process.env.CLOUDMERSIVE_TIMEOUT_MS) || 60_000,
  })
  try {
    // Exactly one convert — no retry loop.
    const result = await cm.convertDocxToPdf({ docxBytes, filename })
    report.cloudmersiveApiCalls = 1
    cloudmersivePdf = result.pdfBytes
    const cPath = resolve(outDir, 'contract-cloudmersive.pdf')
    writeFileSync(cPath, result.pdfBytes)
    const metrics = await extractPdfMetrics(result.pdfBytes).catch(() => null)
    report.cloudmersive = {
      ok: true,
      provider: 'cloudmersive',
      pdfBytes: result.pdfBytes.byteLength,
      pdfSha: sha256(result.pdfBytes),
      metrics: metrics ?? undefined,
    }
    tryPdftoppm(cPath, 'cloudmersive-page')
    console.log('Cloudmersive PDF:', cPath, 'bytes=', result.pdfBytes.byteLength)
    console.log('Cloudmersive API calls this run: 1')
  } catch (e) {
    report.cloudmersiveApiCalls = 1 // attempted once; do not retry
    const code = e instanceof ContractPdfError ? e.code : 'CONTRACT_PDF_CONVERSION_FAILED'
    const message = e instanceof Error ? e.message : String(e)
    report.cloudmersive = {
      ok: false,
      provider: 'cloudmersive',
      errorCode: code,
      errorMessage: message,
    }
    console.error('Cloudmersive failed:', code, message)
  }
}

// --- Comparison ---
if (gotenbergPdf && cloudmersivePdf) {
  const gMetrics = await extractPdfMetrics(gotenbergPdf)
  const cMetrics = await extractPdfMetrics(cloudmersivePdf)
  const docxText = await extractDocxPlainText(docxBytes)
  const markers = pickSemanticMarkers(docxText)
  const gMarkers = semanticMarkerPresence(gMetrics.plainText, markers)
  const cMarkers = semanticMarkerPresence(cMetrics.plainText, markers)
  const missingInCloudmersive = cMarkers.filter((m) => !m.present).map((m) => m.marker)
  const missingInGotenberg = gMarkers.filter((m) => !m.present).map((m) => m.marker)

  report.comparison = {
    pageCount: {
      gotenberg: gMetrics.pageCount,
      cloudmersive: cMetrics.pageCount,
      equal: gMetrics.pageCount === cMetrics.pageCount,
    },
    dimensions: {
      gotenberg: {
        widthPt: gMetrics.firstPageWidthPt,
        heightPt: gMetrics.firstPageHeightPt,
        approxA4: approxA4(gMetrics.firstPageWidthPt, gMetrics.firstPageHeightPt),
      },
      cloudmersive: {
        widthPt: cMetrics.firstPageWidthPt,
        heightPt: cMetrics.firstPageHeightPt,
        approxA4: approxA4(cMetrics.firstPageWidthPt, cMetrics.firstPageHeightPt),
      },
    },
    fileSize: {
      gotenberg: gotenbergPdf.byteLength,
      cloudmersive: cloudmersivePdf.byteLength,
    },
    semanticMarkersChecked: markers.length,
    markersMissingInCloudmersive: missingInCloudmersive,
    markersMissingInGotenberg: missingInGotenberg,
    binaryEqual: sha256(gotenbergPdf) === sha256(cloudmersivePdf),
    note: 'Binary equality not required. Manually review page PNGs (pdftoppm) for tables, headers, logos, fonts, pagination.',
    visualChecklist: [
      'margins',
      'paragraph line wrapping',
      'tables / merged cells / borders',
      'header/footer',
      'images/logo',
      'signature layout',
      'page breaks',
      'fonts / weights',
      'line / paragraph spacing',
    ],
  }

  const pageOk = gMetrics.pageCount === cMetrics.pageCount
  const contentOk = missingInCloudmersive.length === 0
  report.pocVerdict = {
    pagesMatch: pageOk,
    noMissingSemanticMarkersInCloudmersive: contentOk,
    readyForProduction: false,
    note: 'Production remains on experimental Gotenberg path only when flagged; Cloudmersive is POC. Switch only after manual visual QA against criteria in report.recommendationCriteria.',
  }
}

const reportPath = resolve(outDir, 'comparison-report.json')
writeFileSync(reportPath, JSON.stringify(report, null, 2))
console.log('Wrote', reportPath)
console.log('Production contract PDF flow: unchanged')
