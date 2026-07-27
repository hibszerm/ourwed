/**
 * Gotenberg PDF conversion contract tests (no live Gotenberg / Graph).
 * Run: npx tsx --tsconfig tsconfig.app.json src/features/documents/template/gotenbergPdfAdapter.test.ts
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function source(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), 'utf8')
}

/** Mirrors Edge Function assertPdfResponse. */
function assertPdfResponse(input: {
  status: number
  contentType: string | null
  bytes: Uint8Array
  maxPdfBytes: number
}): void {
  if (input.status < 200 || input.status >= 300) {
    throw new Error(`gotenberg_http_${input.status}`)
  }
  if (input.bytes.byteLength === 0) throw new Error('empty_pdf')
  if (input.bytes.byteLength > input.maxPdfBytes) throw new Error('pdf_too_large')
  const prefix = new TextDecoder().decode(input.bytes.subarray(0, 5))
  if (prefix !== '%PDF-') throw new Error('invalid_pdf')
  const ct = (input.contentType || '').toLowerCase()
  if (
    ct &&
    !ct.includes('application/pdf') &&
    !ct.includes('application/octet-stream')
  ) {
    throw new Error('invalid_content_type')
  }
}

function validateGotenbergEnv(env: Record<string, string | undefined>): {
  ok: boolean
  message?: string
} {
  if (env.ENABLE_EXPERIMENTAL_PDF_EXPORT?.trim().toLowerCase() !== 'true') {
    return {
      ok: false,
      message: 'Eksperymentalny eksport PDF jest wyłączony',
    }
  }
  if (!env.GOTENBERG_URL?.trim()) {
    return {
      ok: false,
      message: 'GOTENBERG_URL',
    }
  }
  return { ok: true }
}

async function main() {
  assert(
    !source('.env.example').includes('MICROSOFT_GRAPH_'),
    'Microsoft Graph env removed',
  )
  assert(
    !source('src/features/documents/template/ContractExportService.ts').includes(
      'microsoftGraph',
    ),
    'no microsoft adapter in export service',
  )
  assert(
    source('src/features/documents/template/gotenbergPdfAdapter.ts').includes(
      'docx-to-pdf',
    ),
    'client invokes edge function',
  )
  assert(
    !source('src/features/documents/template/gotenbergPdfAdapter.ts').includes(
      'GOTENBERG_API_KEY',
    ),
    'no api key in frontend adapter',
  )
  assert(
    source('supabase/functions/docx-to-pdf/gotenbergConvert.ts').includes(
      '/forms/libreoffice/convert',
    ),
    'libreoffice convert path',
  )
  assert(
    source('supabase/functions/docx-to-pdf/gotenbergConvert.ts').includes(
      "form.append(\n    'files'",
    ) ||
      source('supabase/functions/docx-to-pdf/gotenbergConvert.ts').includes(
        "'files'",
      ),
    'multipart files field',
  )

  assert(!validateGotenbergEnv({}).ok, 'disabled by default')
  assert(
    !validateGotenbergEnv({ ENABLE_EXPERIMENTAL_PDF_EXPORT: 'true' }).ok,
    'needs url',
  )
  assert(
    validateGotenbergEnv({
      ENABLE_EXPERIMENTAL_PDF_EXPORT: 'true',
      GOTENBERG_URL: 'http://localhost:3000',
    }).ok,
    'configured ok',
  )

  assertPdfResponse({
    status: 200,
    contentType: 'application/pdf',
    bytes: new TextEncoder().encode('%PDF-1.4\n'),
    maxPdfBytes: 1024,
  })

  let rejected = false
  try {
    assertPdfResponse({
      status: 200,
      contentType: 'text/html',
      bytes: new TextEncoder().encode('<html>nope</html>'),
      maxPdfBytes: 1024,
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'html rejected')

  rejected = false
  try {
    assertPdfResponse({
      status: 200,
      contentType: 'application/json',
      bytes: new TextEncoder().encode('{"ok":true}'),
      maxPdfBytes: 1024,
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'json rejected')

  rejected = false
  try {
    assertPdfResponse({
      status: 200,
      contentType: 'application/pdf',
      bytes: new Uint8Array(),
      maxPdfBytes: 1024,
    })
  } catch {
    rejected = true
  }
  assert(rejected, 'empty rejected')

  // Fake adapter receives exact DOCX bytes
  const docx = new TextEncoder().encode('PK-fake-docx')
  let seen: ArrayBuffer | null = null
  const fake = {
    async convertDocx({ docxBytes }: { docxBytes: ArrayBuffer }) {
      seen = docxBytes
      return new TextEncoder().encode('%PDF-1.4').buffer
    },
  }
  await fake.convertDocx({ docxBytes: docx.buffer })
  assert(seen != null && new Uint8Array(seen!).byteLength === docx.length, 'exact bytes')

  assert(
  source('src/features/documents/template/gotenbergPdfAdapter.ts').includes(
    'VITE_LOCAL_PDF_FUNCTION_URL',
  ),
  'local pdf url supported',
)
assert(
  source('src/features/documents/template/gotenbergPdfAdapter.ts').includes(
    'import.meta.env.DEV',
  ),
  'local pdf url gated to vite DEV',
)
assert(
  source('scripts/dev-pdf-server.ts').includes('gotenbergConvert'),
  'dev server reuses convert module',
)
assert(
  source('scripts/dev-pdf-server.ts').includes("'/docx-to-pdf'"),
  'dev server path',
)

console.log('ok — gotenbergPdfAdapter contract')
}

main()
