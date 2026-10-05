import JSZip from 'jszip'
import { canonicalizeParagraphText, extractCanonicalParagraphText, escapeXml, unescapeXml } from '@/features/documents/template/canonicalParagraph.ts'

export type BlockKind = 'body' | 'tableCell' | 'header' | 'footer'
export type BlockTextPart =
  | { kind: 'editable_text'; text: string }
  | { kind: 'protected_field'; fieldKind: 'complex' | 'simple'; instruction: string; cachedText: string }
export type EditableBlock = { blockId: string; part: string; index: number; kind: BlockKind; text: string; context: string; textParts?: BlockTextPart[] }
export type BlockOperation =
  | { blockId: string; operation: 'REPLACE_BLOCK_TEXT'; finalText: string }
  | { anchorBlockId: string; operation: 'INSERT_BLOCK_AFTER' | 'INSERT_BLOCK_BEFORE'; finalText: string; styleSourceBlockId: string }
  | { blockId: string; operation: 'DELETE_BLOCK' }

export type ExactTextPatch = { blockId: string; expectedSource: string; replacement: string; sourceStart: number; sourceEnd: number }

const partPattern = /^word\/(document|header\d+|footer\d+)\.xml$/
const hyphenationPartPattern = /^word\/(?:document|header\d+|footer\d+|footnotes|endnotes)\.xml$/
const idFor = (part: string, index: number) => `${part}#p${index}`

type XmlTag = { start: number; end: number; name: string; closing: boolean; selfClosing: boolean }
type ParagraphOrigin = { kind: 'body' } | { kind: 'tableCell'; tableIndex: number; rowIndex: number; cellIndex: number; cellParagraphIndex: number }
type ParagraphElement = { start: number; end: number; xml: string; origin: ParagraphOrigin; stableIndex?: number }
type XmlFrame = {
  name: string
  start: number
  paragraphOrigin?: ParagraphOrigin
  tableIndex?: number
  nextRowIndex?: number
  rowIndex?: number
  nextCellIndex?: number
  cellIndex?: number
  nextParagraphIndex?: number
}

function xmlTagsIn(xml: string): XmlTag[] {
  const tags: XmlTag[] = []
  let cursor = 0
  while (cursor < xml.length) {
    const start = xml.indexOf('<', cursor)
    if (start < 0) break
    if (xml.startsWith('<!--', start)) {
      const end = xml.indexOf('-->', start + 4)
      if (end < 0) throw new Error('Malformed DOCX XML comment')
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<![CDATA[', start)) {
      const end = xml.indexOf(']]>', start + 9)
      if (end < 0) throw new Error('Malformed DOCX XML CDATA section')
      cursor = end + 3
      continue
    }
    if (xml.startsWith('<?', start)) {
      const end = xml.indexOf('?>', start + 2)
      if (end < 0) throw new Error('Malformed DOCX XML processing instruction')
      cursor = end + 2
      continue
    }

    let quote = ''
    let bracketDepth = 0
    let end = start + 1
    for (; end < xml.length; end++) {
      const char = xml[end]!
      if (quote) {
        if (char === quote) quote = ''
      } else if (char === '"' || char === "'") quote = char
      else if (xml.startsWith('<!', start)) {
        if (char === '[') bracketDepth++
        else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1)
        else if (char === '>' && bracketDepth === 0) break
      } else if (char === '>') break
    }
    if (end >= xml.length) throw new Error('Malformed DOCX XML tag')
    const raw = xml.slice(start, end + 1)
    if (!raw.startsWith('<!')) {
      const match = raw.match(/^<\s*(\/?)\s*([^\s/>]+)([\s\S]*?)>$/)
      if (!match) throw new Error('Malformed DOCX XML element name')
      tags.push({ start, end: end + 1, name: match[2]!, closing: match[1] === '/', selfClosing: match[1] !== '/' && /\/\s*>$/.test(raw) })
    }
    cursor = end + 1
  }
  return tags
}

/** Locate exact XML element boundaries while tracking the enclosing table path. */
function paragraphElementsIn(xml: string): ParagraphElement[] {
  const tags = xmlTagsIn(xml)
  const stack: XmlFrame[] = []
  const paragraphs: ParagraphElement[] = []
  let nextTableIndex = 0
  for (const tag of tags) {
    if (tag.closing) {
      const frame = stack.pop()
      if (!frame || frame.name !== tag.name) throw new Error(`Malformed DOCX XML nesting at ${tag.name}`)
      if (tag.name === 'w:p') paragraphs.push({ start: frame.start, end: tag.end, xml: xml.slice(frame.start, tag.end), origin: frame.paragraphOrigin ?? { kind: 'body' } })
      continue
    }

    const parent = (name: string) => [...stack].reverse().find((frame) => frame.name === name)
    let paragraphOrigin: ParagraphOrigin | undefined
    let tableIndex: number | undefined
    let rowIndex: number | undefined
    let cellIndex: number | undefined
    let nextRowIndex: number | undefined
    let nextCellIndex: number | undefined
    let nextParagraphIndex: number | undefined
    if (tag.name === 'w:tbl') {
      tableIndex = nextTableIndex++
      nextRowIndex = 0
    } else if (tag.name === 'w:tr') {
      const table = parent('w:tbl')
      if (table) {
        tableIndex = table.tableIndex
        rowIndex = table.nextRowIndex ?? 0
        table.nextRowIndex = rowIndex + 1
        nextCellIndex = 0
      }
    } else if (tag.name === 'w:tc') {
      const row = parent('w:tr')
      if (row) {
        tableIndex = row.tableIndex
        rowIndex = row.rowIndex
        cellIndex = row.nextCellIndex ?? 0
        row.nextCellIndex = cellIndex + 1
        nextParagraphIndex = 0
      }
    } else if (tag.name === 'w:p') {
      const cell = parent('w:tc')
      if (cell) {
        paragraphOrigin = {
          kind: 'tableCell',
          tableIndex: cell.tableIndex!,
          rowIndex: cell.rowIndex!,
          cellIndex: cell.cellIndex!,
          cellParagraphIndex: cell.nextParagraphIndex ?? 0,
        }
        cell.nextParagraphIndex = (cell.nextParagraphIndex ?? 0) + 1
      } else paragraphOrigin = { kind: 'body' }
    }

    const frame: XmlFrame = { name: tag.name, start: tag.start }
    if (tag.name === 'w:p') frame.paragraphOrigin = paragraphOrigin
    if (tag.name === 'w:tbl') { frame.tableIndex = tableIndex; frame.nextRowIndex = nextRowIndex }
    if (tag.name === 'w:tr') { frame.tableIndex = tableIndex; frame.rowIndex = rowIndex; frame.nextCellIndex = nextCellIndex }
    if (tag.name === 'w:tc') { frame.tableIndex = tableIndex; frame.rowIndex = rowIndex; frame.cellIndex = cellIndex; frame.nextParagraphIndex = nextParagraphIndex }
    if (tag.selfClosing) {
      if (tag.name === 'w:p') paragraphs.push({ start: tag.start, end: tag.end, xml: xml.slice(tag.start, tag.end), origin: paragraphOrigin ?? { kind: 'body' } })
    } else stack.push(frame)
  }
  if (stack.length) throw new Error(`Malformed DOCX XML: unclosed ${stack.at(-1)!.name}`)
  paragraphs.sort((a, b) => a.start - b.start)

  // Keep IDs from the previous editor stream when its end boundary maps to one
  // actual paragraph. Extra nested paragraphs receive deterministic IDs after it.
  const paragraphByEnd = new Map(paragraphs.map((paragraph) => [paragraph.end, paragraph]))
  let legacyCursor = 0
  let legacyIndex = 0
  const openingParagraphs = tags.filter((tag) => tag.name === 'w:p' && !tag.closing)
  const closingParagraphs = tags.filter((tag) => tag.name === 'w:p' && tag.closing)
  let openingCursor = 0
  let closingCursor = 0
  while (legacyCursor < xml.length) {
    while (openingCursor < openingParagraphs.length && openingParagraphs[openingCursor]!.start < legacyCursor) openingCursor++
    const opening = openingParagraphs[openingCursor]
    if (!opening) break
    while (closingCursor < closingParagraphs.length && closingParagraphs[closingCursor]!.start < opening.end) closingCursor++
    const closing = closingParagraphs[closingCursor]
    if (!closing) break
    const paragraph = paragraphByEnd.get(closing.end)
    if (paragraph && paragraph.stableIndex === undefined) paragraph.stableIndex = legacyIndex
    legacyIndex++
    legacyCursor = closing.end
  }
  let extraIndex = legacyIndex
  for (const paragraph of paragraphs) {
    if (paragraph.stableIndex === undefined) paragraph.stableIndex = extraIndex++
  }
  return paragraphs
}

function replaceXmlSpans(xml: string, edits: Array<{ start: number; end: number; replacement: string }>): string {
  let result = xml
  let previousStart = xml.length + 1
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    if (edit.end > previousStart) throw new Error('Overlapping DOCX XML edits are ambiguous')
    result = result.slice(0, edit.start) + edit.replacement + result.slice(edit.end)
    previousStart = edit.start
  }
  return result
}

function textFor(paragraph: string): string {
  const completeParagraph = /^<w:p\b/.test(paragraph) && /<\/w:p\s*>\s*$/.test(paragraph)
  const elements = completeParagraph ? paragraphElementsIn(paragraph) : []
  const rootParagraph = elements.find((element) => element.start === 0)
  const nestedParagraphs = rootParagraph
    ? elements.filter((element) => element.start > rootParagraph.start
      && element.end < rootParagraph.end
      && !elements.some((parent) => parent !== element
        && parent.start > rootParagraph.start
        && parent.start < element.start
        && parent.end >= element.end))
    : []
  const directXml = replaceXmlSpans(paragraph, nestedParagraphs.map((element) => ({ start: element.start, end: element.end, replacement: '' })))
  const textXml = directXml.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/g, '')
  return extractCanonicalParagraphText(textXml.replace(/<w:tab\b[^>]*\/>/g, '<w:t> </w:t>').replace(/<w:br\b[^>]*\/>/g, '<w:t> </w:t>'))
}

type WordFieldRange = { start: number; end: number; xml: string; fieldKind: 'complex' | 'simple'; instruction: string; cachedText: string }

function fieldRangesIn(paragraph: string): WordFieldRange[] {
  const ranges: Array<{ start: number; end: number; fieldKind: 'complex' | 'simple' }> = []
  const runOpenAt = (offset: number): number => {
    const opens = [...paragraph.slice(0, offset).matchAll(/<w:r\b[^>]*>/g)]
    const lastOpen = opens.at(-1)
    const lastClose = paragraph.lastIndexOf('</w:r>', offset)
    if (!lastOpen || lastOpen.index! < lastClose) throw new Error('Cannot safely locate Word field run start')
    return lastOpen.index!
  }
  const runCloseAfter = (offset: number): number => {
    const close = paragraph.indexOf('</w:r>', offset)
    if (close < 0) throw new Error('Cannot safely locate Word field run end')
    return close + '</w:r>'.length
  }

  const complexStack: number[] = []
  const fieldCharPattern = /<w:fldChar\b([^>]*?)(?:\/>|>(?:[\s\S]*?)<\/w:fldChar>)/g
  let fieldChar: RegExpExecArray | null
  while ((fieldChar = fieldCharPattern.exec(paragraph))) {
    const type = fieldChar[1]!.match(/\bw:fldCharType\s*=\s*["']([^"']+)["']/)?.[1]
    if (type === 'begin') complexStack.push(runOpenAt(fieldChar.index))
    else if (type === 'separate') {
      if (!complexStack.length) throw new Error('Word field separator has no matching begin')
    } else if (type === 'end') {
      const start = complexStack.pop()
      if (start === undefined) throw new Error('Word field end has no matching begin')
      if (!complexStack.length) ranges.push({ start, end: runCloseAfter(fieldChar.index + fieldChar[0].length), fieldKind: 'complex' })
    } else throw new Error('Unrecognized Word field marker')
  }
  if (complexStack.length) throw new Error('Word field has no matching end')

  const simpleStack: number[] = []
  const simplePattern = /<w:fldSimple\b[^>]*>|<\/w:fldSimple\s*>/g
  let simple: RegExpExecArray | null
  while ((simple = simplePattern.exec(paragraph))) {
    if (simple[0].startsWith('</')) {
      const start = simpleStack.pop()
      if (start === undefined) throw new Error('Simple Word field end has no matching start')
      if (!simpleStack.length) ranges.push({ start, end: simplePattern.lastIndex, fieldKind: 'simple' })
    } else if (/\/>$/.test(simple[0])) ranges.push({ start: simple.index, end: simplePattern.lastIndex, fieldKind: 'simple' })
    else simpleStack.push(simple.index)
  }
  if (simpleStack.length) throw new Error('Simple Word field has no matching end')

  const sorted = ranges.sort((a, b) => a.start - b.start || b.end - a.end)
  const topLevel: typeof ranges = []
  for (const range of sorted) {
    const containing = topLevel.at(-1)
    if (containing && range.start < containing.end) {
      if (range.end > containing.end) throw new Error('Overlapping Word field structures cannot be preserved safely')
      continue
    }
    topLevel.push(range)
  }
  return topLevel.map((range) => {
    const xml = paragraph.slice(range.start, range.end)
    const simpleInstruction = xml.match(/<w:fldSimple\b[^>]*\bw:instr\s*=\s*["']([^"']*)["']/)?.[1]
    const instruction = simpleInstruction === undefined
      ? [...xml.matchAll(/<w:instrText(?:\s[^>]*)?>([\s\S]*?)<\/w:instrText>/g)].map((match) => unescapeXml(match[1]!)).join(' ').trim()
      : unescapeXml(simpleInstruction)
    return { ...range, xml, instruction, cachedText: textFor(xml) }
  })
}

function blockTextParts(paragraph: string): BlockTextPart[] | undefined {
  const fields = fieldRangesIn(paragraph)
  if (!fields.length) return undefined
  const parts: BlockTextPart[] = []
  let cursor = 0
  for (const field of fields) {
    parts.push({ kind: 'editable_text', text: textFor(paragraph.slice(cursor, field.start)) })
    parts.push({ kind: 'protected_field', fieldKind: field.fieldKind, instruction: field.instruction, cachedText: field.cachedText })
    cursor = field.end
  }
  parts.push({ kind: 'editable_text', text: textFor(paragraph.slice(cursor)) })
  if (parts.map((part) => part.kind === 'editable_text' ? part.text : part.cachedText).join('') !== textFor(paragraph)) throw new Error('Word field text cannot be aligned with visible block text')
  return parts
}

export async function buildBlockIndex(bytes: ArrayBuffer): Promise<EditableBlock[]> {
  const zip = await JSZip.loadAsync(bytes)
  const blocks: EditableBlock[] = []
  const referencedHeaders = new Set<string>()
  const referencedFooters = new Set<string>()
  const relFile = zip.file('word/_rels/document.xml.rels')
  const documentFile = zip.file('word/document.xml')
  const hasRelationshipIndex = Boolean(relFile && documentFile)
  if (relFile && documentFile) {
    const [rels, documentXml] = await Promise.all([relFile.async('string'), documentFile.async('string')])
    const relationTargets = new Map([...rels.matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((match) => {
      const attrs = match[1]!
      const id = attrs.match(/\bId="([^"]+)"/)?.[1]
      const target = attrs.match(/\bTarget="([^"]+)"/)?.[1]
      return [id ?? '', target ?? '']
    }))
    for (const reference of documentXml.matchAll(/<w:(header|footer)Reference\b([^>]*)\/?\s*>/g)) {
      const relId = reference[2]!.match(/r:id="([^"]+)"/)?.[1]
      const target = relId ? relationTargets.get(relId) : undefined
      if (target) (reference[1] === 'header' ? referencedHeaders : referencedFooters).add(`word/${target.replace(/^\//, '').replace(/^word\//, '')}`)
    }
  }
  for (const part of Object.keys(zip.files).filter((path) => partPattern.test(path)).sort()) {
    if (hasRelationshipIndex && part.startsWith('word/header') && !referencedHeaders.has(part)) continue
    if (hasRelationshipIndex && part.startsWith('word/footer') && !referencedFooters.has(part)) continue
    const xml = await zip.file(part)!.async('string')
    const paragraphs = paragraphElementsIn(xml)
    for (let index = 0; index < paragraphs.length; index++) {
      const paragraph = paragraphs[index]!
      const text = textFor(paragraph.xml)
      const previous = blocks.at(-1)?.part === part ? blocks.at(-1)?.text ?? '' : ''
      const next = paragraphs[index + 1] ? textFor(paragraphs[index + 1]!.xml) : ''
      const origin = paragraph.origin
      const kind: BlockKind = origin.kind === 'tableCell' ? 'tableCell' : part.includes('header') ? 'header' : part.includes('footer') ? 'footer' : 'body'
      const structure = origin.kind === 'tableCell' ? `Table ${origin.tableIndex}, row ${origin.rowIndex}, cell ${origin.cellIndex}. ` : ''
      const textParts = blockTextParts(paragraph.xml)
      blocks.push({ blockId: idFor(part, paragraph.stableIndex!), part, index, kind, text, context: `${structure}Previous: ${previous}\nCurrent: ${text}\nNext: ${next}`, ...(textParts ? { textParts } : {}) })
    }
  }
  if (new Set(blocks.map((block) => block.blockId)).size !== blocks.length) throw new Error('DOCX paragraph IDs are ambiguous')
  return blocks
}

export function remapOperationsToCurrentBlocks(
  operations: BlockOperation[], sourceBlocks: EditableBlock[], currentBlocks: EditableBlock[], originalOperations: BlockOperation[],
): BlockOperation[] {
  const bySourceId = new Map(sourceBlocks.map((block) => [block.blockId, block]))
  const byCurrentLocation = new Map(currentBlocks.map((block) => [`${block.part}#${block.index}`, block.blockId]))
  const currentId = (sourceId: string): string => {
    const source = bySourceId.get(sourceId)
    if (!source) throw new Error(`Unknown source block ID: ${sourceId}`)
    let shift = 0
    for (const operation of originalOperations) {
      const anchorId = 'blockId' in operation ? operation.blockId : operation.anchorBlockId
      const anchor = bySourceId.get(anchorId)
      if (!anchor || anchor.part !== source.part) continue
      if (operation.operation === 'INSERT_BLOCK_AFTER' && anchor.index < source.index) shift++
      if (operation.operation === 'INSERT_BLOCK_BEFORE' && anchor.index <= source.index) shift++
      if (operation.operation === 'DELETE_BLOCK' && anchor.index < source.index) shift--
    }
    const id = byCurrentLocation.get(`${source.part}#${source.index + shift}`)
    if (!id) throw new Error(`Source block no longer exists in current DOCX: ${sourceId}`)
    return id
  }
  return operations.map((operation) => operation.operation === 'REPLACE_BLOCK_TEXT'
    ? { ...operation, blockId: currentId(operation.blockId) }
    : operation.operation === 'DELETE_BLOCK'
      ? { ...operation, blockId: currentId(operation.blockId) }
      : { ...operation, anchorBlockId: currentId(operation.anchorBlockId), styleSourceBlockId: currentId(operation.styleSourceBlockId) })
}

function dominantRunProperties(paragraph: string): string {
  const runs = [...paragraph.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((m) => m[0]!)
  const text = (run: string) => [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => m[1]!).join('')
  const visual = (run: string) => run.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
  const signature = (run: string) => visual(run).replace(/<w:lang\b[^>]*\/>/g, '').replace(/\s+/g, ' ').trim()
  if (!runs.length) return ''
  const prefixMatch = text(runs[0]!).match(/^\s*(§\s*\d+(?:\.\d+)*[.)]?|\d+(?:\.\d+)*[.)]|[•*–—-]|[\p{L}\p{N}][\p{L}\p{N}\s.-]{0,22}:)\s*$/u)
  const counts = new Map<string, { n: number; run: string }>()
  for (let index = 0; index < runs.length; index++) {
    if (index === 0 && prefixMatch && runs.length > 1) continue
    const sig = signature(runs[index]!)
    const item = counts.get(sig) ?? { n: 0, run: runs[index]! }
    item.n += text(runs[index]!).length
    counts.set(sig, item)
  }
  const ordered = [...counts.values()].sort((a, b) => b.n - a.n)
  if (!ordered.length) return ''
  // Equal run-style weights are normal Word segmentation, not a failed edit.
  // The stable sort keeps the earliest source style in a tie.
  return visual(ordered[0]!.run)
}

function rewriteParagraph(paragraph: string, finalText: string): string {
  if (xmlTagsIn(paragraph).filter((tag) => tag.name === 'w:p' && !tag.closing).length !== 1) {
    throw new Error('Cannot safely replace a DOCX block containing nested paragraphs')
  }
  const fields = fieldRangesIn(paragraph)
  let rewritten: string
  if (fields.length) rewritten = rewriteParagraphPreservingFields(paragraph, finalText)
  else {
    const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ''
    const style = dominantRunProperties(paragraph)
    rewritten = `<w:p>${pPr}<w:r>${style}<w:t xml:space="preserve">${escapeXml(finalText)}</w:t></w:r></w:p>`
  }
  if (textFor(rewritten) !== canonicalizeParagraphText(finalText)) {
    throw new Error('DOCX block replacement did not preserve requested logical text')
  }
  return rewritten
}

function mapProtectedFieldsToFinalText(fields: WordFieldRange[], editableParts: string[], finalText: string): number[] {
  const emptyResultFieldsAtPreviousEnd = new Set<number>()
  const candidates = fields.map((field, index) => {
    if (!field.cachedText) {
      let groupStart = index
      while (groupStart > 0 && !fields[groupStart - 1]!.cachedText && !(editableParts[groupStart] ?? '')) groupStart--
      let groupEnd = index
      while (groupEnd + 1 < fields.length && !fields[groupEnd + 1]!.cachedText && !(editableParts[groupEnd + 1] ?? '')) groupEnd++
      const before = editableParts[groupStart] ?? ''
      const after = editableParts[groupEnd + 1] ?? ''
      // Empty-result fields have no visible text to search for. Keep them at
      // their deterministic structural boundary; where literal text exists
      // on both sides, require the source boundary to survive exactly.
      if (!before) {
        emptyResultFieldsAtPreviousEnd.add(index)
        return []
      }
      if (!after) return [finalText.length]
      const boundary = `${before}${after}`
      const positions: number[] = []
      let from = 0
      while (from <= finalText.length - boundary.length) {
        const position = finalText.indexOf(boundary, from)
        if (position < 0) break
        positions.push(position + before.length)
        from = position + 1
      }
      return positions
    }
    const before = editableParts[index] ?? ''
    const after = editableParts[index + 1] ?? ''
    const occurrences: number[] = []
    let from = 0
    while (from <= finalText.length - field.cachedText.length) {
      const position = finalText.indexOf(field.cachedText, from)
      if (position < 0) break
      occurrences.push(position)
      from = position + 1
    }
    if (occurrences.length === 1) return occurrences
    const anchored = occurrences.filter((position) => {
      const leftAnchorMatches = before.length > 0 && finalText.slice(Math.max(0, position - before.length), position) === before
      const afterPosition = position + field.cachedText.length
      const rightAnchorMatches = after.length > 0 && finalText.slice(afterPosition, afterPosition + after.length) === after
      return leftAnchorMatches || rightAnchorMatches
    })
    if (!anchored.length) throw new Error(`Cannot safely map cached text for Word field ${field.instruction || index}`)
    return anchored
  })

  const solutions: number[][] = []
  let examined = 0
  const visit = (index: number, previousEnd: number, positions: number[]) => {
    if (++examined > 50000) throw new Error('Word field mapping is too ambiguous to preserve safely')
    if (index === fields.length) {
      solutions.push(positions)
      return
    }
    const field = fields[index]!
    // Consecutive empty-result fields with no visible literal between them
    // share one boundary and retain their original source order.
    const options = emptyResultFieldsAtPreviousEnd.has(index)
      ? [previousEnd]
      : candidates[index]!
    for (const candidate of options) {
      if (candidate < previousEnd) continue
      visit(index + 1, candidate + field.cachedText.length, [...positions, candidate])
    }
  }
  visit(0, 0, [])
  if (!solutions.length) throw new Error('Word fields cannot be mapped to final block text in source order')
  if (solutions.length !== 1) throw new Error('Word field mapping is ambiguous; refusing to flatten dynamic fields')
  return solutions[0]!
}

function rewriteParagraphPreservingFields(paragraph: string, finalText: string): string {
  const fields = fieldRangesIn(paragraph)
  const editableParts: string[] = []
  let sourceCursor = 0
  for (const field of fields) {
    editableParts.push(textFor(paragraph.slice(sourceCursor, field.start)))
    sourceCursor = field.end
  }
  editableParts.push(textFor(paragraph.slice(sourceCursor)))
  const reconstructedSource = editableParts.map((part, index) => `${part}${fields[index]?.cachedText ?? ''}`).join('')
  if (reconstructedSource !== textFor(paragraph)) throw new Error('Word field boundaries do not match the visible source text')

  const positions = mapProtectedFieldsToFinalText(fields, editableParts, finalText)
  const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ''
  const bodyStyle = dominantRunProperties(paragraph)
  const run = (text: string) => text ? `<w:r>${bodyStyle}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r>` : ''
  let output = `<w:p>${pPr}`
  let finalCursor = 0
  for (let index = 0; index < fields.length; index++) {
    const field = fields[index]!
    const position = positions[index]!
    output += run(finalText.slice(finalCursor, position)) + field.xml
    finalCursor = position + field.cachedText.length
  }
  output += run(finalText.slice(finalCursor)) + '</w:p>'
  return output
}

type ParagraphStyleDefinition = { basedOn?: string; hasNumbering: boolean; disablesNumbering: boolean }

function paragraphStyles(stylesXml: string): { definitions: Map<string, ParagraphStyleDefinition>; defaultStyleId?: string } {
  const definitions = new Map<string, ParagraphStyleDefinition>()
  let defaultStyleId: string | undefined
  const wordNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
  const stack: Array<{ qname: string; ns: Map<string, string>; local: string; uri: string }> = []
  let current: { styleId: string; basedOn?: string; numberId?: string } | undefined
  const attrValue = (attrs: string, local: string, ns: Map<string, string>) => {
    for (const match of attrs.matchAll(/([^\s=/>]+)\s*=\s*(["'])(.*?)\2/g)) {
      const qname = match[1]!
      const value = match[3]!
      const [prefix, name] = qname.includes(':') ? qname.split(':', 2) : ['', qname]
      if (name === local && (prefix ? ns.get(prefix) : '') === (prefix ? wordNs : '')) return value
    }
    return undefined
  }
  for (const token of stylesXml.matchAll(/<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<![^>]*>|<[^>]+>/g)) {
    const tag = token[0]
    if (/^<\?|^<!/.test(tag)) continue
    const closing = /^<\//.test(tag)
    const qname = tag.match(/^<\/?([^\s/>]+)/)?.[1]
    if (!qname) continue
    if (closing) {
      const element = stack.pop()
      if (element?.local === 'style' && element.uri === wordNs && current) {
        definitions.set(current.styleId, {
          ...(current.basedOn ? { basedOn: current.basedOn } : {}),
          hasNumbering: Boolean(current.numberId && current.numberId !== '0'),
          disablesNumbering: current.numberId === '0',
        })
        current = undefined
      }
      continue
    }
    const parentNs = stack.at(-1)?.ns ?? new Map<string, string>()
    const ns = new Map(parentNs)
    const attrs = tag.slice(qname.length + 1, tag.length - (tag.endsWith('/>') ? 2 : 1))
    for (const match of attrs.matchAll(/\bxmlns(?::([^\s=]+))?\s*=\s*(["'])(.*?)\2/g)) ns.set(match[1] ?? '', match[3]!)
    const [prefix, local] = qname.includes(':') ? qname.split(':', 2) : ['', qname]
    const uri = ns.get(prefix) ?? ''
    if (local === 'style' && uri === wordNs) {
      const styleId = attrValue(attrs, 'styleId', ns)
      if (styleId && attrValue(attrs, 'type', ns) === 'paragraph') {
        current = { styleId }
        const isDefault = attrValue(attrs, 'default', ns)
        if (isDefault === '1' || isDefault === 'true' || isDefault === 'on') defaultStyleId = styleId
      }
    } else if (current && uri === wordNs) {
      if (local === 'basedOn') current.basedOn = attrValue(attrs, 'val', ns)
      if (local === 'numId' && stack.some((entry) => entry.local === 'numPr' && entry.uri === wordNs)) current.numberId = attrValue(attrs, 'val', ns)
    }
    if (!tag.endsWith('/>')) stack.push({ qname, ns, local, uri })
    else if (local === 'style' && uri === wordNs && current) {
      definitions.set(current.styleId, { ...(current.basedOn ? { basedOn: current.basedOn } : {}), hasNumbering: Boolean(current.numberId && current.numberId !== '0'), disablesNumbering: current.numberId === '0' })
      current = undefined
    }
  }
  return { definitions, ...(defaultStyleId ? { defaultStyleId } : {}) }
}

function styleHasNumbering(styleId: string | undefined, definitions: Map<string, ParagraphStyleDefinition>, seen = new Set<string>()): boolean {
  if (!styleId || seen.has(styleId)) return false
  seen.add(styleId)
  const definition = definitions.get(styleId)
  if (!definition || definition.disablesNumbering) return false
  return definition.hasNumbering || styleHasNumbering(definition.basedOn, definitions, seen)
}

const paragraphPropertyOrder = new Map(
  'pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange'.split(' ').map((name, index) => [name, index]),
)

function withParagraphProperty(pPr: string, propertyName: string, property: string): string {
  const childPattern = new RegExp(`<w:${propertyName}\\b[^>]*(?:\\/>|>[\\s\\S]*?<\\/${propertyName}\\s*>)`)
  const existing = pPr.match(childPattern)
  if (existing?.index !== undefined) return `${pPr.slice(0, existing.index)}${property}${pPr.slice(existing.index + existing[0].length)}`
  if (!pPr) return `<w:pPr>${property}</w:pPr>`
  const opening = pPr.match(/^<w:pPr\b[^>]*>/)?.[0]
  if (!opening) throw new Error('Cannot safely add a DOCX paragraph property to malformed paragraph properties')
  const children = [...pPr.slice(opening.length).matchAll(/<w:([A-Za-z0-9]+)\b[^>]*(?:\/>|>[\s\S]*?<\/w:\1>)/g)]
  const propertyRank = paragraphPropertyOrder.get(propertyName) ?? Number.MAX_SAFE_INTEGER
  const next = children.find((child) => (paragraphPropertyOrder.get(child[1]!) ?? Number.MAX_SAFE_INTEGER) > propertyRank)
  if (next?.index !== undefined) return `${pPr.slice(0, opening.length + next.index)}${property}${pPr.slice(opening.length + next.index)}`
  return `${pPr.slice(0, -'</w:pPr>'.length)}${property}</w:pPr>`
}

function disableInheritedNumbering(pPr: string): string {
  pPr = pPr.replace(/<w:numPr\b[^>]*\/>/g, '').replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, '')
  return withParagraphProperty(pPr, 'numPr', '<w:numPr><w:numId w:val="0"/></w:numPr>')
}

function withParagraphOnOffProperty(pPr: string, propertyName: string): string {
  const tagPattern = new RegExp(`<w:${propertyName}\\b([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/${propertyName}\\s*>)`)
  const existing = pPr.match(tagPattern)
  const attributes = existing?.[1]?.replace(/\s+w:val\s*=\s*["'][^"']*["']/g, '') ?? ''
  return withParagraphProperty(pPr, propertyName, `<w:${propertyName}${attributes}/>`)
}

function suppressAutomaticHyphenationInParagraph(paragraph: string): string {
  const selfClosing = paragraph.match(/^<w:p\b([^>]*)\/\s*>$/)
  if (selfClosing) return `<w:p${selfClosing[1]}><w:pPr><w:suppressAutoHyphens/></w:pPr></w:p>`

  const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0]
  if (pPr) return paragraph.replace(pPr, withParagraphOnOffProperty(pPr, 'suppressAutoHyphens'))

  const emptyPPr = paragraph.match(/<w:pPr\b([^>]*)\/\s*>/)
  if (emptyPPr?.index !== undefined) {
    const replacement = withParagraphProperty(`<w:pPr${emptyPPr[1]}></w:pPr>`, 'suppressAutoHyphens', '<w:suppressAutoHyphens/>')
    return `${paragraph.slice(0, emptyPPr.index)}${replacement}${paragraph.slice(emptyPPr.index + emptyPPr[0].length)}`
  }

  const opening = paragraph.match(/^<w:p\b[^>]*>/)?.[0]
  if (!opening) throw new Error('Cannot safely add a paragraph property to malformed DOCX paragraph')
  return `${opening}${withParagraphProperty('', 'suppressAutoHyphens', '<w:suppressAutoHyphens/>')}${paragraph.slice(opening.length)}`
}

function suppressAutomaticHyphenation(xml: string): string {
  const paragraphs = paragraphElementsIn(xml)
  return replaceXmlSpans(xml, paragraphs.flatMap((paragraph) => {
    const replacement = suppressAutomaticHyphenationInParagraph(paragraph.xml)
    return replacement === paragraph.xml ? [] : [{ start: paragraph.start, end: paragraph.end, replacement }]
  }))
}

function cleanStyleParagraph(paragraph: string, text: string, styles: { definitions: Map<string, ParagraphStyleDefinition>; defaultStyleId?: string }): string {
  if (xmlTagsIn(paragraph).filter((tag) => tag.name === 'w:p' && !tag.closing).length !== 1) {
    throw new Error('Cannot safely use a DOCX style source containing nested paragraphs')
  }
  const pPr = (paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? '')
    .replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, '')
    .replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '')
    .replace(/<w:pageBreakBefore\b[^>]*\/>/g, '')
    .replace(/<w:keepNext\b[^>]*\/>/g, '')
  const styleId = pPr.match(/<w:pStyle\b[^>]*\bw:val\s*=\s*["']([^"']+)["'][^>]*\/?\s*>/)?.[1] ?? styles.defaultStyleId
  const cleanPPr = styleHasNumbering(styleId, styles.definitions) ? disableInheritedNumbering(pPr) : pPr
  const style = dominantRunProperties(paragraph)
  return `<w:p>${cleanPPr}<w:r>${style}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

export async function applyBlockOperations(bytes: ArrayBuffer, operations: BlockOperation[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes)
  const originalBlocks = await buildBlockIndex(bytes)
  const styles = paragraphStyles(await zip.file('word/styles.xml')?.async('string') ?? '')
  const blockById = new Map(originalBlocks.map((block) => [block.blockId, block]))
  const byPart = new Map<string, BlockOperation[]>()
  for (const operation of operations) {
    const targetId = 'blockId' in operation ? operation.blockId : operation.anchorBlockId
    const target = blockById.get(targetId)
    if (!target) throw new Error(`Unknown DOCX block: ${targetId}`)
    if (operation.operation !== 'DELETE_BLOCK' && operation.operation !== 'REPLACE_BLOCK_TEXT') {
      const style = blockById.get(operation.styleSourceBlockId)
      if (!style) throw new Error(`Unknown DOCX style source block: ${operation.styleSourceBlockId}`)
      if (style.part !== target.part) throw new Error('DOCX block insertion must use a style source in the same package part')
    }
    const list = byPart.get(target.part) ?? []
    list.push(operation)
    byPart.set(target.part, list)
  }
  const editableParts = new Set([...byPart.keys(), ...Object.keys(zip.files).filter((part) => hyphenationPartPattern.test(part))])
  for (const part of editableParts) {
    let xml = await zip.file(part)!.async('string')
    const partOperations = byPart.get(part) ?? []
    const paragraphs = paragraphElementsIn(xml)
    const replacements = new Map<number, string>()
    const deletions = new Set<number>()
    const before = new Map<number, string[]>()
    const after = new Map<number, string[]>()
    const replacementTargets = new Set<number>()
    for (const operation of partOperations) {
      if (operation.operation === 'REPLACE_BLOCK_TEXT') {
        const block = blockById.get(operation.blockId)!
        const target = paragraphs[block.index]
        if (!target || target.stableIndex === undefined || idFor(part, target.stableIndex) !== operation.blockId) throw new Error(`DOCX block does not map uniquely to one paragraph: ${operation.blockId}`)
        if (replacementTargets.has(block.index)) throw new Error('Conflicting DOCX block replacements are ambiguous')
        replacementTargets.add(block.index)
        replacements.set(block.index, rewriteParagraph(target.xml, operation.finalText))
      } else if (operation.operation === 'DELETE_BLOCK') {
        const block = blockById.get(operation.blockId)!
        const target = paragraphs[block.index]
        if (!target || target.stableIndex === undefined || idFor(part, target.stableIndex) !== operation.blockId) throw new Error(`DOCX block does not map uniquely to one paragraph: ${operation.blockId}`)
        deletions.add(block.index)
      }
      else {
        const anchorId = operation.anchorBlockId
        const anchor = blockById.get(anchorId)!
        const style = blockById.get(operation.styleSourceBlockId)!
        const styleParagraph = paragraphs[style.index]
        const anchorParagraph = paragraphs[anchor.index]
        if (!styleParagraph || styleParagraph.stableIndex === undefined || idFor(part, styleParagraph.stableIndex) !== operation.styleSourceBlockId) throw new Error(`DOCX style source does not map uniquely to one paragraph: ${operation.styleSourceBlockId}`)
        if (!anchorParagraph || anchorParagraph.stableIndex === undefined || idFor(part, anchorParagraph.stableIndex) !== operation.anchorBlockId) throw new Error(`DOCX insertion anchor does not map uniquely to one paragraph: ${operation.anchorBlockId}`)
        const addition = cleanStyleParagraph(styleParagraph.xml, operation.finalText, styles)
        const map = operation.operation === 'INSERT_BLOCK_AFTER' ? after : before
        map.set(anchor.index, [...(map.get(anchor.index) ?? []), addition])
      }
    }
    const edits = paragraphs.flatMap((paragraph, index) => {
      const operationResult = deletions.has(index)
        ? ''
        : `${(before.get(index) ?? []).join('')}${replacements.get(index) ?? paragraph.xml}${(after.get(index) ?? []).join('')}`
      return operationResult === paragraph.xml ? [] : [{ start: paragraph.start, end: paragraph.end, replacement: operationResult }]
    })
    xml = suppressAutomaticHyphenation(replaceXmlSpans(xml, edits))
    zip.file(part, xml)
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}

/** Apply exact literal edits inside existing Word text nodes without rebuilding paragraphs or runs. */
export async function applyExactTextPatches(bytes: ArrayBuffer, patches: ExactTextPatch[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes)
  const blocks = await buildBlockIndex(bytes)
  const byBlock = new Map<string, ExactTextPatch[]>()
  for (const patch of patches) {
    if (!patch.expectedSource || !patch.replacement || patch.sourceStart < 0 || patch.sourceEnd <= patch.sourceStart) throw new Error('Atomic source patches require non-empty exact source and replacement literals')
    const block = blocks.find((item) => item.blockId === patch.blockId)
    if (!block) throw new Error(`Unknown atomic patch source block: ${patch.blockId}`)
    byBlock.set(patch.blockId, [...(byBlock.get(patch.blockId) ?? []), patch])
  }
  const byPart = new Map<string, Array<{ index: number; blockId: string; patches: ExactTextPatch[] }>>()
  for (const [blockId, blockPatches] of byBlock) {
    const block = blocks.find((item) => item.blockId === blockId)!
    byPart.set(block.part, [...(byPart.get(block.part) ?? []), { index: block.index, blockId, patches: blockPatches }])
  }
  for (const [part, targets] of byPart) {
    let xml = await zip.file(part)!.async('string')
    const paragraphs = paragraphElementsIn(xml)
    const edits: Array<{ start: number; end: number; replacement: string }> = []
    for (const target of targets) {
      const paragraph = paragraphs[target.index]
      if (!paragraph || idFor(part, paragraph.stableIndex!) !== target.blockId) throw new Error(`Atomic patch does not resolve to its exact source paragraph: ${target.blockId}`)
      if (fieldRangesIn(paragraph.xml).length) throw new Error(`Cannot safely apply an atomic source patch inside a paragraph containing dynamic Word fields: ${target.blockId}`)
      let patched = paragraph.xml
      const ordered = [...target.patches].sort((a, b) => b.sourceStart - a.sourceStart)
      const usedRanges: Array<{ start: number; end: number }> = []
      for (const patch of ordered) {
        const textNodes = [...patched.matchAll(/<w:t(\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        const decoded = textNodes.map((match) => unescapeXml(match[2]!))
        const joined = decoded.join('')
        const codePoints = Array.from(joined)
        if (codePoints.slice(patch.sourceStart, patch.sourceEnd).join('') !== patch.expectedSource) throw new Error(`Atomic source span does not match its exact inventoried occurrence in ${target.blockId}`)
        const at = codePoints.slice(0, patch.sourceStart).join('').length
        const end = codePoints.slice(0, patch.sourceEnd).join('').length
        if (usedRanges.some((range) => at < range.end && range.start < end)) throw new Error(`Atomic source patches overlap in ${target.blockId}`)
        usedRanges.push({ start: at, end })
        const nodeRanges: Array<{ start: number; end: number; match: RegExpMatchArray; value: string }> = []
        let offset = 0
        for (const match of textNodes) {
          const value = unescapeXml(match[2]!)
          nodeRanges.push({ start: offset, end: offset + value.length, match, value })
          offset += value.length
        }
        const touched = nodeRanges.filter((node) => at < node.end && node.start < end)
        if (!touched.length) throw new Error(`Atomic source span cannot be mapped to Word text nodes: ${target.blockId}`)
        const first = touched[0]!
        const last = touched.at(-1)!
        const firstLocal = at - first.start
        const lastLocal = end - last.start
        const replacements = new Map<string, string>()
        touched.forEach((node, index) => {
          const next = index === 0
            ? node.value.slice(0, firstLocal) + patch.replacement + (node === last ? node.value.slice(lastLocal) : '')
            : node === last ? node.value.slice(lastLocal) : ''
          replacements.set(node.match[0], next)
        })
        for (const [oldNode, value] of replacements) {
          const match = oldNode.match(/^(<w:t(?:\s[^>]*)?>)[\s\S]*?(<\/w:t>)$/)!
          const nextNode = value ? `${match[1]}${escapeXml(value)}${match[2]}` : ''
          patched = patched.replace(oldNode, nextNode)
        }
      }
      edits.push({ start: paragraph.start, end: paragraph.end, replacement: patched })
    }
    xml = replaceXmlSpans(xml, edits)
    zip.file(part, xml)
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}
