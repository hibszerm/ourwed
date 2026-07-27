/**
 * Location occurrence detection tests.
 * Run: npm run test:location-occurrence-detection
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE } from './fixtures/nowiccyVideoContract'
import {
  detectRelatedLocationOccurrences,
} from './locationOccurrenceDetection'
import { createMappingId } from './mappingId'
import type { ValidatedAiMapping } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function primary(blocks: ReturnType<typeof blocksFromPlainParagraphs>): ValidatedAiMapping {
  const b = blocks[0]!
  const start = b.text.indexOf('Pałac Rydzyna')
  return {
    id: createMappingId({
      experimentRunId: 'run',
      fieldKey: 'reception_location',
      blockId: b.id,
      start,
      end: start + 'Pałac Rydzyna, Rydzyna'.length,
    }),
    fieldKey: 'reception_location',
    blockId: b.id,
    paragraphIndex: b.paragraphIndex,
    start,
    end: start + 'Pałac Rydzyna, Rydzyna'.length,
    sourceText: 'Pałac Rydzyna, Rydzyna',
    aiExactValue: 'Pałac Rydzyna, Rydzyna',
    evidenceText: b.text,
    resolvedExactValue: 'Pałac Rydzyna, Rydzyna',
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    confidence: 'high',
    confidenceScore: 0.9,
    validationStatus: 'valid',
    approvalStatus: 'pending',
    pairedFieldGroup: null,
  }
}

function main() {
  const blocks = blocksFromPlainParagraphs([
    `Lokalizacja: ${NOWICCY_FIXTURE.location}`,
    NOWICCY_FIXTURE.receptionProse,
    'Wykonawca ma siedzibę w Poznaniu.',
  ])
  const detected = detectRelatedLocationOccurrences({
    primary: primary(blocks),
    blocks,
    existingMappings: [],
  })

  assert(detected.length === 1, '2 inflected form detected')
  assert(detected[0]!.exactValue.includes('Pałacu'), '2 Pałacu Rydzyna')
  assert(detected[0]!.grammaticalForm === 'inflected', '2 inflected classification')

  const unrelated = blocksFromPlainParagraphs(['Wykonawca ma siedzibę w Poznaniu.'])
  const none = detectRelatedLocationOccurrences({
    primary: primary(blocksFromPlainParagraphs([`Lokalizacja: ${NOWICCY_FIXTURE.location}`])),
    blocks: unrelated,
    existingMappings: [],
  })
  assert(none.length === 0, '13 unrelated provider place not mapped')

  console.log('ok — locationOccurrenceDetection')
}

void main()
