/**
 * Edge Function: HTML → PDF via PDFShift (POC — not production default).
 *
 * Secrets (never VITE_):
 *   PDFSHIFT_API_KEY
 * Optional:
 *   PDF_RENDER_TIMEOUT_MS (default 60000)
 *
 * Auth: authenticated studio session + account_has_pro_access().
 * Accepts HTML from the caller (same tradeoff as existing html-to-pdf).
 * Never accepts arbitrary public anonymous use.
 *
 * Deploy:
 *   supabase secrets set PDFSHIFT_API_KEY=sk_...
 *   supabase functions deploy pdf-render
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  convertHtmlViaPdfShift,
  PdfRenderError,
  type PdfRenderHtmlOptions,
} from './pdfShiftConvert.ts'

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

function statusForCode(code: string): number {
  switch (code) {
    case 'PDF_RENDER_PRO_REQUIRED':
      return 403
    case 'PDF_RENDER_UNAUTHORIZED':
      return 401
    case 'PDF_RENDER_BAD_REQUEST':
      return 400
    case 'PDF_RENDER_LIMIT_REACHED':
      return 429
    case 'PDF_RENDER_TIMEOUT':
      return 504
    case 'PDF_RENDER_PROVIDER_UNAVAILABLE':
      return 503
    default:
      return 502
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_BAD_REQUEST',
          message: 'POST required',
        },
      },
      405,
    )
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_UNAUTHORIZED',
          message: 'Brak autoryzacji.',
        },
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
        error: {
          code: 'PDF_RENDER_UNAUTHORIZED',
          message: 'Sesja nieważna.',
        },
      },
      401,
    )
  }

  const { data: hasPro, error: proError } = await supabase.rpc(
    'account_has_pro_access',
  )
  if (proError) {
    console.error('pdf-render pro check failed', proError.code)
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_FAILED',
          message: 'Nie udało się sprawdzić dostępu PRO.',
        },
      },
      502,
    )
  }
  if (!hasPro) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_PRO_REQUIRED',
          message: 'Generowanie PDF wymaga aktywnego PRO.',
        },
      },
      403,
    )
  }

  const apiKey = Deno.env.get('PDFSHIFT_API_KEY')?.trim()
  if (!apiKey) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_PROVIDER_UNAVAILABLE',
          message: 'PDFShift nie jest skonfigurowany.',
        },
      },
      503,
    )
  }

  let body: {
    html?: string
    filename?: string
    footerHtml?: string
    headerHtml?: string
    documentType?: string
    sandbox?: boolean
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_BAD_REQUEST',
          message: 'Nieprawidłowy JSON.',
        },
      },
      400,
    )
  }

  if (!body.html || typeof body.html !== 'string') {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_BAD_REQUEST',
          message: 'html wymagane.',
        },
      },
      400,
    )
  }
  if (body.html.length > MAX_HTML_CHARS) {
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_BAD_REQUEST',
          message: 'HTML ma niedozwolony rozmiar.',
        },
      },
      413,
    )
  }

  const timeoutRaw = Number(Deno.env.get('PDF_RENDER_TIMEOUT_MS') ?? '60000')
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 5000 ? timeoutRaw : 60_000

  // Production: sandbox always false unless PDF_RENDER_ALLOW_SANDBOX=true (POC/staging).
  const allowSandbox =
    Deno.env.get('PDF_RENDER_ALLOW_SANDBOX')?.trim().toLowerCase() === 'true'
  const sandbox = allowSandbox && body.sandbox === true

  const options: PdfRenderHtmlOptions = {
    headerHtml:
      typeof body.headerHtml === 'string' ? body.headerHtml : undefined,
    footerHtml:
      typeof body.footerHtml === 'string' ? body.footerHtml : undefined,
    sandbox,
    timeoutMs,
  }

  try {
    const result = await convertHtmlViaPdfShift({
      html: body.html,
      apiKey,
      options,
    })
    if (result.pdfBytes.byteLength > MAX_PDF_BYTES) {
      return jsonResponse(
        {
          ok: false,
          error: {
            code: 'PDF_RENDER_FAILED',
            message: 'PDF ma niedozwolony rozmiar.',
          },
        },
        413,
      )
    }
    return jsonResponse({
      ok: true,
      pdfBase64: base64FromBytes(result.pdfBytes),
      provider: result.provider,
      sandbox: result.sandbox,
      documentType: body.documentType ?? null,
    })
  } catch (e) {
    if (e instanceof PdfRenderError) {
      console.error('pdf-render failed', e.code, e.httpStatus ?? '')
      return jsonResponse(
        {
          ok: false,
          error: { code: e.code, message: e.message },
        },
        statusForCode(e.code),
      )
    }
    console.error('pdf-render unexpected')
    return jsonResponse(
      {
        ok: false,
        error: {
          code: 'PDF_RENDER_FAILED',
          message: 'Nie udało się przygotować PDF.',
        },
      },
      502,
    )
  }
})
