/**
 * Intermediate document model for read-only DOCX preview.
 * Offsets refer to the same plainText used by DocumentAnalyzer field detection.
 */

export interface DocumentMarks {
  bold?: boolean
  italic?: boolean
}

export interface DocumentTextRun {
  type: 'text'
  text: string
  marks?: DocumentMarks
  start: number
  end: number
}

export interface DocumentLineBreak {
  type: 'break'
  start: number
  end: number
}

export type DocumentInline = DocumentTextRun | DocumentLineBreak

export type DocumentBlockType = 'paragraph' | 'heading' | 'list-item'

export interface DocumentBlock {
  type: DocumentBlockType
  /** Heading level 1–6 when type === 'heading'. */
  level?: number
  /** List nesting depth when type === 'list-item'. */
  listLevel?: number
  listKind?: 'bullet' | 'number'
  /** 1-based index for numbered lists (display). */
  listIndex?: number
  children: DocumentInline[]
  start: number
  end: number
}

export interface DocumentStructure {
  extractorVersion: string
  blocks: DocumentBlock[]
  /** Canonical plain text — field offsets are relative to this string. */
  plainText: string
}
