/**
 * Source field value presence tests.
 * Run: npm run test:source-field-value-presence
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { evaluateSourceFieldPresence } from './sourceFieldPresence'
import { buildIndexedDocxBlocks } from './indexedDocx'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function tableBlocks(rows: string[][]): ReturnType<typeof buildIndexedDocxBlocks> {
  return buildIndexedDocxBlocks({
    paragraphs: rows.flatMap((row, rowIndex) =>
      row.map((text, cellIndex) => ({
        index: rowIndex * row.length + cellIndex,
        text,
        origin: {
          kind: 'tableCell' as const,
          tableIndex: 0,
          rowIndex,
          cellIndex,
          cellParagraphIndex: 0,
        },
      })),
    ),
    tables: [
      {
        tableIndex: 0,
        rows: rows.map((cells, rowIndex) => ({
          rowIndex,
          cells: cells.map((normalizedText, cellIndex) => ({
            cellIndex,
            rawText: normalizedText,
            normalizedText,
            paragraphs: [],
          })),
        })),
      },
    ],
  })
}

function main() {
  const prepStage = blocksFromPlainParagraphs([
    'przygotowania Panny Młodej i Pana Młodego',
  ])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: prepStage,
      fieldKey: 'preparation_location',
    }).presence,
    'label_or_stage_only',
    '1 preparation stage only',
  )

  const ceremonyStage = blocksFromPlainParagraphs(['ceremonię zaślubin'])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: ceremonyStage,
      fieldKey: 'ceremony_location',
    }).presence,
    'label_or_stage_only',
    '2 ceremony stage only',
  )

  const prepTable = tableBlocks([['Przygotowania', 'Hotel Stary, Kraków']])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: prepTable,
      fieldKey: 'preparation_location',
    }).presence,
    'present_supported_value',
    '3 preparation table value',
  )

  const ceremonyTable = tableBlocks([['Ceremonia', 'Kościół Mariacki, Kraków']])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: ceremonyTable,
      fieldKey: 'ceremony_location',
    }).presence,
    'present_supported_value',
    '4 ceremony table value',
  )

  const depositAbsent = blocksFromPlainParagraphs(['Umowa bez zadatku'])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: depositAbsent,
      fieldKey: 'agreed_deposit_formatted',
    }).presence,
    'absent',
    '10 deposit absent',
  )

  const relativePayment = blocksFromPlainParagraphs([
    'płatne najpóźniej w terminie 14 dni przed datą wydarzenia.',
  ])
  assertEq(
    evaluateSourceFieldPresence({
      blocks: relativePayment,
      fieldKey: 'payment_due_date',
      warnings: [
        {
          code: 'unsupported_payment_structure',
          message: 'Payment term is relative',
          blockId: null,
        },
      ],
    }).presence,
    'present_unsupported_value',
    '11 relative payment',
  )
  assertEq(
    evaluateSourceFieldPresence({
      blocks: relativePayment,
      fieldKey: 'payment_due_date',
      warnings: [
        {
          code: 'unsupported_payment_structure',
          message: 'Payment term is relative',
          blockId: null,
        },
      ],
    }).requiresMapping,
    false,
    '11 relative payment not required',
  )

  console.log('ok — sourceFieldValuePresence')
}

void main()
