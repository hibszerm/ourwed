/**
 * Pluggable plain-text extraction from source documents.
 * Phase 2: minimal DOCX text only. Future: richer parsers without UI changes.
 */

export type DocumentExtractInput = Blob | ArrayBuffer | Uint8Array | File

export interface DocumentTextExtractor {
  readonly id: string
  readonly version: string
  extract(input: DocumentExtractInput): Promise<string>
}
