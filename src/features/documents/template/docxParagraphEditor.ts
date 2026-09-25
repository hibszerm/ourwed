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
  extractCanonicalBreakOffsets,
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
  replacement: string | readonly string[],
): string {
  const model = buildParagraphRunModel(paragraphXml)
  if (start < 0 || end <= start || end > model.canonicalText.length) {
    throw new Error('Grounded DOCX span is out of range')
  }
  const mapped = mapCanonicalRangeToTextNodes(paragraphXml, start, end)
  if (!mapped) throw new Error('Grounded DOCX span cannot be mapped safely')
  if (typeof replacement !== 'string') {
    if (replacement.length !== mapped.segments.length || replacement.some((part) => !part.trim())) {
      throw new Error('Grounded DOCX span replacement structure is incompatible')
    }
    let next = paragraphXml
    for (let index = mapped.segments.length - 1; index >= 0; index--) {
      const segment = mapped.segments[index]!
      next = replaceSingleGroundedSegment(next, segment.start, segment.end, replacement[index]!)
    }
    return next
  }
  if (mapped.segments.length !== 1) throw new Error('Cross-break replacement requires explicit target segments')
  return replaceSingleGroundedSegment(paragraphXml, start, end, replacement)
}

export type GroundedTextSegment = { start: number; end: number }
export type GroundedTextSpan = { start: number; end: number; segments?: GroundedTextSegment[] }
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
  const mapped = mapCanonicalRangeToTextNodes(paragraphXml, start, end)
  if (!mapped) return { ok: false, reason: 'unmappable' }
  return { ok: true, span: { start, end, ...(mapped.segments.length > 1 ? { segments: mapped.segments } : {}) } }
}

/** Replacement inherits the first source character's run/text-node formatting. */
export function replaceGroundedTextSpan(
  paragraphXml: string,
  span: GroundedTextSpan,
  replacement: string | readonly string[],
): string {
  return replaceCanonicalSpanInParagraphXml(paragraphXml, span.start, span.end, replacement)
}

type TextNode = { start: number; end: number; decoded: string; raw: string; charStarts: number[]; charEnds: number[] }
type MappedRange = { firstNode: number; firstOffset: number; lastNode: number; lastOffset: number; segments: GroundedTextSegment[] }
type ReplacementTextPart = { nodeIndex: number; text: string }
type ReplacementStylePlan = { parts: ReplacementTextPart[]; preserveInternalTabs: boolean }

function replaceSingleGroundedSegment(xml: string, start: number, end: number, replacement: string): string {
  const mapped = mapCanonicalRangeToTextNodes(xml, start, end)
  if (!mapped || mapped.segments.length !== 1) throw new Error('Grounded DOCX segment cannot be mapped safely')
  const stylePlan = chooseReplacementStylePlan(xml, start, end, replacement, mapped)
  return spliceTextNodes(xml, mapped, stylePlan)
}

function visualRunSignature(runXml: string): string {
  const properties = runXml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
  return properties
    .replace(/<w:lang\b[^>]*\/>/g, '')
    .replace(/\s+w:hint=(?:"[^"]*"|'[^']*')/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function structuralPrefix(text: string): { kind: 'number' | 'bullet' | 'label'; value: string } | null {
  const number = text.match(/^\s*(§\s*\d+(?:\.\d+)*(?:[.)])?|\d+(?:\.\d+)*[.)])\s*$/u)
  if (number) return { kind: 'number', value: number[1]! }
  const bullet = text.match(/^\s*([•*–—-])\s*$/u)
  if (bullet) return { kind: 'bullet', value: bullet[1]! }
  const label = text.match(/^\s*([\p{L}\p{N}][\p{L}\p{N}\s.-]{0,22}:)\s*$/u)
  if (label) return { kind: 'label', value: label[1]! }
  return null
}

function replacementStructuralPrefix(text: string): { kind: 'number' | 'bullet' | 'label'; value: string; end: number } | null {
  const number = text.match(/^\s*(§\s*\d+(?:\.\d+)*(?:[.)])?|\d+(?:\.\d+)*[.)])/u)
  if (number) return { kind: 'number', value: number[1]!, end: number[0].length }
  const bullet = text.match(/^\s*([•*–—-])/u)
  if (bullet) return { kind: 'bullet', value: bullet[1]!, end: bullet[0].length }
  const label = text.match(/^\s*([\p{L}\p{N}][\p{L}\p{N}\s.-]{0,22}:)/u)
  if (label) return { kind: 'label', value: label[1]!, end: label[0].length }
  return null
}

function chooseReplacementStylePlan(xml: string, start: number, end: number, replacement: string, mapped: MappedRange): ReplacementStylePlan {
  const model = buildParagraphRunModel(xml)
  const runXmls = [...xml.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((match) => match[0])
  if (runXmls.length !== model.runs.length) throw new Error('Cannot preserve formatting: OOXML run map is inconsistent')
  const textNodes = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  const runNodeIndexes: number[][] = runXmls.map(() => [])
  let nodeIndex = 0
  for (let runIndex = 0; runIndex < runXmls.length; runIndex++) {
    const count = [...runXmls[runIndex]!.matchAll(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)].length
    for (let offset = 0; offset < count; offset++) runNodeIndexes[runIndex]!.push(nodeIndex++)
  }
  if (nodeIndex !== textNodes.length) throw new Error('Cannot preserve formatting: text nodes do not belong to a unique run')

  const charRuns = model.charMap.slice(start, end).map((entry) => entry.runIndex)
  if (charRuns.length !== end - start || charRuns.some((runIndex) => !runXmls[runIndex])) {
    throw new Error(`Cannot preserve formatting: grounded range [${start}, ${end}) has no unique run map`)
  }
  const runBounds = new Map<number, { start: number; end: number }>()
  model.charMap.forEach((entry, offset) => {
    const bounds = runBounds.get(entry.runIndex)
    if (bounds) bounds.end = offset + 1
    else runBounds.set(entry.runIndex, { start: offset, end: offset + 1 })
  })
  const selectedCounts = new Map<number, number>()
  for (const runIndex of charRuns) selectedCounts.set(runIndex, (selectedCounts.get(runIndex) ?? 0) + 1)

  const leadingRunIndex = charRuns[0]!
  const leadingRunBounds = runBounds.get(leadingRunIndex)!
  const leadingRunText = model.runs[leadingRunIndex]!.canonicalText
  const sourcePrefix = structuralPrefix(leadingRunText)
  const newPrefix = replacementStructuralPrefix(replacement)
  const canKeepPrefix = sourcePrefix && newPrefix && sourcePrefix.kind === newPrefix.kind
    && start === leadingRunBounds.start && end > leadingRunBounds.end
    && leadingRunText.trim().length <= 24
  const styleCounts = new Map<string, { count: number; runs: number[] }>()
  for (const [runIndex, count] of selectedCounts) {
    if (canKeepPrefix && runIndex === leadingRunIndex) continue
    const signature = visualRunSignature(runXmls[runIndex]!)
    const entry = styleCounts.get(signature) ?? { count: 0, runs: [] }
    entry.count += count
    entry.runs.push(runIndex)
    styleCounts.set(signature, entry)
  }

  if (canKeepPrefix && newPrefix.end < replacement.length) {
    const dominant = selectDominantStyle(styleCounts, start, end)
    const bodyRun = dominant.runs.sort((a, b) => a - b).find((runIndex) => runNodeIndexes[runIndex]!.some((index) => index >= mapped.firstNode && index <= mapped.lastNode))
    if (bodyRun === undefined || !runNodeIndexes[leadingRunIndex]!.length) {
      throw new Error(`Cannot preserve formatting: structural prefix in grounded range [${start}, ${end}) has no body run`)
    }
    return {
      parts: [
        { nodeIndex: runNodeIndexes[leadingRunIndex]![0]!, text: newPrefix.value },
        { nodeIndex: runNodeIndexes[bodyRun]!.find((index) => index >= mapped.firstNode && index <= mapped.lastNode)!, text: replacement.slice(newPrefix.end) },
      ],
      preserveInternalTabs: true,
    }
  }

  if (styleCounts.size === 0) return { parts: [{ nodeIndex: mapped.firstNode, text: replacement }], preserveInternalTabs: false }
  const dominant = selectDominantStyle(styleCounts, start, end)
  const targetRun = dominant.runs.sort((a, b) => a - b).find((runIndex) => runNodeIndexes[runIndex]!.some((index) => index >= mapped.firstNode && index <= mapped.lastNode))
  if (targetRun === undefined) throw new Error(`Cannot preserve formatting: no text run for grounded range [${start}, ${end})`)
  const targetNode = runNodeIndexes[targetRun]!.find((index) => index >= mapped.firstNode && index <= mapped.lastNode)!
  const hasInternalTab = /<w:tab\b[^>]*\/>/.test(xml.slice(textNodes[mapped.firstNode]!.index! + textNodes[mapped.firstNode]![0].length, textNodes[mapped.lastNode]!.index!))
  if (hasInternalTab && targetRun === leadingRunIndex) {
    throw new Error(`Cannot preserve formatting safely: structural tab overlaps grounded range [${start}, ${end})`)
  }
  return { parts: [{ nodeIndex: targetNode, text: replacement }], preserveInternalTabs: true }
}

function selectDominantStyle(
  counts: Map<string, { count: number; runs: number[] }>, start: number, end: number,
): { count: number; runs: number[] } {
  const ordered = [...counts.values()].sort((a, b) => b.count - a.count)
  if (!ordered.length || (ordered[1] && ordered[0]!.count === ordered[1]!.count)) {
    throw new Error(`Cannot preserve formatting safely: no dominant run style for grounded range [${start}, ${end})`)
  }
  return ordered[0]!
}

function mapCanonicalRangeToTextNodes(xml: string, start: number, end: number): MappedRange | null {
  const nodes: TextNode[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  let rawVisible = ''
  const rawOwners: Array<{ node: number; offset: number; rawStart: number; rawEnd: number }> = []
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
    const nodeIndex = nodes.length
    const nodeRawStart = rawVisible.length
    nodes.push(node)
    for (let offset = 0; offset < decoded.length; offset++) {
      rawOwners.push({ node: nodeIndex, offset, rawStart: nodeRawStart + offset, rawEnd: nodeRawStart + offset + 1 })
    }
    rawVisible += decoded
  }
  const normalized = canonicalizeParagraphText(rawVisible)
  if (normalized !== extractCanonicalParagraphText(xml) || start < 0 || end <= start || end > normalized.length) return null

  // Normalize one grapheme cluster at a time so a composed character maps back
  // to every source code unit, even when its base and combining mark are in
  // different w:t nodes. Each canonical UTF-16 unit retains its raw interval.
  const canonicalOwners: Array<{ rawStart: number; rawEnd: number; clusterStart: number; clusterEnd: number }> = []
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
  for (const cluster of segmenter.segment(rawVisible)) {
    const clusterStart = cluster.index
    const clusterEnd = clusterStart + cluster.segment.length
    const normalizedCluster = canonicalizeParagraphText(cluster.segment)
    for (let offset = 0; offset < normalizedCluster.length; offset++) {
      canonicalOwners.push({ rawStart: clusterStart, rawEnd: clusterEnd, clusterStart, clusterEnd })
    }
  }
  if (canonicalOwners.length !== normalized.length) return null
  const firstOwner = canonicalOwners[start]!
  const lastOwner = canonicalOwners[end - 1]!
  // Never permit a span to cut through a normalized grapheme cluster.
  if (start > 0 && canonicalOwners[start - 1]!.clusterStart === firstOwner.clusterStart
    || end < normalized.length && canonicalOwners[end]!.clusterStart === lastOwner.clusterStart) return null
  const firstRawOwner = rawOwners[firstOwner.rawStart]
  const lastRawOwner = rawOwners[lastOwner.rawEnd - 1]
  if (!firstRawOwner || !lastRawOwner) return null
  const firstNode = firstRawOwner.node, firstOffset = firstRawOwner.offset
  const lastNode = lastRawOwner.node, lastOffset = lastRawOwner.offset + 1
  // Only ordinary line breaks may occur inside a grounded canonical range.
  const first = nodes[firstNode]!, last = nodes[lastNode]!
  const rawBetween = xml.slice(first.end, last.start)
  const breakRe = /<w:br\b([^>]*)\/>/g
  const breaks = [...rawBetween.matchAll(breakRe)]
  if (breaks.some((item) => /w:type\s*=\s*["'](?!textWrapping)[^"']+["']/.test(item[1] ?? ''))) return null
  const withoutBreaks = rawBetween.replace(breakRe, '')
    .replace(/<w:rPr\b[\s\S]*?<\/w:rPr>/g, '')
    .replace(/<\/?w:r\b[^>]*>/g, '')
    .replace(/<\/?w:t\b[^>]*>/g, '')
    .replace(/<\/?w:hyperlink\b[^>]*>/g, '')
    .replace(/<w:tab\b[^>]*\/>/g, '')
  if (/<w:|<\//.test(withoutBreaks)) return null
  const breakOffsets = extractCanonicalBreakOffsets(xml).filter((position) => position > start && position < end)
  if (breakOffsets.some((position, index) => index > 0 && position <= breakOffsets[index - 1]!)) return null
  const boundaries = [start, ...breakOffsets, end]
  const segments: GroundedTextSegment[] = []
  for (let index = 0; index < boundaries.length - 1; index++) {
    const segmentStart = boundaries[index]!
    const segmentEnd = boundaries[index + 1]!
    if (segmentEnd <= segmentStart) return null
    segments.push({ start: segmentStart, end: segmentEnd })
  }
  return { firstNode, firstOffset, lastNode, lastOffset, segments }
}

function spliceTextNodes(xml: string, range: MappedRange, stylePlan: ReplacementStylePlan): string {
  const nodes = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
  const insertions = new Map<number, string>()
  for (const part of stylePlan.parts) insertions.set(part.nodeIndex, (insertions.get(part.nodeIndex) ?? '') + part.text)
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
    const value = raw.slice(0, from) + escapeXml(insertions.get(i) ?? '') + raw.slice(to)
    edits.push({ start: contentStart, end: contentEnd, value })
  }
  let result = xml
  for (const edit of edits.sort((a, b) => b.start - a.start)) result = result.slice(0, edit.start) + edit.value + result.slice(edit.end)
  // A w:tab between affected text nodes falls inside the grounded span because
  // the shared paragraph text model intentionally treats it as layout control,
  // not a character. Remove only tabs bracketed by the replaced text nodes.
  const refreshedNodes = [...result.matchAll(/<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/g)]
  if (!stylePlan.preserveInternalTabs && range.lastNode > range.firstNode) {
    const first = refreshedNodes[range.firstNode]!
    const last = refreshedNodes[range.lastNode]!
    const betweenStart = first.index! + first[0].length
    const betweenEnd = last.index!
    const between = result.slice(betweenStart, betweenEnd).replace(/<w:tab\b[^>]*\/>/g, '')
    result = result.slice(0, betweenStart) + between + result.slice(betweenEnd)
  }
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
  beforeIndex?: number
  paragraphs: string[]
  /**
   * 'detach' (default for contract extras): strip numPr from cloned pPr.
   * 'inherit': keep anchor list numbering (rare; existing list continuity).
   */
  listNumbering?: 'detach' | 'inherit'
  presentation?: 'plain' | 'inherit'
  /** Optional source paragraph whose pPr/rPr should style inserted paragraphs. */
  styleExemplarIndex?: number
}

export type DocxParagraphEdit = {
  index: number
  text: string
  /** Optional: replace only this canonical span instead of whole paragraph. */
  span?: { start: number; end: number; replacement: string | readonly string[] }
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
  type Pending = { text: string; listNumbering: 'detach' | 'inherit'; presentation: 'plain' | 'inherit' }
  type PositionBatch = { items: Pending[]; styleExemplarIndex?: number }
  const byPosition = new Map<string, PositionBatch>()
  for (const ins of insertions) {
    const key = ins.beforeIndex === undefined ? `after:${ins.afterIndex}` : `before:${ins.beforeIndex}`
    const batch = byPosition.get(key) ?? { items: [] }
    if (batch.styleExemplarIndex !== undefined && ins.styleExemplarIndex !== undefined
      && batch.styleExemplarIndex !== ins.styleExemplarIndex) {
      throw new Error(`DOCX insertion position has conflicting style exemplars: ${key}`)
    }
    if (ins.styleExemplarIndex !== undefined) batch.styleExemplarIndex = ins.styleExemplarIndex
    const mode = ins.listNumbering ?? 'detach'
    batch.items.push(...ins.paragraphs.map((text) => ({ text, listNumbering: mode, presentation: ins.presentation ?? 'inherit' as const })))
    byPosition.set(key, batch)
  }

  const paragraphs = locateParagraphElements(xml)
  const insertAt = new Map<number, string[]>()
  for (const [position, batch] of byPosition) {
    const [side, indexText] = position.split(':')
    const index = Number(indexText)
    const anchor = paragraphs[index]
    if (!anchor) throw new Error(`DOCX insertion anchor is missing: ${index}`)
    const exemplar = batch.styleExemplarIndex === undefined ? anchor : paragraphs[batch.styleExemplarIndex]
    if (!exemplar) throw new Error(`DOCX insertion style exemplar is missing: ${batch.styleExemplarIndex}`)
    const additions = batch.items.map((item) => item.presentation === 'plain'
      ? `<w:p><w:r><w:t xml:space="preserve">${escapeXml(canonicalizeParagraphText(item.text))}</w:t></w:r></w:p>`
      : replaceParagraphTextWhole(
          exemplar.xml,
          canonicalizeParagraphText(item.text),
          { stripListNumbering: item.listNumbering !== 'inherit' },
        ),
    )
    const offset = side === 'before' ? anchor.start : anchor.end
    insertAt.set(offset, [...(insertAt.get(offset) ?? []), ...additions])
  }

  let nextXml = xml
  for (const [offset, additions] of [...insertAt.entries()].sort((a, b) => b[0] - a[0])) {
    nextXml = nextXml.slice(0, offset) + additions.join('') + nextXml.slice(offset)
  }

  zip.file('word/document.xml', nextXml)
  return zip.generateAsync({
    type: 'arraybuffer',
    compression: 'DEFLATE',
  })
}

type ParagraphXmlLocation = { start: number; end: number; xml: string }

/** Locate complete paragraph elements without ever rebuilding their parents or siblings. */
function locateParagraphElements(xml: string): ParagraphXmlLocation[] {
  const result: ParagraphXmlLocation[] = []
  const stack: string[] = []
  let paragraphStart: number | null = null
  let cursor = 0
  while (cursor < xml.length) {
    const open = xml.indexOf('<', cursor)
    if (open < 0) break
    if (xml.startsWith('<!--', open)) {
      const close = xml.indexOf('-->', open + 4)
      if (close < 0) throw new Error('Malformed DOCX XML comment')
      cursor = close + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', open)) {
      const close = xml.indexOf(']]>', open + 9)
      if (close < 0) throw new Error('Malformed DOCX XML CDATA')
      cursor = close + 3
      continue
    }
    const close = findXmlTagEnd(xml, open)
    if (close < 0) throw new Error('Malformed DOCX XML tag')
    const token = xml.slice(open, close + 1)
    if (/^<\?|^<!/.test(token)) {
      cursor = close + 1
      continue
    }
    const closing = /^<\//.test(token)
    const name = token.match(/^<\/?\s*([^\s/>]+)/)?.[1]
    if (!name) throw new Error('Malformed DOCX XML element')
    if (closing) {
      const actual = stack.pop()
      if (actual !== name) throw new Error(`Malformed DOCX XML nesting at ${name}`)
      if (name === 'w:p' && paragraphStart !== null) {
        result.push({ start: paragraphStart, end: close + 1, xml: xml.slice(paragraphStart, close + 1) })
        paragraphStart = null
      }
    } else if (!/\/\s*>$/.test(token)) {
      if (name === 'w:p') paragraphStart = open
      stack.push(name)
    }
    cursor = close + 1
  }
  if (paragraphStart !== null || stack.length) throw new Error('Unclosed DOCX XML element')
  return result
}

function findXmlTagEnd(xml: string, start: number): number {
  let quote = ''
  for (let index = start + 1; index < xml.length; index++) {
    const char = xml[index]!
    if (quote) {
      if (char === quote) quote = ''
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return index
    }
  }
  return -1
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
