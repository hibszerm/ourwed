/**
 * Physical locators for DOCX body paragraphs and table cells.
 * Generation still applies via global paragraphIndex + offsets;
 * table coordinates distinguish identical text in different cells.
 */

export type DocxPhysicalLocator =
  | {
      kind: 'paragraph'
      paragraphIndex: number
      start: number
      end: number
    }
  | {
      kind: 'tableCell'
      tableIndex: number
      rowIndex: number
      cellIndex: number
      /** Paragraph index within the cell (usually 0). */
      paragraphIndex: number
      /** Global body paragraph index (same stream as extractDocxParagraphs). */
      globalParagraphIndex: number
      start: number
      end: number
    }

export type DocxParagraphOrigin =
  | { kind: 'body' }
  | {
      kind: 'tableCell'
      tableIndex: number
      rowIndex: number
      cellIndex: number
      cellParagraphIndex: number
    }

export function bindingIdForLocator(
  registryKey: string,
  locator: DocxPhysicalLocator,
): string {
  if (locator.kind === 'paragraph') {
    return `slot-${registryKey}-para-${locator.paragraphIndex}-start-${locator.start}-end-${locator.end}`
  }
  return [
    'slot',
    registryKey,
    'table',
    locator.tableIndex,
    'row',
    locator.rowIndex,
    'cell',
    locator.cellIndex,
    'para',
    locator.paragraphIndex,
    'start',
    locator.start,
    'end',
    locator.end,
  ].join('-')
}

export function physicalLocatorFromOrigin(
  origin: DocxParagraphOrigin | undefined,
  globalParagraphIndex: number,
  start: number,
  end: number,
): DocxPhysicalLocator {
  if (origin?.kind === 'tableCell') {
    return {
      kind: 'tableCell',
      tableIndex: origin.tableIndex,
      rowIndex: origin.rowIndex,
      cellIndex: origin.cellIndex,
      paragraphIndex: origin.cellParagraphIndex,
      globalParagraphIndex,
      start,
      end,
    }
  }
  return { kind: 'paragraph', paragraphIndex: globalParagraphIndex, start, end }
}
