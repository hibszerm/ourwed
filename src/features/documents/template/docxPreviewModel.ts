/**
 * OOXML-aware preview model — renders from the generated DOCX bytes while
 * preserving paragraph properties (alignment, indent, spacing) as CSS.
 *
 * Not pixel-identical to Word; the downloaded DOCX remains authoritative.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { extractCanonicalParagraphText, unescapeXml } from './canonicalParagraph'

export interface DocxPreviewRun {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  fontSizePt?: number | null
  fontFamily?: string | null
}

export interface DocxPreviewParagraph {
  index: number
  text: string
  runs: DocxPreviewRun[]
  align: 'left' | 'center' | 'right' | 'both' | 'start' | 'end'
  indentLeftTwips: number
  indentFirstTwips: number
  spacingBeforeTwips: number
  spacingAfterTwips: number
  lineTwips: number | null
  pageBreakBefore: boolean
}

export interface DocxPreviewModel {
  paragraphs: DocxPreviewParagraph[]
  pageWidthTwips: number
  pageHeightTwips: number
  marginTopTwips: number
  marginBottomTwips: number
  marginLeftTwips: number
  marginRightTwips: number
  source: 'generated_docx'
}

function attr(xml: string, name: string): string | null {
  const m = new RegExp(`${name}="([^"]*)"`).exec(xml)
  return m ? m[1]! : null
}

function twips(value: string | null): number {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function mapAlign(
  jc: string | null,
): DocxPreviewParagraph['align'] {
  switch (jc) {
    case 'center':
      return 'center'
    case 'right':
      return 'right'
    case 'both':
    case 'distribute':
      return 'both'
    case 'end':
      return 'end'
    case 'start':
      return 'start'
    default:
      return 'left'
  }
}

function parseParagraphPreview(
  paragraphXml: string,
  index: number,
): DocxPreviewParagraph {
  const pPr = /<w:pPr\b[\s\S]*?<\/w:pPr>/.exec(paragraphXml)?.[0] ?? ''
  const jc = attr(/<w:jc\b[^/]*\/>/.exec(pPr)?.[0] ?? '', 'w:val')
  const ind = /<w:ind\b[^/]*\/>/.exec(pPr)?.[0] ?? ''
  const spacing = /<w:spacing\b[^/]*\/>/.exec(pPr)?.[0] ?? ''
  const pageBreakBefore = /<w:pageBreakBefore\b/.test(pPr)

  const runs: DocxPreviewRun[] = []
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g
  let rm: RegExpExecArray | null
  while ((rm = runRe.exec(paragraphXml))) {
    const runXml = rm[0]!
    const rPr = /<w:rPr\b[\s\S]*?<\/w:rPr>/.exec(runXml)?.[0] ?? ''
    const texts: string[] = []
    const tRe = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
    let tm: RegExpExecArray | null
    while ((tm = tRe.exec(runXml))) {
      texts.push(unescapeXml(tm[1] ?? ''))
    }
    if (/<w:tab\b/.test(runXml)) texts.push('\t')
    if (/<w:br\b/.test(runXml)) texts.push('\n')
    const text = texts.join('')
    if (!text && !/<w:tab\b|<w:br\b/.test(runXml)) continue
    const sz = attr(/<w:sz\b[^/]*\/>/.exec(rPr)?.[0] ?? '', 'w:val')
    const ascii = attr(/<w:rFonts\b[^/]*\/>/.exec(rPr)?.[0] ?? '', 'w:ascii')
    runs.push({
      text,
      bold: /<w:b\b/.test(rPr),
      italic: /<w:i\b/.test(rPr),
      underline: /<w:u\b/.test(rPr),
      fontSizePt: sz ? Number(sz) / 2 : null,
      fontFamily: ascii,
    })
  }

  const canonical = extractCanonicalParagraphText(paragraphXml)
  return {
    index,
    text: canonical,
    runs: runs.length > 0 ? runs : [{ text: canonical }],
    align: mapAlign(jc),
    indentLeftTwips: twips(attr(ind, 'w:left') ?? attr(ind, 'w:start')),
    indentFirstTwips: twips(attr(ind, 'w:firstLine')),
    spacingBeforeTwips: twips(attr(spacing, 'w:before')),
    spacingAfterTwips: twips(attr(spacing, 'w:after')),
    lineTwips: (() => {
      const line = attr(spacing, 'w:line')
      return line ? twips(line) : null
    })(),
    pageBreakBefore,
  }
}

function parseSectPr(xml: string): Pick<
  DocxPreviewModel,
  | 'pageWidthTwips'
  | 'pageHeightTwips'
  | 'marginTopTwips'
  | 'marginBottomTwips'
  | 'marginLeftTwips'
  | 'marginRightTwips'
> {
  const sect = /<w:sectPr\b[\s\S]*?<\/w:sectPr>/g
  let last: string | null = null
  let m: RegExpExecArray | null
  while ((m = sect.exec(xml))) last = m[0]
  const block = last ?? ''
  const pgSz = /<w:pgSz\b[^/]*\/>/.exec(block)?.[0] ?? ''
  const pgMar = /<w:pgMar\b[^/]*\/>/.exec(block)?.[0] ?? ''
  return {
    pageWidthTwips: twips(attr(pgSz, 'w:w')) || 11906,
    pageHeightTwips: twips(attr(pgSz, 'w:h')) || 16838,
    marginTopTwips: twips(attr(pgMar, 'w:top')) || 1440,
    marginBottomTwips: twips(attr(pgMar, 'w:bottom')) || 1440,
    marginLeftTwips: twips(attr(pgMar, 'w:left')) || 1440,
    marginRightTwips: twips(attr(pgMar, 'w:right')) || 1440,
  }
}

/** Build a preview model from the exact generated DOCX artifact. */
export async function buildDocxPreviewModel(
  docxBytes: ArrayBuffer,
): Promise<DocxPreviewModel> {
  const zip = await JSZip.loadAsync(cloneArrayBuffer(docxBytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) {
    return {
      paragraphs: [],
      pageWidthTwips: 11906,
      pageHeightTwips: 16838,
      marginTopTwips: 1440,
      marginBottomTwips: 1440,
      marginLeftTwips: 1440,
      marginRightTwips: 1440,
      source: 'generated_docx',
    }
  }
  const xml = await docFile.async('string')
  const paragraphs: DocxPreviewParagraph[] = []
  const re = /<w:p\b[\s\S]*?<\/w:p>/g
  let m: RegExpExecArray | null
  let index = 0
  while ((m = re.exec(xml))) {
    paragraphs.push(parseParagraphPreview(m[0]!, index))
    index += 1
  }
  return {
    paragraphs,
    ...parseSectPr(xml),
    source: 'generated_docx',
  }
}

export function twipsToPx(twips: number, dpi = 96): number {
  return (twips / 1440) * dpi
}
