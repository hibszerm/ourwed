/**
 * Gotenberg / LibreOffice DocxToPdfProvider wrapper.
 * Reuses existing convertDocxViaGotenberg — does not change production wiring.
 */

import {
  convertDocxViaGotenberg,
  readGotenbergConfig,
  type EnvGetter,
  type GotenbergConfig,
} from '../../../../../supabase/functions/docx-to-pdf/gotenbergConvert.ts'
import { ContractPdfError } from './errors'
import type {
  ConvertDocxToPdfInput,
  ConvertDocxToPdfResult,
  DocxToPdfProvider,
} from './types'

export function createGotenbergDocxToPdfProvider(input: {
  env?: EnvGetter
  config?: Extract<GotenbergConfig, { ok: true }>
  maxPdfBytes?: number
  fetchImpl?: typeof fetch
}): DocxToPdfProvider {
  const maxPdfBytes = input.maxPdfBytes ?? 40 * 1024 * 1024

  return {
    id: 'gotenberg',
    async convertDocxToPdf(
      req: ConvertDocxToPdfInput,
    ): Promise<ConvertDocxToPdfResult> {
      const config =
        input.config ??
        readGotenbergConfig(
          input.env ?? { get: (k) => process.env[k] },
        )
      if (!config.ok) {
        throw new ContractPdfError(
          'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
          config.message,
        )
      }
      try {
        const { pdfBytes } = await convertDocxViaGotenberg({
          docxBytes: req.docxBytes,
          filename: req.filename,
          config,
          maxPdfBytes,
          fetchImpl: input.fetchImpl,
        })
        return { pdfBytes, provider: 'gotenberg' }
      } catch (e) {
        if (e instanceof ContractPdfError) throw e
        const msg = e instanceof Error ? e.message : String(e)
        if (msg === 'timeout') {
          throw new ContractPdfError('CONTRACT_PDF_TIMEOUT', 'Gotenberg timed out')
        }
        if (msg.startsWith('gotenberg_http_')) {
          const status = Number(msg.replace('gotenberg_http_', ''))
          if (status === 429) {
            throw new ContractPdfError(
              'CONTRACT_PDF_LIMIT_REACHED',
              'Gotenberg rate limited',
              status,
            )
          }
          if (status === 502 || status === 503) {
            throw new ContractPdfError(
              'CONTRACT_PDF_PROVIDER_UNAVAILABLE',
              'Gotenberg unavailable',
              status,
            )
          }
        }
        throw new ContractPdfError(
          'CONTRACT_PDF_CONVERSION_FAILED',
          'Gotenberg conversion failed',
        )
      }
    },
  }
}
