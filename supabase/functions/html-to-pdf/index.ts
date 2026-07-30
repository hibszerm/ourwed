/**
 * Edge Function: HTML → PDF via Gotenberg Chromium (same Docker as docx-to-pdf).
 * Auth required. Used for Wedding Brief offline PDF.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  convertHtmlViaGotenberg,
  readGotenbergConfig,
} from '../docx-to-pdf/gotenbergConvert.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_HTML_CHARS = 4 * 1024 * 1024
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

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    { global: { headers: { Authorization: authHeader } } },
  )
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'unauthorized', message: 'Sesja nieważna.' },
      },
      401,
    )
  }

  const config = readGotenbergConfig({
    get: (key) => Deno.env.get(key) ?? undefined,
  })
  if (!config.ok) {
    return jsonResponse(
      { ok: false, error: { code: 'misconfigured', message: config.message } },
      503,
    )
  }

  let body: { html?: string; filename?: string; footerHtml?: string; headerHtml?: string }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonResponse(
      { ok: false, error: { code: 'bad_request', message: 'Nieprawidłowy JSON.' } },
      400,
    )
  }

  if (!body.html || typeof body.html !== 'string') {
    return jsonResponse(
      { ok: false, error: { code: 'bad_request', message: 'html wymagane.' } },
      400,
    )
  }
  if (body.html.length > MAX_HTML_CHARS) {
    return jsonResponse(
      {
        ok: false,
        error: { code: 'bad_request', message: 'HTML ma niedozwolony rozmiar.' },
      },
      413,
    )
  }

  try {
    const result = await convertHtmlViaGotenberg({
      html: body.html,
      filename: body.filename,
      footerHtml: body.footerHtml,
      headerHtml: body.headerHtml,
      config,
      maxPdfBytes: MAX_PDF_BYTES,
    })
    return jsonResponse({
      ok: true,
      pdfBase64: base64FromBytes(result.pdfBytes),
      provider: result.provider,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const status = message === 'timeout' ? 504 : 502
    return jsonResponse(
      {
        ok: false,
        error: {
          code: message === 'timeout' ? 'timeout' : 'conversion_failed',
          message: `Nie udało się przygotować briefu PDF. (${message})`,
        },
      },
      status,
    )
  }
})
