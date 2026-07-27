/**
 * Multiple physical mappings per logical field tests.
 * Run: npm run test:multiple-physical-mappings-per-field
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import { createMappingId } from './mappingId'
import { mappingsForFieldKey } from './logicalFieldGrouping'
import { supplementOccurrenceMappings } from './supplementalOccurrenceDetection'
import type { ValidatedAiMapping } from './types'

function assertEq<T>(a: T, b: T, m: string) {
  if (a !== b) throw new Error(`${m}: ${String(a)} !== ${String(b)}`)
}

function primaryReception(blocks: ReturnType<typeof blocksFromPlainParagraphs>): ValidatedAiMapping {
  const block = blocks.find((b) => b.text.includes(NOWICCY_FIXTURE.location))!
  const start = block.text.indexOf(NOWICCY_FIXTURE.location)
  return {
    id: createMappingId({
      experimentRunId: 'run-1',
      fieldKey: 'reception_location',
      blockId: block.id,
      start,
      end: start + NOWICCY_FIXTURE.location.length,
    }),
    experimentRunId: 'run-1',
    fieldKey: 'reception_location',
    blockId: block.id,
    paragraphIndex: block.paragraphIndex,
    start,
    end: start + NOWICCY_FIXTURE.location.length,
    sourceText: NOWICCY_FIXTURE.location,
    aiExactValue: NOWICCY_FIXTURE.location,
    evidenceText: block.text,
    resolvedExactValue: NOWICCY_FIXTURE.location,
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    confidence: 'high',
    confidenceScore: 0.95,
    validationStatus: 'valid',
    approvalStatus: 'pending',
    pairedFieldGroup: null,
    occurrenceOrigin: 'ai_proposal',
  }
}

function main() {
  const blocks = blocksFromPlainParagraphs([
    `Miejsce przyjęcia: ${NOWICCY_FIXTURE.location}`,
    NOWICCY_FIXTURE.receptionProse,
  ])
  const primary = primaryReception(blocks)
  const supplemented = supplementOccurrenceMappings({
    mappings: [primary],
    blocks,
    experimentRunId: 'run-1',
  })

  const receptionMappings = mappingsForFieldKey(supplemented, 'reception_location')
  assertEq(receptionMappings.length, 2, '1 two physical mappings same fieldKey')
  assertEq(
    receptionMappings.filter((m) => m.occurrenceOrigin === 'validator_detected').length,
    1,
    '1 validator detected second occurrence',
  )

  const uniqueIds = new Set(receptionMappings.map((m) => m.id))
  assertEq(uniqueIds.size, 2, '3 no deduplication by fieldKey')

  console.log('ok — multiplePhysicalMappingsPerField')
}

void main()
