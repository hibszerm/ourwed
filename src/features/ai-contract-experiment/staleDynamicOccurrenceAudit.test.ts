/**
 * Stale dynamic occurrence audit tests.
 * Run: npm run test:stale-dynamic-occurrence-audit
 */

import { auditStaleDynamicOccurrences } from './staleDynamicOccurrenceAudit'
import { createMappingId } from './mappingId'
import type { IndexedDocxBlock, ValidatedAiMapping } from './types'

function assert(c: boolean, m: string) {
  if (!c) throw new Error(m)
}

function main() {
  const blocks: IndexedDocxBlock[] = [
    {
      id: 'para-5',
      kind: 'paragraph',
      paragraphIndex: 5,
      text: 'Pałac Rydzyna, Rydzyna',
      runs: [],
    },
    {
      id: 'para-16',
      kind: 'paragraph',
      paragraphIndex: 16,
      text: 'wjazd i powitanie gości w Pałacu Rydzyna;',
      runs: [],
    },
  ]

  const tableMapping: ValidatedAiMapping = {
    id: createMappingId({
      experimentRunId: 'run',
      fieldKey: 'reception_location',
      blockId: 'para-5',
      start: 0,
      end: 21,
    }),
    fieldKey: 'reception_location',
    blockId: 'para-5',
    paragraphIndex: 5,
    start: 0,
    end: 21,
    sourceText: 'Pałac Rydzyna, Rydzyna',
    aiExactValue: 'Pałac Rydzyna, Rydzyna',
    evidenceText: 'Pałac Rydzyna, Rydzyna',
    resolvedExactValue: 'Pałac Rydzyna, Rydzyna',
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    confidence: 'high',
    confidenceScore: 0.9,
    validationStatus: 'valid',
    approvalStatus: 'approved',
    pairedFieldGroup: null,
    occurrenceOrigin: 'ai_proposal',
  }

  const proseMapping: ValidatedAiMapping = {
    id: createMappingId({
      experimentRunId: 'run',
      fieldKey: 'reception_location',
      blockId: 'para-16',
      start: 28,
      end: 42,
    }),
    fieldKey: 'reception_location',
    blockId: 'para-16',
    paragraphIndex: 16,
    start: 28,
    end: 42,
    sourceText: 'Pałacu Rydzyna',
    aiExactValue: 'Pałacu Rydzyna',
    evidenceText: blocks[1]!.text,
    resolvedExactValue: 'Pałacu Rydzyna',
    resolutionMethod: 'refined_by_validator',
    occurrenceCount: 1,
    confidence: 'medium',
    confidenceScore: 0.75,
    validationStatus: 'needs_review',
    approvalStatus: 'pending',
    pairedFieldGroup: null,
    occurrenceOrigin: 'validator_detected',
    relatedPrimaryMappingId: tableMapping.id,
    occurrenceReplacementMode: 'manual_review_required',
  }

  const bindings = [
    {
      id: tableMapping.id!,
      experimentRunId: 'run',
      fieldKey: 'reception_location' as const,
      blockId: 'para-5',
      paragraphIndex: 5,
      start: 0,
      end: 21,
      sourceText: 'Pałac Rydzyna, Rydzyna',
      replacementValue: 'Lwowska, 34-144 Izdebnik, Polska',
      origin: 'ai_exact' as const,
    },
  ]

  const issues = auditStaleDynamicOccurrences({
    sourceBlocks: blocks,
    outputParagraphs: [
      { index: 5, text: 'Lwowska, 34-144 Izdebnik, Polska' },
      { index: 16, text: 'wjazd i powitanie gości w Pałacu Rydzyna;' },
    ],
    mappings: [tableMapping, proseMapping],
    bindings,
  })

  assert(issues.length === 1, '11 stale occurrence detected')
  assert(issues[0]!.code === 'stale_dynamic_occurrence', '11 code')
  assert(issues[0]!.blockId === 'para-16', '11 para-16')

  const resolved = auditStaleDynamicOccurrences({
    sourceBlocks: blocks,
    outputParagraphs: [
      { index: 5, text: 'Lwowska, 34-144 Izdebnik, Polska' },
      { index: 16, text: 'wjazd i powitanie gości w Izdebniku;' },
    ],
    mappings: [
      tableMapping,
      { ...proseMapping, approvalStatus: 'approved', customReplacementValue: 'Izdebniku' },
    ],
    bindings: [
      ...bindings,
      {
        id: proseMapping.id!,
        experimentRunId: 'run',
        fieldKey: 'reception_location',
        blockId: 'para-16',
        paragraphIndex: 16,
        start: 28,
        end: 42,
        sourceText: 'Pałacu Rydzyna',
        replacementValue: 'Izdebniku',
        origin: 'refined_by_validator',
      },
    ],
  })
  assert(resolved.length === 0, '12 all resolved audit safe')

  console.log('ok — staleDynamicOccurrenceAudit')
}

void main()
