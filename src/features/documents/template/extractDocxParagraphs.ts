/**
 * Shared DOCX paragraph extraction with stable indices (includes empty paras).
 * Import binding and contract generation MUST use the same indexing + canonical text.
 *
 * Table cell paragraphs stay in the same global index stream as body paragraphs
 * (document order). Optional origin metadata preserves table/row/cell coordinates
 * without faking global offsets for cell text.
 *
 * Uses a stack walk over word/document.xml (no DOMParser) so Node tests and
 * browsers share one indexing algorithm.
 */

import JSZip from 'jszip'
import { cloneArrayBuffer } from '@/features/documents/mapping/extraction/sourceKind'
import { extractCanonicalParagraphText } from './canonicalParagraph'
import type { DocxParagraphOrigin } from './docxPhysicalLocator'

export interface IndexedParagraph {
  index: number
  /** Canonical paragraph text — offsets are only valid in this form. */
  text: string
  /** Where this paragraph lives in the DOCX body / table structure. */
  origin?: DocxParagraphOrigin
}

export interface DocxExtractedCellParagraph {
  cellParagraphIndex: number
  globalParagraphIndex: number
  rawText: string
  normalizedText: string
  paragraphs: string[]
  runs: string[]
}

export interface DocxExtractedCell {
  cellIndex: number
  rawText: string
  normalizedText: string
  paragraphs: DocxExtractedCellParagraph[]
}

export interface DocxExtractedRow {
  rowIndex: number
  cells: DocxExtractedCell[]
}

export interface DocxExtractedTable {
  tableIndex: number
  rows: DocxExtractedRow[]
}

export interface DocxExtractionResult {
  paragraphs: IndexedParagraph[]
  tables: DocxExtractedTable[]
}

function normalizeDiagText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function extractRuns(paragraphXml: string): string[] {
  const runs: string[] = []
  const re = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g
  let m: RegExpExecArray | null
  while ((m = re.exec(paragraphXml))) {
    runs.push(m[1] ?? '')
  }
  return runs
}

type OpenTag =
  | { kind: 'tbl'; tableIndex: number }
  | { kind: 'tr'; tableIndex: number; rowIndex: number }
  | {
      kind: 'tc'
      tableIndex: number
      rowIndex: number
      cellIndex: number
      cellParas: DocxExtractedCellParagraph[]
    }

function matchOpen(xml: string, from: number, name: string): number {
  // Prefer word-boundary after the local name so pPr / tblPr do not match.
  const re = new RegExp(`<w:${name}\\b`, 'g')
  re.lastIndex = from
  const m = re.exec(xml)
  return m ? m.index : -1
}

function matchClose(xml: string, from: number, name: string): number {
  return xml.indexOf(`</w:${name}>`, from)
}

/**
 * Walk document.xml and enumerate every w:p in document order, assigning
 * table coordinates when the paragraph lives inside a cell.
 */
export function extractDocxParagraphsFromXml(xml: string): DocxExtractionResult {
  const paragraphs: IndexedParagraph[] = []
  const tables: DocxExtractedTable[] = []

  // Restrict to body when present to avoid header/footer parts if inlined.
  const bodyOpen = matchOpen(xml, 0, 'body')
  const bodyClose = bodyOpen >= 0 ? matchClose(xml, bodyOpen, 'body') : -1
  const scan = bodyOpen >= 0 && bodyClose > bodyOpen ? xml.slice(bodyOpen, bodyClose) : xml
  const baseOffset = bodyOpen >= 0 && bodyClose > bodyOpen ? bodyOpen : 0

  let i = 0
  let globalIndex = 0
  let tableIndex = -1
  const stack: OpenTag[] = []

  // Mutable builders for the current table
  let currentTable: DocxExtractedTable | null = null
  let currentRow: DocxExtractedRow | null = null

  const pushParagraph = (paragraphXml: string, origin: DocxParagraphOrigin) => {
    const text = extractCanonicalParagraphText(paragraphXml)
    const runs = extractRuns(paragraphXml)
    const para: IndexedParagraph = { index: globalIndex, text, origin }
    paragraphs.push(para)

    if (origin.kind === 'tableCell' && currentRow) {
      let cell = currentRow.cells.find((c) => c.cellIndex === origin.cellIndex)
      if (!cell) {
        cell = {
          cellIndex: origin.cellIndex,
          rawText: '',
          normalizedText: '',
          paragraphs: [],
        }
        currentRow.cells.push(cell)
      }
      cell.paragraphs.push({
        cellParagraphIndex: origin.cellParagraphIndex,
        globalParagraphIndex: globalIndex,
        rawText: text,
        normalizedText: normalizeDiagText(text),
        paragraphs: [text],
        runs,
      })
      cell.rawText = cell.paragraphs.map((p) => p.rawText).join('\n')
      cell.normalizedText = normalizeDiagText(cell.rawText)
    }

    globalIndex += 1
  }

  while (i < scan.length) {
    const abs = baseOffset + i
    void abs

    const nextTbl = matchOpen(scan, i, 'tbl')
    const nextTr = matchOpen(scan, i, 'tr')
    const nextTc = matchOpen(scan, i, 'tc')
    const nextP = matchOpen(scan, i, 'p')
    const nextCloseTbl = matchClose(scan, i, 'tbl')
    const nextCloseTr = matchClose(scan, i, 'tr')
    const nextCloseTc = matchClose(scan, i, 'tc')

    type Hit = { at: number; kind: string }
    const hits: Hit[] = []
    if (nextTbl >= 0) hits.push({ at: nextTbl, kind: 'open-tbl' })
    if (nextTr >= 0) hits.push({ at: nextTr, kind: 'open-tr' })
    if (nextTc >= 0) hits.push({ at: nextTc, kind: 'open-tc' })
    if (nextP >= 0) hits.push({ at: nextP, kind: 'open-p' })
    if (nextCloseTbl >= 0) hits.push({ at: nextCloseTbl, kind: 'close-tbl' })
    if (nextCloseTr >= 0) hits.push({ at: nextCloseTr, kind: 'close-tr' })
    if (nextCloseTc >= 0) hits.push({ at: nextCloseTc, kind: 'close-tc' })

    if (hits.length === 0) break
    hits.sort((a, b) => a.at - b.at || a.kind.localeCompare(b.kind))
    const hit = hits[0]!

    if (hit.kind === 'open-p') {
      // Skip property-only false positives already prevented by \b.
      const slice = scan.slice(hit.at)
      const m = /^<w:p\b[\s\S]*?<\/w:p>/.exec(slice)
      if (!m) {
        i = hit.at + 4
        continue
      }
      const paragraphXml = m[0]!
      const tc = [...stack].reverse().find((s) => s.kind === 'tc') as
        | Extract<OpenTag, { kind: 'tc' }>
        | undefined
      if (tc) {
        const cellParagraphIndex = tc.cellParas.length
        const origin: DocxParagraphOrigin = {
          kind: 'tableCell',
          tableIndex: tc.tableIndex,
          rowIndex: tc.rowIndex,
          cellIndex: tc.cellIndex,
          cellParagraphIndex,
        }
        // Track for cellParas count
        tc.cellParas.push({
          cellParagraphIndex,
          globalParagraphIndex: globalIndex,
          rawText: '',
          normalizedText: '',
          paragraphs: [],
          runs: [],
        })
        pushParagraph(paragraphXml, origin)
      } else {
        pushParagraph(paragraphXml, { kind: 'body' })
      }
      i = hit.at + paragraphXml.length
      continue
    }

    if (hit.kind === 'open-tbl') {
      tableIndex += 1
      currentTable = { tableIndex, rows: [] }
      stack.push({ kind: 'tbl', tableIndex })
      i = hit.at + '<w:tbl'.length
      continue
    }

    if (hit.kind === 'open-tr') {
      const tbl = [...stack].reverse().find((s) => s.kind === 'tbl') as
        | Extract<OpenTag, { kind: 'tbl' }>
        | undefined
      if (!tbl || !currentTable) {
        i = hit.at + 5
        continue
      }
      const rowIndex = currentTable.rows.length
      currentRow = { rowIndex, cells: [] }
      currentTable.rows.push(currentRow)
      stack.push({ kind: 'tr', tableIndex: tbl.tableIndex, rowIndex })
      i = hit.at + '<w:tr'.length
      continue
    }

    if (hit.kind === 'open-tc') {
      const tr = [...stack].reverse().find((s) => s.kind === 'tr') as
        | Extract<OpenTag, { kind: 'tr' }>
        | undefined
      if (!tr || !currentRow) {
        i = hit.at + 5
        continue
      }
      const cellIndex = currentRow.cells.length
      // Pre-create empty cell so order is stable even before paragraphs.
      currentRow.cells.push({
        cellIndex,
        rawText: '',
        normalizedText: '',
        paragraphs: [],
      })
      stack.push({
        kind: 'tc',
        tableIndex: tr.tableIndex,
        rowIndex: tr.rowIndex,
        cellIndex,
        cellParas: [],
      })
      i = hit.at + '<w:tc'.length
      continue
    }

    if (hit.kind === 'close-tc') {
      while (stack.length && stack[stack.length - 1]!.kind !== 'tc') stack.pop()
      stack.pop()
      i = hit.at + '</w:tc>'.length
      continue
    }

    if (hit.kind === 'close-tr') {
      while (stack.length && stack[stack.length - 1]!.kind !== 'tr') stack.pop()
      stack.pop()
      currentRow = null
      i = hit.at + '</w:tr>'.length
      continue
    }

    if (hit.kind === 'close-tbl') {
      while (stack.length && stack[stack.length - 1]!.kind !== 'tbl') stack.pop()
      stack.pop()
      if (currentTable) tables.push(currentTable)
      currentTable = null
      currentRow = null
      i = hit.at + '</w:tbl>'.length
      continue
    }
  }

  if (typeof console !== 'undefined' && console.info) {
    console.info('[docx-table-extraction]', {
      tables: tables.map((t) => ({
        tableIndex: t.tableIndex,
        rows: t.rows.map((r) => ({
          rowIndex: r.rowIndex,
          cells: r.cells.map((c) => ({
            cellIndex: c.cellIndex,
            rawText: c.rawText,
            normalizedText: c.normalizedText,
            paragraphs: c.paragraphs.map((p) => p.rawText),
            runs: c.paragraphs.flatMap((p) => p.runs),
          })),
        })),
      })),
    })
  }

  return { paragraphs, tables }
}

export async function extractDocxDocumentModel(
  bytes: ArrayBuffer,
): Promise<DocxExtractionResult> {
  const zip = await JSZip.loadAsync(cloneArrayBuffer(bytes))
  const docFile = zip.file('word/document.xml')
  if (!docFile) return { paragraphs: [], tables: [] }
  const xml = await docFile.async('string')
  return extractDocxParagraphsFromXml(xml)
}

export async function extractDocxParagraphsIncludingEmpty(
  bytes: ArrayBuffer,
): Promise<IndexedParagraph[]> {
  const { paragraphs } = await extractDocxDocumentModel(bytes)
  return paragraphs
}

/** Fingerprint for recovering a paragraph if offsets shift. */
export function paragraphFingerprint(text: string): string {
  const n = text.replace(/\s+/g, ' ').trim().slice(0, 120)
  return n
}

/**
 * Rebuild a lightweight table model from paragraph origins when the full
 * extraction result is unavailable (e.g. sync-from-source).
 */
export function tablesFromParagraphOrigins(
  paragraphs: IndexedParagraph[],
): DocxExtractedTable[] {
  const byTable = new Map<number, DocxExtractedTable>()
  for (const p of paragraphs) {
    if (p.origin?.kind !== 'tableCell') continue
    const { tableIndex, rowIndex, cellIndex, cellParagraphIndex } = p.origin
    let table = byTable.get(tableIndex)
    if (!table) {
      table = { tableIndex, rows: [] }
      byTable.set(tableIndex, table)
    }
    let row = table.rows.find((r) => r.rowIndex === rowIndex)
    if (!row) {
      row = { rowIndex, cells: [] }
      table.rows.push(row)
    }
    let cell = row.cells.find((c) => c.cellIndex === cellIndex)
    if (!cell) {
      cell = {
        cellIndex,
        rawText: '',
        normalizedText: '',
        paragraphs: [],
      }
      row.cells.push(cell)
    }
    cell.paragraphs.push({
      cellParagraphIndex,
      globalParagraphIndex: p.index,
      rawText: p.text,
      normalizedText: normalizeDiagText(p.text),
      paragraphs: [p.text],
      runs: [],
    })
    cell.rawText = cell.paragraphs.map((x) => x.rawText).join('\n')
    cell.normalizedText = normalizeDiagText(cell.rawText)
  }
  return [...byTable.values()]
    .sort((a, b) => a.tableIndex - b.tableIndex)
    .map((t) => ({
      ...t,
      rows: t.rows
        .sort((a, b) => a.rowIndex - b.rowIndex)
        .map((r) => ({
          ...r,
          cells: r.cells.sort((a, b) => a.cellIndex - b.cellIndex),
        })),
    }))
}
