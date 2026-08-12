/**
 * Cloudmersive DOCX → PDF (server-side; production Edge + Node POC re-export).
 * Auth: HTTP header `Apikey` (official Convert API).
 * Never import from browser / Vite bundles.
 *
 * Canonical implementation — do not duplicate elsewhere.
 */

import {
  ContractPdfError,
  type ContractPdfErrorCode,
} from './contractPdfErrors.ts'

/** Official Document Convert API — DOCX to PDF. */
export const CLOUDMERSIVE_DOCX_TO_PDF_URL =
  'https://api.cloudmersive.com/convert/docx/to/pdf'

/**
 * Cloudmersive Free Tier documented maximum file size: 3.5 MB per request.
 * @see https://cloudmersive.com/pricing-small-business
 */
export const CLOUDMERSIVE_FREE_TIER_MAX_BYTES = Math.floor(3.5 * 1024 * 1024)

export type CloudmersiveConvertConfig = {
  apiKey: string
  /** Override base URL (tests). Default: official convert endpoint. */
  endpointUrl?: string
  timeoutMs?: number
  /** Free-tier file size guard. Default: CLOUDMERSIVE_FREE_TIER_MAX_BYTES. */
  maxInputBytes?: number
  /** Max accepted PDF response size. */
  maxPdfBytes?: number
}

export type ConvertDocxToPdfResult = {
  pdfBytes: Uint8Array
  provider: 'cloudmersive'
}

export function buildCloudmersiveAuthHeaders(apiKey: string): {
  Apikey: string
} {
  const key = apiKey.trim()
  if (!key) {
    throw new ContractPdfError(
      'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
      'CLOUDMERSIVE_API_KEY is not configured',
    )
  }
  return { Apikey: key }
}

export function assertWithinCloudmersiveFreeTierSize(
  byteLength: number,
  maxBytes: number = CLOUDMERSIVE_FREE_TIER_MAX_BYTES,
): void {
  if (byteLength > maxBytes) {
    throw new ContractPdfError(
      'CONTRACT_PDF_FILE_TOO_LARGE',
      `DOCX is ${byteLength} bytes; free-tier limit is ${maxBytes} bytes`,
    )
  }
}

export function mapCloudmersiveHttpError(input: {
  status: number
  bodyText?: string
}): ContractPdfError {
  const text = (input.bodyText || '').toLowerCase()
  if (input.status === 429 || text.includes('rate') || text.includes('quota')) {
    return new ContractPdfError(
      'CONTRACT_PDF_LIMIT_REACHED',
      'provider rate/credit limit',
      input.status,
    )
  }
  if (input.status === 401 || input.status === 403) {
    if (
      text.includes('credit') ||
      text.includes('quota') ||
      text.includes('limit')
    ) {
      return new ContractPdfError(
        'CONTRACT_PDF_LIMIT_REACHED',
        'provider limit',
        input.status,
      )
    }
    return new ContractPdfError(
      'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
      'provider auth failed',
      input.status,
    )
  }
  if (
    input.status === 413 ||
    text.includes('too large') ||
    text.includes('filesize')
  ) {
    return new ContractPdfError(
      'CONTRACT_PDF_FILE_TOO_LARGE',
      'provider rejected file size',
      input.status,
    )
  }
  if (input.status === 408 || input.status === 504) {
    return new ContractPdfError(
      'CONTRACT_PDF_TIMEOUT',
      'provider timeout',
      input.status,
    )
  }
  if (input.status === 502 || input.status === 503 || input.status === 522) {
    return new ContractPdfError(
      'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
      'provider unavailable',
      input.status,
    )
  }
  return new ContractPdfError(
    'CONTRACT_PDF_CONVERSION_FAILED',
    'provider conversion failed',
    input.status,
  )
}

function safeFileName(name: string): string {
  const base = name.replace(/[^\w.-]+/g, '_').slice(0, 100) || 'contract'
  return base.toLowerCase().endsWith('.docx') ? base : `${base}.docx`
}

function assertPdfBytes(bytes: Uint8Array, maxPdfBytes: number): void {
  if (bytes.byteLength === 0) {
    throw new ContractPdfError(
      'CONTRACT_PDF_CONVERSION_FAILED',
      'empty PDF from provider',
    )
  }
  if (bytes.byteLength > maxPdfBytes) {
    throw new ContractPdfError(
      'CONTRACT_PDF_CONVERSION_FAILED',
      'PDF too large',
    )
  }
  const prefix = new TextDecoder().decode(bytes.subarray(0, 5))
  if (prefix !== '%PDF-') {
    throw new ContractPdfError(
      'CONTRACT_PDF_CONVERSION_FAILED',
      'invalid PDF response',
    )
  }
}

/**
 * One-shot DOCX → PDF via Cloudmersive Convert API.
 * No automatic retries (credit economy).
 */
export async function convertDocxViaCloudmersive(input: {
  docxBytes: Uint8Array
  filename: string
  config: CloudmersiveConvertConfig
  fetchImpl?: typeof fetch
}): Promise<ConvertDocxToPdfResult> {
  const maxInput = input.config.maxInputBytes ?? CLOUDMERSIVE_FREE_TIER_MAX_BYTES
  assertWithinCloudmersiveFreeTierSize(input.docxBytes.byteLength, maxInput)

  const apiKey = input.config.apiKey.trim()
  if (!apiKey) {
    throw new ContractPdfError(
      'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
      'CLOUDMERSIVE_API_KEY is not configured',
    )
  }

  const fetchFn = input.fetchImpl ?? fetch
  const endpoint =
    input.config.endpointUrl?.trim() || CLOUDMERSIVE_DOCX_TO_PDF_URL
  const timeoutMs =
    Number.isFinite(input.config.timeoutMs) &&
    (input.config.timeoutMs ?? 0) >= 5000
      ? (input.config.timeoutMs as number)
      : 60_000
  const maxPdfBytes = input.config.maxPdfBytes ?? 40 * 1024 * 1024
  const filename = safeFileName(input.filename)

  // Fresh ArrayBuffer-backed copy for BlobPart / Deno File typing.
  const fileBytes = new Uint8Array(input.docxBytes)
  const form = new FormData()
  form.append(
    'inputFile',
    new File([fileBytes], filename, {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    }),
  )

  const headers = buildCloudmersiveAuthHeaders(apiKey)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetchFn(endpoint, {
      method: 'POST',
      headers,
      body: form,
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ContractPdfError(
        'CONTRACT_PDF_TIMEOUT',
        'Cloudmersive request timed out',
      )
    }
    throw new ContractPdfError(
      'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
      'Cloudmersive network error',
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const bodyText = await res.text().catch(() => '')
    throw mapCloudmersiveHttpError({ status: res.status, bodyText })
  }

  const bytes = new Uint8Array(await res.arrayBuffer())
  assertPdfBytes(bytes, maxPdfBytes)

  return { pdfBytes: bytes, provider: 'cloudmersive' }
}

export type { ContractPdfErrorCode }
