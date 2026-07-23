/**
 * Shared DOCX paragraph extraction with stable indices (includes empty paras).
 * Import binding and contract generation MUST use the same indexing.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'

export interface IndexedParagraph {
  index: number
  text: string
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

export async function extractDocxParagraphsIncludingEmpty(
  bytes: ArrayBuffer,
): Promise<IndexedParagraph[]> {
  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return []
  const xml = await docFile.async('string')
  const paragraphs: IndexedParagraph[] = []
  const re = /<w:p\b[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(xml))) {
    const parts: string[] = []
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(m[0]!))) {
      parts.push(unescapeXml(tm[1] ?? ''))
    }
    paragraphs.push({ index, text: parts.join('') })
    index += 1
  }
  return paragraphs
}

/** Fingerprint for recovering a paragraph if offsets shift. */
export function paragraphFingerprint(text: string): string {
  const n = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  return n
}
