/**
 * Production contract PDF client: final DOCX → Edge `contract-docx-to-pdf` → Cloudmersive.
 *
 * Never calls Cloudmersive from the browser.
 * Never uses localhost / Gotenberg / VITE_LOCAL_PDF_FUNCTION_URL.
 * Secret CLOUDMERSIVE_API_KEY stays server-side only.
 */

import { supabase } from '@/lib/supabase'
import {
  ContractPdfError,
  contractPdfErrorUserMessage,
  type ContractPdfErrorCode,
} from '@/features/documents/pdf/docxToPdf/errors'
import { CLOUDMERSIVE_FREE_TIER_MAX_BYTES } from '@/features/documents/pdf/docxToPdf/cloudmersiveConvert'

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary)
}

function base64ToBytes(b64: string): ArrayBuffer {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out.buffer
}

const KNOWN_CODES: ContractPdfErrorCode[] = [
  'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
  'CONTRACT_PDF_LIMIT_REACHED',
  'CONTRACT_PDF_FILE_TOO_LARGE',
  'CONTRACT_PDF_CONVERSION_FAILED',
  'CONTRACT_PDF_TIMEOUT',
  'CONTRACT_PDF_PRO_REQUIRED',
  'CONTRACT_PDF_UNAUTHORIZED',
  'CONTRACT_PDF_BAD_REQUEST',
]

function asContractCode(raw: string | undefined): ContractPdfErrorCode | null {
  if (!raw) return null
  return KNOWN_CODES.includes(raw as ContractPdfErrorCode)
    ? (raw as ContractPdfErrorCode)
    : null
}

function throwMapped(
  code: ContractPdfErrorCode,
  fallback?: string,
): never {
  throw new ContractPdfError(
    code,
    fallback || contractPdfErrorUserMessage(code),
  )
}

export type ConvertContractDocxToPdfInput = {
  /** Exact final generated contract DOCX bytes. */
  docxBytes: ArrayBuffer
  filename: string
  /** Optional audit ids — never used as conversion source of truth. */
  weddingId?: string
  documentId?: string
}

/**
 * One user action → one Edge invoke → one Cloudmersive conversion.
 * No automatic retry. No localhost fallback.
 */
export async function convertContractDocxToPdf(
  input: ConvertContractDocxToPdfInput,
): Promise<ArrayBuffer> {
  const byteLength = input.docxBytes.byteLength
  if (byteLength === 0) {
    throwMapped('CONTRACT_PDF_BAD_REQUEST')
  }
  // Client-side guard avoids a wasted Edge round-trip; Edge re-checks.
  if (byteLength > CLOUDMERSIVE_FREE_TIER_MAX_BYTES) {
    throwMapped('CONTRACT_PDF_FILE_TOO_LARGE')
  }

  const filename = input.filename.endsWith('.docx')
    ? input.filename
    : `${input.filename}.docx`

  const { data, error } = await supabase.functions.invoke('contract-docx-to-pdf', {
    body: {
      docxBase64: bytesToBase64(input.docxBytes),
      filename,
      weddingId: input.weddingId,
      documentId: input.documentId,
    },
  })

  type Body = {
    ok?: boolean
    pdfBase64?: string
    provider?: string
    error?: { code?: string; message?: string }
  }

  let json = data as Body | null

  if (error) {
    const context = (error as { context?: Response }).context
    if (context && typeof context.json === 'function') {
      try {
        json = (await context.json()) as Body
      } catch {
        // ignore parse failure
      }
    }
    const code = asContractCode(json?.error?.code)
    if (code) throwMapped(code, json?.error?.message)
    throwMapped('CONTRACT_PDF_CONVERSION_FAILED')
  }

  if (!json?.ok || !json.pdfBase64) {
    const code = asContractCode(json?.error?.code) ?? 'CONTRACT_PDF_CONVERSION_FAILED'
    throwMapped(code, json?.error?.message)
  }

  return base64ToBytes(json.pdfBase64)
}

/** Production PdfConversionAdapter shape for optional export-service wiring. */
export function createContractCloudmersivePdfAdapter(meta?: {
  weddingId?: string
  documentId?: string
}): {
  convertDocx: (input: {
    docxBytes: ArrayBuffer
    fileName: string
  }) => Promise<ArrayBuffer>
} {
  return {
    convertDocx: ({ docxBytes, fileName }) =>
      convertContractDocxToPdf({
        docxBytes,
        filename: fileName,
        weddingId: meta?.weddingId,
        documentId: meta?.documentId,
      }),
  }
}
