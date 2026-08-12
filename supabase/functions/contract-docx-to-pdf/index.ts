/**
 * Edge Function: final contract DOCX → PDF via Cloudmersive (production).
 *
 * Secrets (never VITE_):
 *   CLOUDMERSIVE_API_KEY
 * Optional:
 *   CLOUDMERSIVE_TIMEOUT_MS (default 60000)
 *
 * Auth: authenticated studio session + account_has_pro_access().
 * Input: exact final generated DOCX bytes (docxBase64) from the caller who
 * already owns the wedding/document in the app. Not an anonymous conversion relay.
 * Never accepts arbitrary URLs.
 *
 * Does NOT use Gotenberg / localhost / LibreOffice.
 * Does NOT mutate wedding/contract/DOCX/signed state — output-only.
 *
 * Deploy:
 *   supabase secrets set CLOUDMERSIVE_API_KEY=...
 *   supabase functions deploy contract-docx-to-pdf
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1'
import {
  CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
  convertDocxViaCloudmersive,
} from './cloudmersiveConvert.ts'
import {
  ContractPdfError,
  contractPdfErrorUserMessage,
  statusForContractPdfCode,
  type ContractPdfErrorCode,
} from './contractPdfErrors.ts'

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

function fail(
  code: ContractPdfErrorCode,
  status?: number,
): Response {
  return jsonResponse(
    {
      ok: false,
      error: {
        code,
        message: contractPdfErrorUserMessage(code),
      },
    },
    status ?? statusForContractPdfCode(code),
  )
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return fail('CONTRACT_PDF_BAD_REQUEST', 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return fail('CONTRACT_PDF_UNAUTHORIZED')
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
    return fail('CONTRACT_PDF_UNAUTHORIZED')
  }

  const { data: hasPro, error: proError } = await supabase.rpc(
    'account_has_pro_access',
  )
  if (proError) {
    console.error('[contract-docx-to-pdf] pro check failed', proError.code)
    return fail('CONTRACT_PDF_CONVERSION_FAILED')
  }
  if (!hasPro) {
    return fail('CONTRACT_PDF_PRO_REQUIRED')
  }

  const apiKey = Deno.env.get('CLOUDMERSIVE_API_KEY')?.trim()
  if (!apiKey) {
    console.error('[contract-docx-to-pdf] CLOUDMERSIVE_API_KEY missing')
    return fail('CONTRACT_PDF_PROVIDER_UNAVAILABLE')
  }

  let body: {
    docxBase64?: string
    filename?: string
    weddingId?: string
    documentId?: string
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return fail('CONTRACT_PDF_BAD_REQUEST')
  }

  if (!body.docxBase64 || typeof body.docxBase64 !== 'string') {
    return fail('CONTRACT_PDF_BAD_REQUEST')
  }

  // Reject URL-based conversion attempts if ever sent.
  if (
    typeof (body as { docxUrl?: unknown }).docxUrl === 'string' ||
    typeof (body as { url?: unknown }).url === 'string'
  ) {
    return fail('CONTRACT_PDF_BAD_REQUEST')
  }

  let docxBytes: Uint8Array
  try {
    docxBytes = bytesFromBase64(body.docxBase64)
  } catch {
    return fail('CONTRACT_PDF_BAD_REQUEST')
  }

  if (docxBytes.byteLength === 0) {
    return fail('CONTRACT_PDF_BAD_REQUEST')
  }

  // Free-tier guard — do not call provider when too large.
  if (docxBytes.byteLength > CLOUDMERSIVE_FREE_TIER_MAX_BYTES) {
    console.error(
      '[contract-docx-to-pdf]',
      'CONTRACT_PDF_FILE_TOO_LARGE',
      'bytes=',
      docxBytes.byteLength,
      'weddingId=',
      typeof body.weddingId === 'string' ? body.weddingId : null,
      'documentId=',
      typeof body.documentId === 'string' ? body.documentId : null,
    )
    return fail('CONTRACT_PDF_FILE_TOO_LARGE')
  }

  const timeoutRaw = Number(Deno.env.get('CLOUDMERSIVE_TIMEOUT_MS') ?? '60000')
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= 5000 ? timeoutRaw : 60_000

  const filename =
    typeof body.filename === 'string' && body.filename.trim()
      ? body.filename.trim()
      : 'contract.docx'

  const started = Date.now()
  try {
    // Exactly one provider call — no automatic retry.
    const result = await convertDocxViaCloudmersive({
      docxBytes,
      filename,
      config: {
        apiKey,
        timeoutMs,
        maxInputBytes: CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
        maxPdfBytes: MAX_PDF_BYTES,
      },
    })

    console.info(
      '[contract-docx-to-pdf]',
      'ok',
      'provider=cloudmersive',
      'docxBytes=',
      docxBytes.byteLength,
      'pdfBytes=',
      result.pdfBytes.byteLength,
      'ms=',
      Date.now() - started,
      'weddingId=',
      typeof body.weddingId === 'string' ? body.weddingId : null,
      'documentId=',
      typeof body.documentId === 'string' ? body.documentId : null,
    )

    return jsonResponse({
      ok: true,
      pdfBase64: base64FromBytes(result.pdfBytes),
      provider: result.provider,
    })
  } catch (e) {
    if (e instanceof ContractPdfError) {
      console.error(
        '[contract-docx-to-pdf]',
        e.code,
        'docxBytes=',
        docxBytes.byteLength,
        'ms=',
        Date.now() - started,
      )
      return fail(e.code)
    }
    console.error('[contract-docx-to-pdf] unexpected')
    return fail('CONTRACT_PDF_CONVERSION_FAILED')
  }
})
