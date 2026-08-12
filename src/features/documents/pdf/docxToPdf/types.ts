/**
 * Narrow DOCX → PDF conversion boundary.
 * Separate from HTML → PDFShift (`pdfRenderer`).
 */

export type DocxToPdfProviderId = 'gotenberg' | 'cloudmersive'

export type { ContractPdfErrorCode } from './errors'

export type ConvertDocxToPdfInput = {
  docxBytes: Uint8Array
  filename: string
}

export type ConvertDocxToPdfResult = {
  pdfBytes: Uint8Array
  provider: DocxToPdfProviderId
}

export type DocxToPdfProvider = {
  id: DocxToPdfProviderId
  convertDocxToPdf(input: ConvertDocxToPdfInput): Promise<ConvertDocxToPdfResult>
}
