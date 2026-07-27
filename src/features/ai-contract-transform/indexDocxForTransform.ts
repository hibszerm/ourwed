/**
 * Index DOCX into transform blocks — reuses production extraction.
 * Independent of the semantic mapping experiment types.
 */

import {
  extractDocxDocumentModel,
  type DocxExtractedTable,
  type IndexedParagraph,
} from '@/features/documents/template/extractDocxParagraphs'
import {
  buildTableCellContext,
  detectServiceScopeTables,
  type TableGrid,
} from './tableRowOwnership'
import type { TransformDocumentBlock } from './types'

function tablesToGrids(tables: DocxExtractedTable[]): TableGrid[] {
  return tables.map((t) => ({
    tableIndex: t.tableIndex,
    rows: t.rows.map((r) => ({
      rowIndex: r.rowIndex,
      cells: r.cells.map((c) => ({
        cellIndex: c.cellIndex,
        text: (c.normalizedText || c.rawText || '').trim(),
      })),
    })),
  }))
}

function buildBlocks(input: {
  paragraphs: IndexedParagraph[]
  tables: DocxExtractedTable[]
}): TransformDocumentBlock[] {
  const grids = tablesToGrids(input.tables)
  const serviceTables = detectServiceScopeTables(grids)
  const gridByIndex = new Map(grids.map((g) => [g.tableIndex, g]))

  const blocks: TransformDocumentBlock[] = []
  for (const p of input.paragraphs) {
    if (p.origin?.kind === 'tableCell') {
      const table = gridByIndex.get(p.origin.tableIndex)
      const tableContext = table
        ? buildTableCellContext({
            table,
            rowIndex: p.origin.rowIndex,
            cellIndex: p.origin.cellIndex,
            isServiceScopeTable: serviceTables.has(p.origin.tableIndex),
          })
        : undefined
      blocks.push({
        blockId: `table-${p.origin.tableIndex}-row-${p.origin.rowIndex}-cell-${p.origin.cellIndex}-p-${p.origin.cellParagraphIndex}`,
        paragraphIndex: p.index,
        text: p.text,
        kind: 'tableCell',
        tableIndex: p.origin.tableIndex,
        rowIndex: p.origin.rowIndex,
        cellIndex: p.origin.cellIndex,
        tableContext,
      })
    } else {
      blocks.push({
        blockId: `para-${p.index}`,
        paragraphIndex: p.index,
        text: p.text,
        kind: 'paragraph',
      })
    }
  }
  return blocks
}

export async function indexDocxForTransform(
  bytes: ArrayBuffer,
): Promise<TransformDocumentBlock[]> {
  const model = await extractDocxDocumentModel(bytes)
  return buildBlocks(model)
}

export function blocksFromPlainParagraphs(
  paragraphs: string[],
): TransformDocumentBlock[] {
  return paragraphs.map((text, i) => ({
    blockId: `para-${i}`,
    paragraphIndex: i,
    text,
    kind: 'paragraph' as const,
  }))
}

/** Build blocks from an in-memory table+paragraph fixture (no DOCX). */
export function blocksFromTableFixture(input: {
  tables: Array<{
    tableIndex: number
    rows: Array<{ cells: string[] }>
  }>
  bodyParagraphs?: string[]
}): TransformDocumentBlock[] {
  const grids: TableGrid[] = input.tables.map((t) => ({
    tableIndex: t.tableIndex,
    rows: t.rows.map((r, rowIndex) => ({
      rowIndex,
      cells: r.cells.map((text, cellIndex) => ({ cellIndex, text })),
    })),
  }))
  const serviceTables = detectServiceScopeTables(grids)
  const blocks: TransformDocumentBlock[] = []
  let paragraphIndex = 0

  for (const table of grids) {
    for (const row of table.rows) {
      for (const cell of row.cells) {
        const tableContext = buildTableCellContext({
          table,
          rowIndex: row.rowIndex,
          cellIndex: cell.cellIndex,
          isServiceScopeTable: serviceTables.has(table.tableIndex),
        })
        blocks.push({
          blockId: `table-${table.tableIndex}-row-${row.rowIndex}-cell-${cell.cellIndex}-p-0`,
          paragraphIndex: paragraphIndex++,
          text: cell.text,
          kind: 'tableCell',
          tableIndex: table.tableIndex,
          rowIndex: row.rowIndex,
          cellIndex: cell.cellIndex,
          tableContext,
        })
      }
    }
  }

  for (const text of input.bodyParagraphs ?? []) {
    blocks.push({
      blockId: `para-${paragraphIndex}`,
      paragraphIndex: paragraphIndex++,
      text,
      kind: 'paragraph',
    })
  }
  return blocks
}
