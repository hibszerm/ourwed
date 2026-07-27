/**
 * PDF export transport routing tests.
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/pdfExportTransport.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolvePdfExportTransport } from './gotenbergPdfAdapter'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

// --- pure routing ---

const local = resolvePdfExportTransport({
  isDev: true,
  localUrl: 'http://127.0.0.1:54322/docx-to-pdf',
})
assert(local.transport === 'local', 'DEV + local URL → local')
if (local.transport === 'local') {
  assert(
    local.url === 'http://127.0.0.1:54322/docx-to-pdf',
    'exact local url',
  )
}

const noUrl = resolvePdfExportTransport({ isDev: true, localUrl: '' })
assert(noUrl.transport === 'supabase', 'DEV + empty URL → supabase')

const whitespace = resolvePdfExportTransport({
  isDev: true,
  localUrl: '   ',
})
assert(whitespace.transport === 'supabase', 'DEV + whitespace URL → supabase')

const prodWithUrl = resolvePdfExportTransport({
  isDev: false,
  localUrl: 'http://127.0.0.1:54322/docx-to-pdf',
})
assert(
  prodWithUrl.transport === 'supabase',
  'production + local URL → still supabase',
)

const prodNoUrl = resolvePdfExportTransport({ isDev: false, localUrl: null })
assert(prodNoUrl.transport === 'supabase', 'production → supabase')

// --- source guarantees: local branch never invokes supabase ---

const adapter = source(
  'src/features/documents/template/gotenbergPdfAdapter.ts',
)
assert(adapter.includes('resolvePdfExportTransport'), 'uses pure resolver')
assert(
  adapter.includes("console.info(`[pdf-export] transport=local url="),
  'logs local transport',
)
assert(
  adapter.includes(
    "console.info('[pdf-export] transport=supabase function=docx-to-pdf')",
  ),
  'logs supabase transport',
)
assert(
  adapter.includes('localUrlConfigured='),
  'logs init localUrlConfigured',
)

// Local path must use fetch, not invoke
const localFnStart = adapter.indexOf('async function invokeLocalPdf')
const edgeFnStart = adapter.indexOf('async function invokeEdgePdf')
assert(localFnStart >= 0 && edgeFnStart > localFnStart, 'fn order')
const localFnBody = adapter.slice(localFnStart, edgeFnStart)
assert(localFnBody.includes('fetch('), 'local uses fetch')
assert(
  !localFnBody.includes('functions.invoke'),
  'local must not call functions.invoke',
)
assert(
  adapter.includes("supabase.functions.invoke('docx-to-pdf'"),
  'edge path still exists',
)

// Click path uses adapter
assert(
  source(
    'src/features/documents/contract-experience/ExperimentalPdfActions.tsx',
  ).includes('createGotenbergPdfAdapter'),
  'UI uses adapter',
)

console.log('ok — pdfExportTransport routing')
