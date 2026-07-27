/**
 * Logical field review grouping tests.
 * Run: npm run test:logical-field-review-grouping
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { groupMappingsByLogicalField } from './logicalFieldGrouping'
import { unresolvedOccurrenceBlockers } from './occurrenceResolution'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'
import { createMappingId } from './mappingId'
import type { ContractGenerationInput, ValidatedAiMapping } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

const generationInput: ContractGenerationInput = {
  currentDate: '01.01.2027',
  weddingDate: '01.07.2027',
  clients: [{ id: '1', firstName: 'A', lastName: 'B', fullName: 'A B' }],
  locations: { reception: 'Lwowska, 34-144 Izdebnik, Polska' },
  finances: {
    contractValue: 6000,
    contractValueFormatted: '6 000 zł',
    contractValueWords: 'sześć tysięcy',
    depositAmount: 0,
    depositAmountFormatted: '0 zł',
    depositAmountWords: 'zero złotych',
    remainingAmount: 6000,
    remainingAmountFormatted: '6 000 zł',
    remainingAmountWords: 'sześć tysięcy złotych',
    payments: [],
  },
  package: { id: 'p', name: 'Video' },
}

function main() {
  const blocks = blocksFromPlainParagraphs([
    `Miejsce przyjęcia: ${NOWICCY_FIXTURE.location}`,
    NOWICCY_FIXTURE.receptionProse,
  ])
  const tableBlock = blocks[0]!
  const start = tableBlock.text.indexOf(NOWICCY_FIXTURE.location)
  const primary: ValidatedAiMapping = {
    id: createMappingId({
      experimentRunId: 'run',
      fieldKey: 'reception_location',
      blockId: tableBlock.id,
      start,
      end: start + NOWICCY_FIXTURE.location.length,
    }),
    fieldKey: 'reception_location',
    blockId: tableBlock.id,
    paragraphIndex: tableBlock.paragraphIndex,
    start,
    end: start + NOWICCY_FIXTURE.location.length,
    sourceText: NOWICCY_FIXTURE.location,
    aiExactValue: NOWICCY_FIXTURE.location,
    evidenceText: tableBlock.text,
    resolvedExactValue: NOWICCY_FIXTURE.location,
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    confidence: 'high',
    confidenceScore: 0.95,
    validationStatus: 'valid',
    approvalStatus: 'approved',
    pairedFieldGroup: null,
    occurrenceOrigin: 'ai_proposal',
  }

  const supplemented = supplementOccurrenceMappings({
    mappings: [primary],
    blocks,
    experimentRunId: 'run',
    generationInput,
  })

  const groups = groupMappingsByLogicalField({
    mappings: supplemented,
    generationInput,
  })
  const reception = groups.find((g) => g.fieldKey === 'reception_location')!
  assertEq(reception.physicalMappings.length, 2, 'group has two occurrences')

  const onlyPrimaryApproved = supplemented.map((m) =>
    m.id === primary.id ? m : { ...m, approvalStatus: 'pending' as const },
  )
  assert(
    unresolvedOccurrenceBlockers(onlyPrimaryApproved).length === 1,
    '7 unreviewed second occurrence blocks readiness',
  )

  const ignored = supplemented.map((m) =>
    m.id === primary.id
      ? m
      : { ...m, approvalStatus: 'ignored_immutable' as const },
  )
  assertEq(unresolvedOccurrenceBlockers(ignored).length, 0, '9 ignored occurrence resolved')

  console.log('ok — logicalFieldReviewGrouping')
}

void main()
