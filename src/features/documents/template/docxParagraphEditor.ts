/**
 * Light DOCX paragraph editor: extract / replace text in word/document.xml
 * while preserving runs, styles, headers, footers, tables, images.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/** Extract visible text from a paragraph node (concatenated w:t). */
function paragraphPlainText(paragraphXml: string): string {
  const parts: string[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(paragraphXml))) {
    parts.push(unescapeXml(m[1] ?? ''))
  }
  return parts.join('')
}

/**
 * Replace all text in a paragraph with a single run, keeping the first run's rPr if present.
 */
function replaceParagraphText(paragraphXml: string, nextText: string): string {
  const firstRunMatch = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/)
  let rPr = ''
  if (firstRunMatch) {
    const pr = firstRunMatch[0].match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)
    if (pr) rPr = pr[0]
  }

  const pPrMatch = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)
  const pPr = pPrMatch ? pPrMatch[0] : ''

  const escaped = escapeXml(nextText)
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r>`
  return `<w:p>${pPr}${run}</w:p>`
}

export interface DocxParagraph {
  index: number
  text: string
}

export async function extractDocxParagraphs(
  bytes: ArrayBuffer,
): Promise<DocxParagraph[]> {
  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return []
  const xml = await docFile.async('string')
  const paragraphs: DocxParagraph[] = []
  const re = /<w:p\b[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(xml))) {
    const text = paragraphPlainText(m[0])
    if (text.trim()) {
      paragraphs.push({ index, text })
    }
    index += 1
  }
  return paragraphs
}

/**
 * Apply edited paragraph texts (by original index) back into the DOCX.
 * Unmentioned paragraphs are left unchanged.
 */
export async function applyDocxParagraphEdits(
  bytes: ArrayBuffer,
  edits: Array<{ index: number; text: string }>,
): Promise<ArrayBuffer> {
  const byIndex = new Map(edits.map((e) => [e.index, e.text]))
  if (byIndex.size === 0) return cloneArrayBuffer(bytes)

  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return cloneArrayBuffer(bytes)

  const xml = await docFile.async('string')
  let index = 0
  const nextXml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const currentIndex = index
    index += 1
    if (!byIndex.has(currentIndex)) return paragraphXml
    return replaceParagraphText(paragraphXml, byIndex.get(currentIndex)!)
  })

  zip.file('word/document.xml', nextXml)
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })
}

/** Build a printable HTML document from DOCX paragraph texts. */
export function paragraphsToPrintHtml(
  title: string,
  paragraphs: DocxParagraph[],
): string {
  const body = paragraphs
    .map((p) => `<p>${escapeXml(p.text).replace(/\n/g, '<br/>')}</p>`)
    .join('\n')
  return `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(title)}</title>
  <style>
    @page { margin: 2cm; }
    body {
      font-family: "Times New Roman", Times, serif;
      font-size: 12pt;
      line-height: 1.45;
      color: #111;
      max-width: 42rem;
      margin: 0 auto;
      padding: 1.5rem;
    }
    p { margin: 0 0 0.65em; white-space: pre-wrap; }
  </style>
</head>
<body>
${body}
</body>
</html>`
}
