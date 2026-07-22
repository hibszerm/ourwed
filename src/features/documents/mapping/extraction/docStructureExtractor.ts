import type { DocumentExtractInput } from './documentTextExtractor'
import type { DocumentStructureExtractor } from './docxStructureExtractor'
import { docxStructureExtractor } from './docxStructureExtractor'
import type {
  DocumentBlock,
  DocumentStructure,
} from '../preview/documentNodes'
import { toArrayBuffer } from './sourceKind'

/**
 * Legacy .doc (OLE) best-effort text extraction for AI analysis + preview.
 * If the file is actually OOXML (misnamed), delegates to DOCX extractor.
 */
export const docStructureExtractor: DocumentStructureExtractor = {
  id: 'doc-structure',
  version: '1.0.0',

  async extract(input: DocumentExtractInput): Promise<DocumentStructure> {
    const bytes = await toArrayBuffer(input)
    const u8 = new Uint8Array(bytes)

    // Misnamed DOCX
    if (u8[0] === 0x50 && u8[1] === 0x4b) {
      return docxStructureExtractor.extract(bytes)
    }

    const text = extractReadableText(u8)
    if (!text.trim()) {
      throw new Error(
        'Nie udało się odczytać pliku DOC. Zapisz kontrakt jako DOCX lub PDF i spróbuj ponownie.',
      )
    }

    const lines = text
      .split(/\r\n|\n|\r/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean)

    const blocks: DocumentBlock[] = []
    const parts: string[] = []
    let cursor = 0

    for (const line of lines) {
      if (parts.length > 0) {
        parts.push('\n')
        cursor += 1
      }
      const start = cursor
      parts.push(line)
      cursor += line.length
      blocks.push({
        type: 'paragraph',
        children: [{ type: 'text', text: line, start, end: cursor }],
        start,
        end: cursor,
      })
    }

    return {
      extractorVersion: this.version,
      blocks,
      plainText: parts.join(''),
    }
  },
}

/** Pull printable UTF-16LE / ASCII runs from OLE binary (heuristic). */
function extractReadableText(u8: Uint8Array): string {
  const chunks: string[] = []

  // UTF-16LE runs (common in WordDocument stream)
  let run = ''
  for (let i = 0; i + 1 < u8.length; i += 2) {
    const code = u8[i]! | (u8[i + 1]! << 8)
    if (code === 0x0a || code === 0x0d) {
      run += '\n'
    } else if (code >= 0x20 && code < 0xfffe && code !== 0xfeff) {
      // Basic multilingual plane printable-ish
      if (code < 0xd800 || code > 0xdfff) {
        run += String.fromCharCode(code)
      }
    } else {
      if (run.replace(/\s/g, '').length >= 12) chunks.push(run)
      run = ''
    }
  }
  if (run.replace(/\s/g, '').length >= 12) chunks.push(run)

  // ASCII fallback if UTF-16 yielded little
  if (chunks.join('').replace(/\s/g, '').length < 40) {
    let ascii = ''
    for (let i = 0; i < u8.length; i++) {
      const c = u8[i]!
      if (c === 0x0a || c === 0x0d) ascii += '\n'
      else if (c >= 0x20 && c <= 0x7e) ascii += String.fromCharCode(c)
      else ascii += ' '
    }
    return ascii.replace(/[ \t]{2,}/g, ' ')
  }

  return chunks.join('\n')
}
