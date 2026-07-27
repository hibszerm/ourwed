/**
 * Shared fixtures for experiment approval/readiness tests.
 */

import { blocksFromPlainParagraphs } from './experimentService'
import { NOWICCY_FIXTURE, nowiccyFixtureParagraphs } from './fixtures/nowiccyVideoContract'
import { createMappingId } from './mappingId'
import type {
  ContractFieldKey,
  IndexedDocxBlock,
  StructuredAiMappingResponse,
  ValidatedAiMapping,
} from './types'

export const TEST_RUN_ID = 'run-test-nowiccy-approval'

/** In-memory localStorage for Node test runs. */
export function installTestLocalStorage(): void {
  const memory: Record<string, string> = {}
  ;(globalThis as typeof globalThis & { localStorage?: Storage }).localStorage = {
    getItem: (key: string) => memory[key] ?? null,
    setItem: (key: string, value: string) => {
      memory[key] = value
    },
    removeItem: (key: string) => {
      delete memory[key]
    },
    clear: () => {
      for (const key of Object.keys(memory)) delete memory[key]
    },
    key: (index: number) => Object.keys(memory)[index] ?? null,
    get length() {
      return Object.keys(memory).length
    },
  } as Storage
}

export function nowiccyExtendedBlocks(): IndexedDocxBlock[] {
  return blocksFromPlainParagraphs([
    ...nowiccyFixtureParagraphs(),
    NOWICCY_FIXTURE.clientContactCell,
    NOWICCY_FIXTURE.para37Remuneration,
  ])
}

export function nowiccyStructuredResponse(): StructuredAiMappingResponse {
  return {
    responseVersion: '2026-07-v2',
    documentAssessment: {
      documentType: 'wedding_video_contract',
      clientPartyCapability: {
        physicalMode: 'composite',
        expectedPersonCount: 2,
      },
    },
    fields: [],
    unsupportedValues: [],
    immutableFindings: [],
    warnings: [
      {
        code: 'unsupported_payment_structure',
        message:
          'Payment term is relative (14 days before the event) rather than a concrete date.',
        blockId: null,
      },
    ],
  }
}

function baseMapping(
  input: {
    fieldKey: ContractFieldKey
    blockId: string
    paragraphIndex: number
    start: number
    end: number
    sourceText: string
    pairedFieldGroup?: string | null
  },
  runId = TEST_RUN_ID,
): ValidatedAiMapping {
  const id = createMappingId({
    experimentRunId: runId,
    fieldKey: input.fieldKey,
    blockId: input.blockId,
    start: input.start,
    end: input.end,
  })
  return {
    id,
    experimentRunId: runId,
    fieldKey: input.fieldKey,
    blockId: input.blockId,
    paragraphIndex: input.paragraphIndex,
    start: input.start,
    end: input.end,
    sourceText: input.sourceText,
    aiExactValue: input.sourceText,
    evidenceText: input.sourceText,
    resolvedExactValue: input.sourceText,
    resolutionMethod: 'ai_exact',
    occurrenceCount: 1,
    contextBefore: '',
    contextAfter: '',
    semanticRole: 'test',
    reasoning: 'fixture',
    confidence: 'high',
    confidenceScore: 0.95,
    validationStatus: 'valid',
    approvalStatus: 'pending',
    pairedFieldGroup: input.pairedFieldGroup ?? null,
    replacementValue: '',
  }
}

/** Eight valid Nowiccy mappings matching live OpenAI output shape. */
export function nowiccyEightPendingMappings(
  blocks = nowiccyExtendedBlocks(),
  runId = TEST_RUN_ID,
): ValidatedAiMapping[] {
  const byText = (text: string) => blocks.find((b) => b.text.includes(text))!

  const clientBlock = byText(NOWICCY_FIXTURE.clientParty)
  const dateBlock = byText(NOWICCY_FIXTURE.contractDateProse)
  const weddingBlock = byText('Data wydarzenia')
  const receptionBlock = byText('Miejsce przyjęcia')
  const contactBlock = byText('tel.')
  const moneyBlock = byText(NOWICCY_FIXTURE.totalFormatted)

  return [
    baseMapping(
      {
        fieldKey: 'couple_full_names',
        blockId: clientBlock.id,
        paragraphIndex: clientBlock.paragraphIndex,
        start: 0,
        end: NOWICCY_FIXTURE.clientParty.length,
        sourceText: NOWICCY_FIXTURE.clientParty,
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'client_address',
        blockId: contactBlock.id,
        paragraphIndex: contactBlock.paragraphIndex,
        start: contactBlock.text.indexOf('zam.'),
        end: contactBlock.text.indexOf('tel.') - 2,
        sourceText: 'zam. os. Piastowskie 5/9, 61-136 Poznań',
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'client_phone',
        blockId: contactBlock.id,
        paragraphIndex: contactBlock.paragraphIndex,
        start: contactBlock.text.indexOf('tel.'),
        end: contactBlock.text.length,
        sourceText: 'tel. 502 118 774',
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'contract_execution_date',
        blockId: dateBlock.id,
        paragraphIndex: dateBlock.paragraphIndex,
        start: dateBlock.text.indexOf(NOWICCY_FIXTURE.contractDate),
        end: dateBlock.text.indexOf(NOWICCY_FIXTURE.contractDate) + NOWICCY_FIXTURE.contractDate.length,
        sourceText: NOWICCY_FIXTURE.contractDate,
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'wedding_date',
        blockId: weddingBlock.id,
        paragraphIndex: weddingBlock.paragraphIndex,
        start: weddingBlock.text.indexOf(NOWICCY_FIXTURE.weddingDate),
        end: weddingBlock.text.indexOf(NOWICCY_FIXTURE.weddingDate) + NOWICCY_FIXTURE.weddingDate.length,
        sourceText: NOWICCY_FIXTURE.weddingDate,
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'reception_location',
        blockId: receptionBlock.id,
        paragraphIndex: receptionBlock.paragraphIndex,
        start: receptionBlock.text.indexOf(NOWICCY_FIXTURE.location),
        end: receptionBlock.text.indexOf(NOWICCY_FIXTURE.location) + NOWICCY_FIXTURE.location.length,
        sourceText: NOWICCY_FIXTURE.location,
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'contract_value_formatted',
        blockId: moneyBlock.id,
        paragraphIndex: moneyBlock.paragraphIndex,
        start: moneyBlock.text.indexOf(NOWICCY_FIXTURE.totalFormatted),
        end: moneyBlock.text.indexOf(NOWICCY_FIXTURE.totalFormatted) + NOWICCY_FIXTURE.totalFormatted.length,
        sourceText: NOWICCY_FIXTURE.totalFormatted,
        pairedFieldGroup: 'contract_value_pair_1',
      },
      runId,
    ),
    baseMapping(
      {
        fieldKey: 'contract_value_words',
        blockId: moneyBlock.id,
        paragraphIndex: moneyBlock.paragraphIndex,
        start: moneyBlock.text.indexOf(NOWICCY_FIXTURE.totalWords),
        end: moneyBlock.text.indexOf(NOWICCY_FIXTURE.totalWords) + NOWICCY_FIXTURE.totalWords.length,
        sourceText: NOWICCY_FIXTURE.totalWords,
        pairedFieldGroup: 'contract_value_pair_1',
      },
      runId,
    ),
  ]
}

export function minimalExperimentResult(
  mappings: ValidatedAiMapping[],
  blocks = nowiccyExtendedBlocks(),
  runId = TEST_RUN_ID,
) {
  return {
    run: {
      id: runId,
      templateId: 'tpl-test',
      packageId: 'pkg-test',
      weddingId: 'wed-test',
      mode: 'structured_mapping' as const,
      status: 'completed' as const,
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      timing: { totalMs: 100 },
    },
    mode: 'structured_mapping' as const,
    indexedBlocks: blocks,
    generationInput: {
      currentDate: '02.02.2027 r.',
      weddingDate: '24.07.2027 r.',
      clients: [
        {
          id: 'c1',
          firstName: 'Michał',
          lastName: 'Nowicki',
          fullName: 'Michał Nowicki',
          address: 'os. Piastowskie 5/9, 61-136 Poznań',
          phone: '502 118 774',
        },
        {
          id: 'c2',
          firstName: 'Julia',
          lastName: 'Nowicka',
          fullName: 'Julia Nowicka',
        },
      ],
      locations: {
        reception: 'Pałac Rydzyna, Rydzyna',
      },
      finances: {
        contractValue: 6000,
        contractValueFormatted: '6 000 zł',
        contractValueWords: 'sześć tysięcy złotych',
        depositAmount: 0,
        depositAmountFormatted: '0 zł',
        depositAmountWords: 'zero złotych',
        remainingAmount: 6000,
        remainingAmountFormatted: '6 000 zł',
        remainingAmountWords: 'sześć tysięcy złotych',
        payments: [],
      },
      package: {
        id: 'pkg-test',
        name: 'Video',
      },
    },
    structuredMapping: nowiccyStructuredResponse(),
    validatedMappings: mappings,
    mappingPhase: 'review' as const,
    metrics: {
      requiredFieldsDetected: 4,
      optionalFieldsDetected: 4,
      invalidMappings: 0,
      unauthorizedChanges: 0,
      fieldsManuallyCorrected: 0,
      generationSuccess: true,
      auditStatus: 'needs_review',
      requestCount: 1,
      totalDurationMs: 100,
      estimatedCostPln: 'Brak danych' as const,
      changedSourceBlocks: 0,
      rendererOperations: 0,
      approvedMappings: 0,
      plannedRendererOperations: 0,
    },
  }
}
