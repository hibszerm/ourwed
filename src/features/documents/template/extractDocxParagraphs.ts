/**
 * Shared DOCX paragraph extraction with stable indices (includes empty paras).
 * Import binding and contract generation MUST use the same indexing + canonical text.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { extractCanonicalParagraphText } from './canonicalParagraph'

export interface IndexedParagraph {
  index: number
  /** Canonical paragraph text — offsets are only valid in this form. */
  text: string
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
    paragraphs.push({
      index,
      text: extractCanonicalParagraphText(m[0]!),
    })
    index += 1
  }
  return paragraphs
}

/** Fingerprint for recovering a paragraph if offsets shift. */
export function paragraphFingerprint(text: string): string {
  const n = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  return n
}
