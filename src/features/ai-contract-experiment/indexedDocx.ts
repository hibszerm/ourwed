/**
 * Shared indexed DOCX model for both experiment modes.
 * Reuses package table-aware extraction; does not flatten table coordinates.
 */

import {
  extractDocxDocumentModel,
  type DocxExtractedTable,
  type IndexedParagraph,
} from '@/features/documents/template/extractDocxParagraphs'
import type { IndexedDocxBlock, IndexedDocxRun } from './types'

function runsFromText(text: string): IndexedDocxRun[] {
  // Phase 1: single synthetic run; run boundaries preserved as structure.
  return text ? [{ runIndex: 0, text }] : []
}

function headerTextsForTable(table: DocxExtractedTable): string[] {
  const header = table.rows[0]
  if (!header) return []
  return header.cells.map((c) => c.normalizedText)
}

function rowTextsFor(
  table: DocxExtractedTable,
  rowIndex: number,
): string[] {
  const row = table.rows.find((r) => r.rowIndex === rowIndex)
  if (!row) return []
  return row.cells.map((c) => c.normalizedText)
}

export function buildIndexedDocxBlocks(input: {
  paragraphs: IndexedParagraph[]
  tables: DocxExtractedTable[]
}): IndexedDocxBlock[] {
  const blocks: IndexedDocxBlock[] = []
  const tablesByIndex = new Map(
    input.tables.map((t) => [t.tableIndex, t] as const),
  )

  for (const p of input.paragraphs) {
    if (p.origin?.kind === 'tableCell') {
      const table = tablesByIndex.get(p.origin.tableIndex)
      blocks.push({
        id: `table-${p.origin.tableIndex}-row-${p.origin.rowIndex}-cell-${p.origin.cellIndex}-p-${p.origin.cellParagraphIndex}`,
        kind: 'tableCell',
        paragraphIndex: p.index,
        tableIndex: p.origin.tableIndex,
        rowIndex: p.origin.rowIndex,
        cellIndex: p.origin.cellIndex,
        text: p.text,
        rowTexts: table
          ? rowTextsFor(table, p.origin.rowIndex)
          : [p.text],
        headerTexts: table ? headerTextsForTable(table) : [],
        runs: runsFromText(p.text),
      })
    } else {
      blocks.push({
        id: `para-${p.index}`,
        kind: 'paragraph',
        paragraphIndex: p.index,
        text: p.text,
        runs: runsFromText(p.text),
      })
    }
  }
  return blocks
}

export async function indexDocxBytes(
  bytes: ArrayBuffer,
): Promise<{
  paragraphs: IndexedParagraph[]
  tables: DocxExtractedTable[]
  blocks: IndexedDocxBlock[]
}> {
  const model = await extractDocxDocumentModel(bytes)
  const blocks = buildIndexedDocxBlocks(model)
  return { paragraphs: model.paragraphs, tables: model.tables, blocks }
}

export function findBlockById(
  blocks: IndexedDocxBlock[],
  blockId: string,
): IndexedDocxBlock | undefined {
  return blocks.find((b) => b.id === blockId)
}

export function findBlockContainingText(
  blocks: IndexedDocxBlock[],
  sourceText: string,
): IndexedDocxBlock | undefined {
  const needle = sourceText.trim()
  if (!needle) return undefined
  return blocks.find((b) => b.text.includes(needle))
}
