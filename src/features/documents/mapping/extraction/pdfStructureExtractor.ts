import * as pdfjs from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { DocumentExtractInput } from './documentTextExtractor'
import type { DocumentStructureExtractor } from './docxStructureExtractor'
import type {
  DocumentBlock,
  DocumentStructure,
} from '../preview/documentNodes'
import { toArrayBuffer } from './sourceKind'

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker

/**
 * PDF → DocumentStructure + plainText (pdf.js).
 * Each non-empty line becomes a paragraph block with stable offsets.
 */
export const pdfStructureExtractor: DocumentStructureExtractor = {
  id: 'pdf-structure',
  version: '1.0.0',

  async extract(input: DocumentExtractInput): Promise<DocumentStructure> {
    const bytes = await toArrayBuffer(input)
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) })
    const pdf = await loadingTask.promise

    const blocks: DocumentBlock[] = []
    const textParts: string[] = []
    let cursor = 0

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const lineBuf: string[] = []
      let lastY: number | null = null

      const flushLine = () => {
        const line = lineBuf.join('').replace(/\s+/g, ' ').trim()
        lineBuf.length = 0
        if (!line) return
        if (textParts.length > 0) {
          textParts.push('\n')
          cursor += 1
        }
        const start = cursor
        textParts.push(line)
        cursor += line.length
        blocks.push({
          type: 'paragraph',
          children: [{ type: 'text', text: line, start, end: cursor }],
          start,
          end: cursor,
        })
      }

      for (const item of content.items) {
        if (!('str' in item)) continue
        const str = String(item.str ?? '')
        if (!str) continue
        const transform = 'transform' in item ? item.transform : null
        const y =
          Array.isArray(transform) && typeof transform[5] === 'number'
            ? transform[5]
            : null

        if (lastY != null && y != null && Math.abs(lastY - y) > 2) {
          flushLine()
        }
        if (lineBuf.length > 0 && !lineBuf[lineBuf.length - 1]!.endsWith(' ')) {
          // pdf.js often splits words; keep spaces between items on same line
          const prev = lineBuf[lineBuf.length - 1]!
          if (!/^\s/.test(str) && !/\s$/.test(prev)) {
            lineBuf.push(' ')
          }
        }
        lineBuf.push(str)
        if (y != null) lastY = y
      }
      flushLine()
    }

    return {
      extractorVersion: this.version,
      blocks,
      plainText: textParts.join(''),
    }
  },
}
