import JSZip from 'jszip'
import { extractCanonicalParagraphText, escapeXml, unescapeXml } from '@/features/documents/template/canonicalParagraph'
import { extractDocxParagraphsFromXml } from '@/features/documents/template/extractDocxParagraphs'

export type BlockKind = 'body' | 'tableCell' | 'header' | 'footer'
export type EditableBlock = { blockId: string; part: string; index: number; kind: BlockKind; text: string; context: string }
export type BlockOperation =
  | { blockId: string; operation: 'REPLACE_BLOCK_TEXT'; finalText: string }
  | { anchorBlockId: string; operation: 'INSERT_BLOCK_AFTER' | 'INSERT_BLOCK_BEFORE'; finalText: string; styleSourceBlockId: string }
  | { blockId: string; operation: 'DELETE_BLOCK' }

const partPattern = /^word\/(document|header\d+|footer\d+)\.xml$/
const paragraphsIn = (xml: string) => [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g)].map((m) => m[0]!)
const idFor = (part: string, index: number) => `${part}#p${index}`
const textFor = (paragraph: string) => extractCanonicalParagraphText(paragraph)

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
    const paras = paragraphsIn(xml)
    let kinds: BlockKind[]
    const indexed = part === 'word/document.xml' ? extractDocxParagraphsFromXml(xml).paragraphs : []
    if (part === 'word/document.xml') {
      kinds = paras.map((_, i) => indexed[i]?.origin?.kind === 'tableCell' ? 'tableCell' : 'body')
    } else kinds = paras.map(() => part.includes('header') ? 'header' : 'footer')
    for (let index = 0; index < paras.length; index++) {
      const text = textFor(paras[index]!)
      const previous = blocks.at(-1)?.part === part ? blocks.at(-1)?.text ?? '' : ''
      const next = paras[index + 1] ? textFor(paras[index + 1]!) : ''
      const origin = indexed[index]?.origin
      const structure = origin?.kind === 'tableCell' ? `Table ${origin.tableIndex}, row ${origin.rowIndex}, cell ${origin.cellIndex}. ` : ''
      blocks.push({ blockId: idFor(part, index), part, index, kind: kinds[index]!, text, context: `${structure}Previous: ${previous}\nCurrent: ${text}\nNext: ${next}` })
    }
  }
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
  if (!ordered.length || (ordered[1] && ordered[0]!.n === ordered[1]!.n)) throw new Error('Cannot preserve block formatting: ambiguous dominant run style')
  return visual(ordered[0]!.run)
}

function rewriteParagraph(paragraph: string, finalText: string): string {
  const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ''
  const runs = [...paragraph.matchAll(/<w:r\b[\s\S]*?<\/w:r>/g)].map((m) => m[0]!)
  let prefix = ''
  let bodyText = finalText
  let bodyStyle = dominantRunProperties(paragraph)
  const firstText = runs[0] ? [...runs[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((m) => unescapeXml(m[1]!)).join('') : ''
  const marker = firstText.match(/^\s*(§\s*\d+(?:\.\d+)*[.)]?|\d+(?:\.\d+)*[.)]|[•*–—-]|[\p{L}\p{N}][\p{L}\p{N}\s.-]{0,22}:)\s*$/u)
  if (marker && runs.length > 1 && finalText.startsWith(marker[0].trim())) {
    prefix = marker[0].trim()
    const sourceBoundary = structuralPrefixBoundary(paragraph, runs)
    if (!sourceBoundary) {
      return `<w:p>${pPr}<w:r>${bodyStyle}<w:t xml:space="preserve">${escapeXml(finalText)}</w:t></w:r></w:p>`
    }
    const separator = sourceBoundary.separator
    bodyText = finalText.slice(prefix.length).replace(/^\s+/, '')
    bodyStyle = dominantRunProperties(paragraph)
    const prefixStyle = runs[0]!.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
    const prefixRun = `<w:r>${prefixStyle}<w:t xml:space="preserve">${escapeXml(prefix + separator)}</w:t></w:r>`
    const bodyRun = `<w:r>${bodyStyle}<w:t xml:space="preserve">${escapeXml(bodyText)}</w:t></w:r>`
    return `<w:p>${pPr}${prefixRun}${bodyRun}</w:p>`
  }
  return `<w:p>${pPr}<w:r>${bodyStyle}<w:t xml:space="preserve">${escapeXml(finalText)}</w:t></w:r></w:p>`
}

function structuralPrefixBoundary(paragraph: string, runs: string[]): { separator: string } | undefined {
  const runText = (run: string) => [...run.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].map((match) => unescapeXml(match[1]!)).join('')
  const prefix = runText(runs[0] ?? '')
  const prefixMatch = prefix.match(/^\s*(§\s*\d+(?:\.\d+)*[.)]?|\d+(?:\.\d+)*[.)]|[•*–—-])\s*$/u)
  if (!prefixMatch) return undefined
  const elements = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/>|<w:br\b[^>]*\/>/g)]
  const markerElementIndex = elements.findIndex((element) => element[1] !== undefined && unescapeXml(element[1]!) === prefixMatch[0])
  if (markerElementIndex >= 0) {
    const nextElement = elements[markerElementIndex + 1]
    if (nextElement?.[0].startsWith('<w:tab')) return { separator: '\t' }
    if (nextElement?.[0].startsWith('<w:br')) return { separator: '\n' }
    if (nextElement?.[1] !== undefined) {
      const nextText = unescapeXml(nextElement[1]!)
      const leading = nextText.match(/^\s+/)?.[0]
      if (leading) return { separator: leading }
      const prefixParts = runText(runs[0] ?? '')
      if (prefixParts === prefixMatch[0] && isNumberedStructuralPrefix(prefixMatch[0].trim())) return { separator: ' ' }
      return undefined
    }
  }
  const pPr = paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ''
  if (/<w:numPr\b/.test(pPr)) return { separator: ' ' }
  return undefined
}

function isNumberedStructuralPrefix(prefix: string): boolean {
  return /^(?:§\s*)?\d+(?:\.\d+)*[.)]$/.test(prefix)
}

function cleanStyleParagraph(paragraph: string, text: string): string {
  const pPr = (paragraph.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? '')
    .replace(/<w:numPr\b[\s\S]*?<\/w:numPr>/g, '')
    .replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '')
    .replace(/<w:pageBreakBefore\b[^>]*\/>/g, '')
    .replace(/<w:keepNext\b[^>]*\/>/g, '')
  const style = dominantRunProperties(paragraph)
  return `<w:p>${pPr}<w:r>${style}<w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`
}

export async function applyBlockOperations(bytes: ArrayBuffer, operations: BlockOperation[]): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(bytes)
  const originalBlocks = await buildBlockIndex(bytes)
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
  for (const [part, partOperations] of byPart) {
    let xml = await zip.file(part)!.async('string')
    const paragraphs = paragraphsIn(xml)
    const replacements = new Map<number, string>()
    const deletions = new Set<number>()
    const before = new Map<number, string[]>()
    const after = new Map<number, string[]>()
    for (const operation of partOperations) {
      if (operation.operation === 'REPLACE_BLOCK_TEXT') {
        const block = blockById.get(operation.blockId)!
        replacements.set(block.index, rewriteParagraph(paragraphs[block.index]!, operation.finalText))
      } else if (operation.operation === 'DELETE_BLOCK') deletions.add(blockById.get(operation.blockId)!.index)
      else {
        const anchorId = operation.anchorBlockId
        const anchor = blockById.get(anchorId)!
        const style = blockById.get(operation.styleSourceBlockId)!
        const addition = cleanStyleParagraph(paragraphs[style.index]!, operation.finalText)
        const map = operation.operation === 'INSERT_BLOCK_AFTER' ? after : before
        map.set(anchor.index, [...(map.get(anchor.index) ?? []), addition])
      }
    }
    const changed = paragraphs.map((paragraph, index) => {
      if (deletions.has(index)) return ''
      const text = replacements.get(index) ?? paragraph
      return `${(before.get(index) ?? []).join('')}${text}${(after.get(index) ?? []).join('')}`
    })
    let cursor = 0
    xml = xml.replace(/<w:p\b[\s\S]*?<\/w:p>/g, () => changed[cursor++] ?? '')
    if (part === 'word/document.xml') xml = collapseRedundantEmptyParagraphsBeforePageBreak(xml)
    zip.file(part, xml)
  }
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })
}


/** Keep one authored spacer before a hard page-break heading, but remove any
 * redundant trailing empty paragraphs that can spill onto a page by themselves. */
function collapseRedundantEmptyParagraphsBeforePageBreak(xml: string): string {
  const bodyStart = xml.match(/<w:body\b[^>]*>/)
  const bodyClose = xml.lastIndexOf('</w:body>')
  if (!bodyStart || bodyClose < bodyStart.index! + bodyStart[0].length) return xml
  const contentStart = bodyStart.index! + bodyStart[0].length
  const body = xml.slice(contentStart, bodyClose)
  const paragraphs: Array<{ start: number; end: number; xml: string; inTableCell: boolean }> = []
  const paragraphPattern = /<w:p\b[\s\S]*?<\/w:p>/g
  let match: RegExpExecArray | null
  while ((match = paragraphPattern.exec(body))) {
    const prefix = body.slice(0, match.index)
    const tableCellDepth = [...prefix.matchAll(/<w:tc\b[^>]*>/g)].length - [...prefix.matchAll(/<\/w:tc\s*>/g)].length
    paragraphs.push({ start: match.index, end: match.index + match[0].length, xml: match[0], inTableCell: tableCellDepth > 0 })
  }
  const emptySafe = (paragraph: string) => {
    if (extractCanonicalParagraphText(paragraph) !== '') return false
    if (/<w:sectPr\b/.test(paragraph)) return false
    const content = paragraph.replace(/<w:pPr\b[\s\S]*?<\/w:pPr>/, '')
    if (/<w:(?:br|tab|drawing|object|pict|fldChar|instrText|bookmarkStart|bookmarkEnd|hyperlink|footnoteReference|endnoteReference)\b/.test(content)) return false
    return [...content.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)].every((text) => text[1] === '')
  }
  const remove: Array<{ start: number; end: number }> = []
  for (let index = 0; index < paragraphs.length; index++) {
    const current = paragraphs[index]!
    if (current.inTableCell || !/<w:pageBreakBefore\b(?:[^>]*\bw:val\s*=\s*["'](?:1|true|on)["'][^>]*)?\s*\/>/.test(current.xml)) continue
    let previousIndex = index - 1
    let redundant = 0
    while (previousIndex >= 0) {
      const previous = paragraphs[previousIndex]!
      if (previous.inTableCell || body.slice(previous.end, previousIndex === index - 1 ? current.start : paragraphs[previousIndex + 1]!.start).trim() !== '' || !emptySafe(previous.xml)) break
      redundant++
      previousIndex--
    }
    if (redundant > 1) {
      // Remove only the empty spacer closest to the page-break paragraph.
      const previous = paragraphs[index - 1]!
      remove.push({ start: previous.start, end: previous.end })
    }
  }
  if (!remove.length) return xml
  let updated = body
  for (const range of remove.sort((a, b) => b.start - a.start)) updated = updated.slice(0, range.start) + updated.slice(range.end)
  return xml.slice(0, contentStart) + updated + xml.slice(bodyClose)
}
