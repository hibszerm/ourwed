/**
 * Location requirement derivation tests.
 * Run: npm run test:location-requirement-derivation
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { deriveEventLocationCapability } from './eventLocationCapability'
import { evaluateSourceFieldPresence } from './sourceFieldPresence'
import { requiredLocationKeys } from './eventLocationCapability'
import { buildIndexedDocxBlocks } from './indexedDocx'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import type { ValidatedAiMapping } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

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

function approvedMapping(
  fieldKey: ValidatedAiMapping['fieldKey'],
  value: string,
): ValidatedAiMapping {
  return {
    id: `id:${fieldKey}`,
    experimentRunId: 'run-1',
    fieldKey,
    blockId: 'b-1',
    paragraphIndex: 0,
    start: 0,
    end: value.length,
    sourceText: value,
    aiExactValue: value,
    evidenceText: value,
    resolvedExactValue: value,
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    reasoning: 'test',
    confidence: 'high',
    confidenceScore: 0.95,
    validationStatus: 'valid',
    approvalStatus: 'approved',
    pairedFieldGroup: null,
  }
}

function main() {
  const genericTable = tableBlocks([['Lokalizacja', NOWICCY_FIXTURE.location]])
  const receptionApproved = approvedMapping(
    'reception_location',
    NOWICCY_FIXTURE.location,
  )

  const presence = evaluateSourceFieldPresence({
    blocks: genericTable,
    fieldKey: 'reception_location',
    mappings: [receptionApproved],
  })
  assertEq(presence.presence, 'present_supported_value', '5 generic lokalizacja')
  assert(presence.requiresMapping, '5 requires mapping')

  const capability = deriveEventLocationCapability({
    blocks: genericTable,
    mappings: [receptionApproved],
  })
  assertEq(capability.mode, 'single_general_location', '6 single general location')
  assertEq(capability.presentKeys.length, 1, '6 one location key')

  const stageBlocks = blocksFromPlainParagraphs([
    'przygotowania Panny Młodej i Pana Młodego (do 2h);',
    'ceremonię zaślubin;',
    `Miejsce przyjęcia: ${NOWICCY_FIXTURE.location}`,
  ])
  const required = requiredLocationKeys({
    blocks: stageBlocks,
    mappings: [receptionApproved],
  })
  assertEq(required.length, 1, '7 stage mention does not add locations')
  assertEq(required[0], 'reception_location', '7 only reception required')

  console.log('ok — locationRequirementDerivation')
}

void main()
