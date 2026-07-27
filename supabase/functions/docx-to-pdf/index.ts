/**
 * Edge Function: convert final DOCX bytes to PDF via self-hosted Gotenberg (LibreOffice).
 *
 * Secrets (never in Vite):
 *   GOTENBERG_URL=http://localhost:3000
 *   GOTENBERG_API_KEY=            (optional)
 *   ENABLE_EXPERIMENTAL_PDF_EXPORT=true
 *
 * Deploy:
 *   supabase functions deploy docx-to-pdf
 *   supabase secrets set GOTENBERG_URL=... ENABLE_EXPERIMENTAL_PDF_EXPORT=true
 *
 * Local Gotenberg:
 *   docker run --rm -p 3000:3000 gotenberg/gotenberg:8
 *
 * Production hosting of Gotenberg may incur infrastructure cost. Use HTTPS and
 * network access restrictions when Gotenberg is remote.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  convertDocxViaGotenberg,
  readGotenbergConfig,
} from './gotenbergConvert.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_DOCX_BYTES = 25 * 1024 * 1024
const MAX_PDF_BYTES = 40 * 1024 * 1024

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function base64FromBytes(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function bytesFromBase64(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      { ok: false, error: { code: 'bad_request', message: 'POST required' } },
      405,
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Brak autoryzacji.' },
      },
      401,
    )
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  })
  const {
    data: { user },
    error: userErr,
  } = await userClient.auth.getUser()
  if (userErr || !user) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Sesja wygasła.' },
      },
      401,
    )
  }

  const config = readGotenbergConfig(Deno.env)
  if (!config.ok) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'misconfigured', message: config.message },
      },
      503,
    )
  }

  let body: {
    docxBase64?: string
    filename?: string
    runId?: string
  }
  try {
    body = await req.json()
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'bad_request', message: 'Nieprawidłowy JSON.' },
      },
      400,
    )
  }

  if (!body.docxBase64 || typeof body.docxBase64 !== 'string') {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'bad_request', message: 'docxBase64 wymagane.' },
      },
      400,
    )
  }

  let docxBytes: Uint8Array
  try {
    docxBytes = bytesFromBase64(body.docxBase64)
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'bad_request', message: 'Nieprawidłowy plik DOCX.' },
      },
      400,
    )
  }

  if (docxBytes.byteLength === 0 || docxBytes.byteLength > MAX_DOCX_BYTES) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'bad_request',
          message: 'Plik DOCX ma niedozwolony rozmiar.',
        },
      },
      400,
    )
  }

  try {
    const result = await convertDocxViaGotenberg({
      docxBytes,
      filename: body.filename ?? 'contract.docx',
      config,
      maxPdfBytes: MAX_PDF_BYTES,
    })
    return jsonResponse({
      ok: true,
      pdfBase64: base64FromBytes(result.pdfBytes),
      provider: result.provider,
    })
  } catch (e) {
    const code =
      e instanceof Error && e.message === 'timeout'
        ? 'timeout'
        : 'conversion_failed'
    // Do not log document contents or customer data.
    console.error('[docx-to-pdf]', code)
    return jsonResponse(
      {
        ok: false,
        error: {
          code,
          message:
            'Nie udało się utworzyć testowego PDF. Dokument DOCX jest nadal gotowy i możesz go pobrać.',
        },
      },
      code === 'timeout' ? 504 : 502,
    )
  }
})
