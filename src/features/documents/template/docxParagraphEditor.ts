/**
 * Light DOCX paragraph editor: extract / replace text in word/document.xml
 * while preserving runs, styles, headers, footers, tables, images.
 *
 * Paragraph text / offsets always use the shared canonical model.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import {
  buildParagraphRunModel,
  canonicalizeParagraphText,
  escapeXml,
  extractCanonicalParagraphText,
  unescapeXml,
} from './canonicalParagraph'

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
    const text = extractCanonicalParagraphText(m[0]!)
    if (text.trim()) {
      paragraphs.push({ index, text })
    }
    index += 1
  }
  return paragraphs
}

/**
 * Replace a canonical character span inside a paragraph XML, preserving
 * unaffected runs and the formatting of the first overlapped run.
 */
export function replaceCanonicalSpanInParagraphXml(
  paragraphXml: string,
  start: number,
  end: number,
  replacement: string,
): string {
  const model = buildParagraphRunModel(paragraphXml)
  if (start < 0 || end <= start || end > model.canonicalText.length) {
    throw new Error('Grounded DOCX span is out of range')
  }
  const mapped = mapCanonicalRangeToTextNodes(paragraphXml, start, end)
  if (!mapped) throw new Error('Grounded DOCX span cannot be mapped safely')
  return spliceTextNodes(paragraphXml, mapped, replacement)
}

export type GroundedTextSpan = { start: number; end: number }
export type GroundedSpanResult =
  | { ok: true; span: GroundedTextSpan }
  | { ok: false; reason: 'missing' | 'ambiguous' | 'invalid_occurrence' | 'unmappable' }

/** Locate literal canonical visible text. occurrenceIndex is zero-based among exact matches. */
export function locateGroundedTextSpan(
  paragraphXml: string,
  literalAnchor: string,
  occurrenceIndex?: number,
): GroundedSpanResult {
  const anchor = canonicalizeParagraphText(literalAnchor)
  if (!anchor) return { ok: false, reason: 'missing' }
  const text = extractCanonicalParagraphText(paragraphXml)
  const matches: number[] = []
  let from = 0
  while (from <= text.length - anchor.length) {
    const at = text.indexOf(anchor, from)
    if (at < 0) break
    matches.push(at)
    from = at + 1
  }
  if (!matches.length) return { ok: false, reason: 'missing' }
  if (occurrenceIndex === undefined && matches.length !== 1) {
    return { ok: false, reason: 'ambiguous' }
  }
  if (occurrenceIndex !== undefined && (!Number.isInteger(occurrenceIndex) || occurrenceIndex < 0 || occurrenceIndex >= matches.length)) {
    return { ok: false, reason: 'invalid_occurrence' }
  }
  const start = matches[occurrenceIndex ?? 0]!
  const end = start + anchor.length
  if (!mapCanonicalRangeToTextNodes(paragraphXml, start, end)) return { ok: false, reason: 'unmappable' }
  return { ok: true, span: { start, end } }
}

/** Replacement inherits the first source character's run/text-node formatting. */
export function replaceGroundedTextSpan(
  paragraphXml: string,
  span: GroundedTextSpan,
  replacement: string,
): string {
  return replaceCanonicalSpanInParagraphXml(paragraphXml, span.start, span.end, replacement)
}

type TextNode = { start: number; end: number; decoded: string; raw: string; charStarts: number[]; charEnds: number[] }
type MappedRange = { firstNode: number; firstOffset: number; lastNode: number; lastOffset: number }

function mapCanonicalRangeToTextNodes(xml: string, start: number, end: number): MappedRange | null {
  const nodes: TextNode[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  let canonical = ''
  while ((m = re.exec(xml))) {
    const raw = m[1] ?? ''
    const decoded = unescapeXml(raw)
    const charStarts: number[] = []
    const charEnds: number[] = []
    let rawOffset = 0
    for (let i = 0; i < decoded.length; i++) {
      charStarts.push(rawOffset)
      const entity = raw.slice(rawOffset).match(/^&(?:lt|gt|quot|apos|amp);/)
      rawOffset += entity ? entity[0].length : 1
      charEnds.push(rawOffset)
    }
    const node = { start: m.index + m[0].indexOf('>') + 1, end: m.index + m[0].lastIndexOf('</w:t>'), decoded, raw, charStarts, charEnds }
    nodes.push(node)
    canonical += decoded
  }
  const normalized = canonicalizeParagraphText(canonical)
  if (normalized.length !== canonical.length || normalized !== extractCanonicalParagraphText(xml)) return null
  if (end > normalized.length) return null
  let offset = 0
  let firstNode = -1, firstOffset = -1, lastNode = -1, lastOffset = -1
  for (let ni = 0; ni < nodes.length; ni++) {
    const node = nodes[ni]!
    for (let ci = 0; ci < node.decoded.length; ci++, offset++) {
      if (offset === start) { firstNode = ni; firstOffset = ci }
      if (offset === end - 1) { lastNode = ni; lastOffset = ci + 1 }
    }
  }
  if (firstNode < 0 || lastNode < 0) return null
  // Reject hidden OOXML content between the first and last text nodes.
  const first = nodes[firstNode]!, last = nodes[lastNode]!
  const between = xml.slice(first.end, last.start)
    .replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/g, '')
    .replace(/<\/?w:r\b[^>]*>/g, '')
    .replace(/<\/?w:t\b[^>]*>/g, '')
    .replace(/<\/?w:hyperlink\b[^>]*>/g, '')
  if (/<w:|<\//.test(between)) return null
  return { firstNode, firstOffset, lastNode, lastOffset }
}

function spliceTextNodes(xml: string, range: MappedRange, replacement: string): string {
  const nodes = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  const edits: Array<{ start: number; end: number; value: string }> = []
  for (let i = range.firstNode; i <= range.lastNode; i++) {
    const m = nodes[i]!
    const contentStart = m.index! + m[0].indexOf('>') + 1
    const contentEnd = m.index! + m[0].lastIndexOf('</w:t>')
    const raw = m[1] ?? ''
    const decoded = unescapeXml(raw)
    const charStarts: number[] = []
    const charEnds: number[] = []
    let rawOffset = 0
    for (let ci = 0; ci < decoded.length; ci++) {
      charStarts.push(rawOffset)
      const entity = raw.slice(rawOffset).match(/^&(?:lt|gt|quot|apos|amp);/)
      rawOffset += entity ? entity[0].length : 1
      charEnds.push(rawOffset)
    }
    const from = i === range.firstNode ? (charStarts[range.firstOffset] ?? raw.length) : 0
    const to = i === range.lastNode ? (range.lastOffset > 0 ? charEnds[range.lastOffset - 1]! : 0) : raw.length
    const value = raw.slice(0, from) + (i === range.firstNode ? escapeXml(replacement) : '') + raw.slice(to)
    edits.push({ start: contentStart, end: contentEnd, value })
  }
  let result = xml
  for (const edit of edits.reverse()) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  return result
}

/**
 * Replace all text in a paragraph with a single run, keeping the first run's rPr.
 */
function replaceParagraphTextWhole(
  paragraphXml: string,
  nextText: string,
  opts?: { stripListNumbering?: boolean },
): string {
  const firstRunMatch = paragraphXml.match(/<w:r\b[\s\S]*?<\/w:r>/)
  let rPr = ''
  if (firstRunMatch) {
    const pr = firstRunMatch[0].match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)
    if (pr) rPr = pr[0]
  }

  const pPrMatch = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)
  let pPr = pPrMatch ? pPrMatch[0] : ''
  if (opts?.stripListNumbering && pPr) {
    pPr = stripParagraphListNumbering(pPr)
  }

  const escaped = escapeXml(nextText)
  const run = `<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r>`
  return `<w:p>${pPr}${run}</w:p>`
}

/**
 * Remove Word numbering properties from paragraph properties so cloned
 * insertions do not continue an outer numbered list (CG7 extras integrity).
 */
export function stripParagraphListNumbering(pPrXml: string): string {
  let next = pPrXml.replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, '')
  next = next.replace(/<w:numPr\b[^]*?\/>/g, '')
  // Empty <w:pPr></w:pPr> → drop entirely
  if (/^<w:pPr\b[^>]*\/>$/.test(next.trim()) || /^<w:pPr\b[^>]*>\s*<\/w:pPr>$/.test(next.trim())) {
    return ''
  }
  return next
}

export type DocxParagraphInsertion = {
  /** Insert new paragraphs immediately after this document paragraph index. */
  afterIndex: number
  paragraphs: string[]
  /**
   * 'detach' (default for contract extras): strip numPr from cloned pPr.
   * 'inherit': keep anchor list numbering (rare; existing list continuity).
   */
  listNumbering?: 'detach' | 'inherit'
}

export type DocxParagraphEdit = {
  index: number
  text: string
  /** Optional: replace only this canonical span instead of whole paragraph. */
  span?: { start: number; end: number; replacement: string }
}

/**
 * Apply edited paragraph texts (by original index) back into the DOCX.
 * Unmentioned paragraphs are left unchanged.
 *
 * When optional spanEdits are provided, only those character ranges are
 * rewritten (multi-run aware). Multiple spans on the same paragraph are
 * applied right-to-left so earlier offsets stay valid.
 * Otherwise the whole paragraph text is replaced.
 */
export async function applyDocxParagraphEdits(
  bytes: ArrayBuffer,
  edits: DocxParagraphEdit[],
): Promise<ArrayBuffer> {
  const byIndex = new Map<number, DocxParagraphEdit[]>()
  for (const e of edits) {
    const list = byIndex.get(e.index) ?? []
    list.push(e)
    byIndex.set(e.index, list)
  }
  if (byIndex.size === 0) return cloneArrayBuffer(bytes)

  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return cloneArrayBuffer(bytes)

  const xml = await docFile.async('string')
  let index = 0
  const nextXml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, (paragraphXml) => {
    const currentIndex = index
    index += 1
    const editList = byIndex.get(currentIndex)
    if (!editList || editList.length === 0) return paragraphXml

    const spanEdits = editList
      .filter((e) => e.span)
      .sort((a, b) => (b.span!.start) - (a.span!.start))

    if (spanEdits.length > 0) {
      let next = paragraphXml
      for (const edit of spanEdits) {
        const span = edit.span!
        next = replaceCanonicalSpanInParagraphXml(
          next,
          span.start,
          span.end,
          span.replacement,
        )
      }
      return next
    }

    // Whole-paragraph rewrite — last text wins if duplicates exist.
    const last = editList[editList.length - 1]!
    return replaceParagraphTextWhole(
      paragraphXml,
      canonicalizeParagraphText(last.text),
    )
  })

  zip.file('word/document.xml', nextXml)
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })
}

/**
 * Insert new paragraphs after specific document indices (sorted internally).
 * Clones paragraph properties from the anchor paragraph for consistent styling.
 * By default detaches Word list numbering (numPr) so inserted extras do not
 * continue outer legal-clause numbers (CG7).
 */
export async function applyDocxParagraphInsertions(
  bytes: ArrayBuffer,
  insertions: DocxParagraphInsertion[],
): Promise<ArrayBuffer> {
  if (insertions.length === 0) return cloneArrayBuffer(bytes)

  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return cloneArrayBuffer(bytes)

  const xml = await docFile.async('string')
  const paragraphRe = /<w:p\b[\s\S]*?<\/w:p>/g
  const paragraphs: string[] = []
  let m: RegExpExecArray | null
  while ((m = paragraphRe.exec(xml))) {
    paragraphs.push(m[0]!)
  }

  type Pending = { text: string; listNumbering: 'detach' | 'inherit' }
  const byAfter = new Map<number, Pending[]>()
  for (const ins of insertions) {
    const existing = byAfter.get(ins.afterIndex) ?? []
    const mode = ins.listNumbering ?? 'detach'
    byAfter.set(ins.afterIndex, [
      ...existing,
      ...ins.paragraphs.map((text) => ({ text, listNumbering: mode })),
    ])
  }

  const nextParagraphs: string[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    nextParagraphs.push(paragraphs[i]!)
    const toInsert = byAfter.get(i)
    if (!toInsert?.length) continue
    const template = paragraphs[i]!
    for (const item of toInsert) {
      nextParagraphs.push(
        replaceParagraphTextWhole(template, canonicalizeParagraphText(item.text), {
          stripListNumbering: item.listNumbering !== 'inherit',
        }),
      )
    }
  }

  let idx = 0
  let nextXml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, () => {
    const next = nextParagraphs[idx] ?? paragraphs[idx]!
    idx += 1
    return next
  })

  if (idx < nextParagraphs.length) {
    const tail = nextParagraphs.slice(idx).join('')
    const closeBody = nextXml.indexOf('</w:body>')
    if (closeBody >= 0) {
      nextXml =
        nextXml.slice(0, closeBody) + tail + nextXml.slice(closeBody)
    }
  }

  zip.file('word/document.xml', nextXml)
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })
}

/** Apply paragraph text edits, then optional insertions after specific indices. */
export async function applyDocxParagraphEditsAndInsertions(
  bytes: ArrayBuffer,
  edits: DocxParagraphEdit[],
  insertions: DocxParagraphInsertion[] = [],
): Promise<ArrayBuffer> {
  const edited = await applyDocxParagraphEdits(bytes, edits)
  return applyDocxParagraphInsertions(edited, insertions)
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
