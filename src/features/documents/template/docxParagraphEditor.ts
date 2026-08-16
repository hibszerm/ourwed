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
} from './canonicalParagraph'
import { devInfoArgs, devWarnArgs } from '@/lib/debug/devConsole'

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

function rebuildParagraphText(
  canonicalText: string,
  start: number,
  end: number,
  replacement: string,
): {
  beforeText: string
  slotText: string
  afterText: string
  rebuiltParagraph: string
} {
  const safeStart = Math.max(0, Math.min(start, canonicalText.length))
  const safeEnd = Math.max(safeStart, Math.min(end, canonicalText.length))
  const beforeText = canonicalText.slice(0, safeStart)
  const slotText = canonicalText.slice(safeStart, safeEnd)
  const afterText = canonicalText.slice(safeEnd)
  const rebuiltParagraph = beforeText + replacement + afterText
  devInfoArgs('[contract-paragraph-rebuild]', {
    beforeText,
    slotText,
    afterText,
    rebuiltParagraph,
    start,
    end,
    safeStart,
    safeEnd,
    replacement,
  })
  return { beforeText, slotText, afterText, rebuiltParagraph }
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
  const { rebuiltParagraph } = rebuildParagraphText(
    model.canonicalText,
    start,
    end,
    replacement,
  )

  // Out-of-range spans: always rebuild full paragraph from before+repl+after.
  // Never write only `replacement` as the paragraph body.
  if (start < 0 || end < start || end > model.canonicalText.length) {
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }

  // Identify overlapped runs via charMap
  const overlapped = new Set<number>()
  for (let i = start; i < end; i++) {
    const entry = model.charMap[i]
    if (entry) overlapped.add(entry.runIndex)
  }

  if (overlapped.size === 0) {
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }

  // Prefer whole-paragraph rewrite when charMap collapsed to synthetic run,
  // or when many runs are affected — still preserves pPr + first rPr.
  if (
    model.charMap.length > 0 &&
    model.charMap.every((c) => c.runIndex === 0) &&
    model.runs.length > 1
  ) {
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }

  // Multi-run precise replace: clear overlapped runs, put replacement in first.
  const runRe = /<w:r\b[\s\S]*?<\/w:r>/g
  const runXmls: string[] = []
  let rm: RegExpExecArray | null
  while ((rm = runRe.exec(paragraphXml))) {
    runXmls.push(rm[0]!)
  }

  const firstOverlapped = Math.min(...overlapped)
  const lastOverlapped = Math.max(...overlapped)

  // Span crosses runs — rewrite whole paragraph text into one run.
  if (lastOverlapped !== firstOverlapped) {
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }

  // Span is inside a single run — rewrite only that run's text, keep siblings.
  const runIdx = firstOverlapped
  const runCanonical = model.runs[runIdx]?.canonicalText ?? ''
  const entryStart = model.charMap[start]
  const entryEnd = model.charMap[Math.max(start, end - 1)]
  if (!entryStart || !entryEnd || entryStart.runIndex !== runIdx) {
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }

  const localStart = entryStart.localOffset
  const localEnd = entryEnd.localOffset + (end > start ? 1 : 0)
  const nextRunText =
    runCanonical.slice(0, localStart) +
    replacement +
    runCanonical.slice(localEnd)

  // Guard: single-run rewrite must equal full before+repl+after when this
  // run is the only text-bearing run; otherwise verify via siblings.
  const nextRuns = runXmls.map((rx, i) => {
    if (i !== runIdx) return rx
    return replaceRunText(rx, nextRunText)
  })

  const pPrMatch = paragraphXml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)
  const pPr = pPrMatch ? pPrMatch[0] : ''
  const nextXml = `<w:p>${pPr}${nextRuns.join('')}</w:p>`

  const actual = extractCanonicalParagraphText(nextXml)
  if (actual !== rebuiltParagraph) {
    devWarnArgs(
      '[contract-paragraph-rebuild] single-run rewrite mismatch — falling back to whole paragraph',
      { expected: rebuiltParagraph, actual },
    )
    return replaceParagraphTextWhole(paragraphXml, rebuiltParagraph)
  }
  return nextXml
}

function replaceRunText(runXml: string, nextText: string): string {
  const rPrMatch = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)
  const rPr = rPrMatch ? rPrMatch[0] : ''
  const escaped = escapeXml(nextText)
  return `<w:r>${rPr}<w:t xml:space="preserve">${escaped}</w:t></w:r>`
}

/**
 * Replace all text in a paragraph with a single run, keeping the first run's rPr.
 */
function replaceParagraphTextWhole(
  paragraphXml: string,
  nextText: string,
): string {
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

export type DocxParagraphInsertion = {
  /** Insert new paragraphs immediately after this document paragraph index. */
  afterIndex: number
  paragraphs: string[]
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

  const byAfter = new Map<number, string[]>()
  for (const ins of insertions) {
    const existing = byAfter.get(ins.afterIndex) ?? []
    byAfter.set(ins.afterIndex, [...existing, ...ins.paragraphs])
  }

  const nextParagraphs: string[] = []
  for (let i = 0; i < paragraphs.length; i++) {
    nextParagraphs.push(paragraphs[i]!)
    const toInsert = byAfter.get(i)
    if (!toInsert?.length) continue
    const template = paragraphs[i]!
    for (const text of toInsert) {
      nextParagraphs.push(replaceParagraphTextWhole(template, canonicalizeParagraphText(text)))
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
